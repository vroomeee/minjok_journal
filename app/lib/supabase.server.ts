import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { createClient as createSupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type SupabaseServerClient = ReturnType<typeof createServerClient<Database>>;
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
type UserProfileResult = { user: User | null; profile: ProfileRow | null };

type SupabaseRequestCache = {
  supabase?: SupabaseServerClient;
  headers?: Headers;
  userProfilePromise?: Promise<UserProfileResult>;
};

type RequestWithSupabaseCache = Request & {
  __supabaseCache?: SupabaseRequestCache;
};

function withSupabaseCache(request: Request) {
  return request as RequestWithSupabaseCache;
}

// Canonical place for creating a request-scoped Supabase client.
export function createSupabaseServerClient(request: Request) {
  const requestWithCache = withSupabaseCache(request);
  if (requestWithCache.__supabaseCache?.supabase && requestWithCache.__supabaseCache.headers) {
    return {
      supabase: requestWithCache.__supabaseCache.supabase,
      headers: requestWithCache.__supabaseCache.headers,
    };
  }

  const headers = new Headers();

  const supabase = createServerClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "").map((cookie) => ({
            name: cookie.name,
            value: cookie.value ?? "",
          }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            headers.append(
              "Set-Cookie",
              serializeCookieHeader(name, value, options)
            );
          });
        },
      },
    }
  );

  requestWithCache.__supabaseCache = { supabase, headers };

  return { supabase, headers };
}

const userProfileCache: Map<
  string,
  {
    ts: number;
    promise: Promise<UserProfileResult>;
  }
> = new Map();
const CACHE_WINDOW_MS = 30000;

// Fetch user and profile once per request; subsequent calls reuse the same promise.
export async function getUserAndProfile(request: Request) {
  const requestWithCache = withSupabaseCache(request);
  if (!requestWithCache.__supabaseCache) {
    requestWithCache.__supabaseCache = {};
  }
  if (requestWithCache.__supabaseCache.userProfilePromise) {
    return requestWithCache.__supabaseCache.userProfilePromise;
  }

  const { supabase } = createSupabaseServerClient(request);
  const cookieKey = request.headers.get("cookie") || "guest";
  const now = Date.now();
  const cached = userProfileCache.get(cookieKey);
  if (cached && now - cached.ts < CACHE_WINDOW_MS) {
    requestWithCache.__supabaseCache.userProfilePromise = cached.promise;
    return cached.promise;
  }

  const userProfilePromise = (async () => {
    // Skip auth check if no Supabase auth cookies exist (avoids unnecessary refresh attempts)
    const cookies = parseCookieHeader(request.headers.get("Cookie") ?? "");
    const hasAuthCookies = cookies.some((c) =>
      c.name.includes("auth-token") ||
      c.name.includes("sb-") // Supabase cookie prefix
    );

    if (!hasAuthCookies) {
      return { user: null, profile: null };
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      if (
        error.name === "AuthSessionMissingError" ||
        error.status === 400 ||
        error.code === "user_not_found"
      ) {
        // Clear invalid auth cookies to prevent repeated refresh token errors
        try {
          await supabase.auth.signOut({ scope: "local" });
        } catch {
          // Ignore signOut errors - cookies may already be invalid
        }
        // Remove from cache so subsequent requests also clear cookies
        userProfileCache.delete(cookieKey);
        return { user: null, profile: null };
      }
      throw error;
    }

    if (!user) return { user: null, profile: null };

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return { user, profile: null };
    }

    return { user, profile };
  })();

  requestWithCache.__supabaseCache.userProfilePromise = userProfilePromise;
  userProfileCache.set(cookieKey, { ts: now, promise: userProfilePromise });
  return userProfilePromise;
}

// Service-role client for privileged server-only operations (bypasses RLS)
// Returns null when the service key is not configured.
export function createSupabaseAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;

  const supabase = createSupabaseClient<Database>(
    process.env.SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );

  return { supabase };
}

// Get the current user session from server-side
export async function requireUser(request: Request) {
  const { user } = await getUserAndProfile(request);
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return user;
}

// Get user profile with roles
export async function getUserProfile(request: Request) {
  const { user, profile } = await getUserAndProfile(request);
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  if (!profile) {
    throw new Response("Profile not found", { status: 404 });
  }

  return { user, profile };
}

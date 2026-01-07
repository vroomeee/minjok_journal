import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { createClient as createSupabaseClient, type User } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Server-side Supabase client creation
// This is the canonical place for creating Supabase clients
export function createSupabaseServerClient(request: Request) {
  const reqAny = request as any;
  if (reqAny.__supabaseCache?.supabase && reqAny.__supabaseCache.headers) {
    return reqAny.__supabaseCache as { supabase: ReturnType<typeof createServerClient<Database>>; headers: Headers };
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

  reqAny.__supabaseCache = { supabase, headers };

  return { supabase, headers };
}

const userProfileCache: Map<
  string,
  {
    ts: number;
    promise: Promise<{ user: User | null; profile: Database["public"]["Tables"]["profiles"]["Row"] | null }>;
  }
> = new Map();
const CACHE_WINDOW_MS = 5000;

// Fetch user and profile once per request; subsequent calls reuse the same promise.
export async function getUserAndProfile(request: Request) {
  const reqAny = request as any;
  if (!reqAny.__supabaseCache) {
    reqAny.__supabaseCache = {};
  }
  if (reqAny.__supabaseCache.userProfilePromise) {
    return reqAny.__supabaseCache.userProfilePromise as Promise<{
      user: User | null;
      profile: Database["public"]["Tables"]["profiles"]["Row"] | null;
    }>;
  }

  const { supabase } = createSupabaseServerClient(request);
  const cookieKey = request.headers.get("cookie") || "guest";
  const now = Date.now();
  const cached = userProfileCache.get(cookieKey);
  if (cached && now - cached.ts < CACHE_WINDOW_MS) {
    reqAny.__supabaseCache.userProfilePromise = cached.promise;
    return cached.promise;
  }

  const userProfilePromise = (async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      if (error.name === "AuthSessionMissingError" || error.status === 400) {
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

  reqAny.__supabaseCache.userProfilePromise = userProfilePromise;
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

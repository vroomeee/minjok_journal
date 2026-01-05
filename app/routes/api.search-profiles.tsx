import type { Route } from "./+types/api.search-profiles";
import { createSupabaseServerClient } from "~/lib/supabase.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const excludeId = url.searchParams.get("userId") || null;
  if (q.length < 2) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role_type")
    .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
    .neq("id", excludeId || "")
    .limit(10);

  if (error) {
    return new Response(
      JSON.stringify({ results: [], error: "Search failed" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response(JSON.stringify({ results: data || [] }), {
    headers: { "Content-Type": "application/json" },
  });
}

export default function ApiSearchProfiles() {
  return null;
}

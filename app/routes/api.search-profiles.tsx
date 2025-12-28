import type { Route } from "./+types/api.search-profiles";
import { json } from "react-router";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return json({ results: [] });

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role_type")
    .or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
    .neq("id", user.id)
    .limit(10);

  if (error) {
    return json({ results: [], error: "Search failed" }, { status: 500 });
  }

  return json({ results: data || [] });
}

export default function ApiSearchProfiles() {
  return null;
}

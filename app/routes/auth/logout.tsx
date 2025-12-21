import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { createSupabaseServerClient } from "~/lib/supabase.server";

// Server-side action for logout
export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request);

  await supabase.auth.signOut();

  return redirect("/", { headers });
}

// Loader redirects to home if accessed via GET
export async function loader() {
  return redirect("/");
}

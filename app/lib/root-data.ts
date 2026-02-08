import { useRouteLoaderData } from "react-router";
import type { Database } from "./database.types";

export type RootUser = {
  id: string;
  email?: string | null;
};

// Profiles come from Supabase where role_type is currently string|null.
export type RootProfile = Partial<
  Pick<
    Database["public"]["Tables"]["profiles"]["Row"],
    "id" | "email" | "full_name" | "intro" | "role_type"
  >
>;

export type RootLoaderData = {
  ENV?: {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
  };
  user?: RootUser | null;
  profile?: RootProfile | null;
};

export function useRootLoaderData() {
  return useRouteLoaderData("root") as RootLoaderData | null;
}

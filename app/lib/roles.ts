export const APP_ROLES = ["mentor", "mentee", "admin", "prof"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function isAppRole(value: string | null | undefined): value is AppRole {
  if (!value) return false;
  return (APP_ROLES as readonly string[]).includes(value);
}

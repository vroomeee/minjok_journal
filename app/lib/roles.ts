export const APP_ROLES = ["mentor", "mentee", "admin", "prof"] as const;
export const REVIEW_ROLES = ["mentor", "admin", "prof"] as const;

export type AppRole = (typeof APP_ROLES)[number];
export type ReviewRole = (typeof REVIEW_ROLES)[number];

export function isAppRole(value: string | null | undefined): value is AppRole {
  if (!value) return false;
  return (APP_ROLES as readonly string[]).includes(value);
}

export function isReviewRole(
  value: string | null | undefined,
): value is ReviewRole {
  if (!value) return false;
  return (REVIEW_ROLES as readonly string[]).includes(value);
}

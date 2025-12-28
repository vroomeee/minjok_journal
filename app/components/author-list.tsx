import { RoleBadge } from "./role-badge";
import { UserLink } from "./user-link";

type Author = {
  profile_id?: string;
  profile?: {
    id?: string;
    full_name?: string | null;
    email?: string | null;
    role_type?: "mentor" | "mentee" | "admin" | "prof";
  } | null;
};

export function AuthorList({
  authors,
  showBadges = false,
}: {
  authors: Author[] | undefined;
  showBadges?: boolean;
}) {
  if (!authors || authors.length === 0) {
    return <span className="muted">Unknown authors</span>;
  }

  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {authors.map((a, idx) => (
        <div key={a.profile?.id || idx} className="row" style={{ gap: 4, alignItems: "center" }}>
          <UserLink user={a.profile} fallback="Unknown" />
          {showBadges && a.profile?.role_type && (
            <RoleBadge role={a.profile.role_type} className="text-xs py-0 px-1" />
          )}
          {idx < authors.length - 1 && <span className="muted">•</span>}
        </div>
      ))}
    </div>
  );
}

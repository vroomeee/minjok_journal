import { Link } from "react-router";

type User = {
  id?: string;
  email?: string | null;
  full_name?: string | null;
};

export function UserLink({ user, fallback }: { user?: User | null; fallback?: string }) {
  const label = user?.full_name || user?.email || fallback || "Unknown";
  if (user?.id) {
    return (
      <Link to={`/profile/${user.id}`} className="nav-link" style={{ padding: 0 }}>
        {label}
      </Link>
    );
  }
  return <span className="muted">{label}</span>;
}

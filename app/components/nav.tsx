import { Link, Form, useRouteLoaderData } from "react-router";

interface NavProps {
  user?: {
    id: string;
    email?: string;
  };
  profile?: {
    email: string | null;
    role_type: "mentor" | "mentee" | "admin" | "prof";
  };
}

export function Nav({ user, profile }: NavProps) {
  const rootData = useRouteLoaderData("root") as
    | {
        user?: { id: string; email?: string };
        profile?: { email: string | null; role_type: any };
      }
    | undefined;
  const resolvedUser = user ?? rootData?.user;
  const resolvedProfile = profile ?? rootData?.profile;

  const isAdmin = resolvedProfile?.role_type === "admin";

  return (
    <nav className="nav">
      <div className="nav-inner">
        <div className="nav-links" style={{ gap: 16 }}>
          <Link to="/" className="nav-logo">
            Minjok Journal
          </Link>
          <div className="nav-links">
            <Link to="/papers" className="nav-link">
              Papers
            </Link>
            <Link to="/issues" className="nav-link">
              Issues
            </Link>
            <Link to="/volumes" className="nav-link">
              Volumes
            </Link>
            {profile &&
              (profile.role_type === "mentor" ||
                profile.role_type === "prof" ||
                profile.role_type === "admin") && (
                <Link to="/review" className="nav-link">
                  Review Queue
                </Link>
              )}
            <Link to="/qna" className="nav-link">
              Q&A
            </Link>
            <Link to="/board" className="nav-link">
              Board
            </Link>
            <Link to="/about" className="nav-link">
              About
            </Link>
            {isAdmin && (
              <Link to="/admin" className="nav-link">
                Admin
              </Link>
            )}
          </div>
        </div>

        <div className="nav-links" style={{ gap: 10 }}>
          {resolvedUser && resolvedProfile ? (
            <>
              <Link to="/my-papers" className="nav-link">
                My Papers
              </Link>
              <Link to={`/profile/${resolvedUser.id}`} className="nav-link">
                <span className="pill">
                  {resolvedProfile.email || resolvedUser.email}
                </span>
              </Link>
              <Form method="post" action="/auth/logout">
                <button
                  type="submit"
                  className="btn btn-ghost"
                  style={{ padding: "6px 10px" }}
                >
                  Logout
                </button>
              </Form>
            </>
          ) : (
            <>
              <Link to="/auth/login" className="nav-link">
                Login
              </Link>
              <Link
                to="/auth/signup"
                className="btn btn-accent"
                style={{ padding: "6px 12px" }}
              >
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

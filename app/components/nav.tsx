import { Link, Form } from "react-router";
import type { RootProfile, RootUser } from "~/lib/root-data";
import { useRootLoaderData } from "~/lib/root-data";

interface NavProps {
  user?: RootUser;
  profile?: RootProfile;
}

export function Nav({ user, profile }: NavProps) {
  const rootData = useRootLoaderData();
  const resolvedUser = user ?? rootData?.user;
  const resolvedProfile = profile ?? rootData?.profile;

  const isAdmin = resolvedProfile?.role_type === "admin";

  return (
    <nav className="nav">
      <div className="nav-inner">
        <div className="nav-links" style={{ gap: 16 }}>
          <Link to="/" className="nav-logo" prefetch="intent">
            Minjok Journal
          </Link>
          <div className="nav-links">
            <Link to="/papers" className="nav-link" prefetch="intent">
              Papers
            </Link>
            <Link to="/issues" className="nav-link" prefetch="intent">
              Issues
            </Link>
            <Link to="/volumes" className="nav-link" prefetch="intent">
              Volumes
            </Link>
            {profile &&
              (profile.role_type === "mentor" ||
                profile.role_type === "prof" ||
                profile.role_type === "admin") && (
                <Link to="/review" className="nav-link" prefetch="intent">
                  Review Queue
                </Link>
              )}
            <Link to="/qna" className="nav-link" prefetch="intent">
              Q&A
            </Link>
            <Link to="/board" className="nav-link" prefetch="intent">
              Board
            </Link>
            <Link to="/about" className="nav-link" prefetch="intent">
              About
            </Link>
            {isAdmin && (
              <Link to="/admin" className="nav-link" prefetch="intent">
                Admin
              </Link>
            )}
          </div>
        </div>

        <div className="nav-links" style={{ gap: 10 }}>
          {resolvedUser && resolvedProfile ? (
            <>
              <Link to="/my-papers" className="nav-link" prefetch="intent">
                My Papers
              </Link>
              <Link to={`/profile/${resolvedUser.id}`} className="nav-link" prefetch="intent">
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
              <Link to="/auth/login" className="nav-link" prefetch="intent">
                Login
              </Link>
              <Link
                to="/auth/signup"
                className="btn btn-accent"
                prefetch="intent"
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

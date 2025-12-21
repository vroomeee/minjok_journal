import { Link, Form } from "react-router";

interface NavProps {
  user?: {
    id: string;
    email?: string;
  };
  profile?: {
    username: string | null;
    role_type: "mentor" | "mentee";
    admin_type: "admin" | "user";
  };
}

export function Nav({ user, profile }: NavProps) {
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
            <Link to="/review" className="nav-link">
              Review Queue
            </Link>
            <Link to="/qna" className="nav-link">
              Q&A
            </Link>
            <Link to="/board" className="nav-link">
              Board
            </Link>
            <Link to="/about" className="nav-link">
              About
            </Link>
          </div>
        </div>

        <div className="nav-links" style={{ gap: 10 }}>
          {user && profile ? (
            <>
              <Link to="/my-papers" className="nav-link">
                My Papers
              </Link>
              <Link to={`/profile/${user.id}`} className="nav-link">
                <span className="pill">{profile.username || user.email}</span>
              </Link>
              <Form method="post" action="/auth/logout">
                <button type="submit" className="btn btn-ghost" style={{ padding: "6px 10px" }}>
                  Logout
                </button>
              </Form>
            </>
          ) : (
            <>
              <Link to="/auth/login" className="nav-link">
                Login
              </Link>
              <Link to="/auth/signup" className="btn btn-accent" style={{ padding: "6px 12px" }}>
                Sign Up
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

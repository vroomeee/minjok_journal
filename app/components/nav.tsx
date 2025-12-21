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
    <nav className="bg-white shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link to="/" className="text-xl font-bold text-gray-900">
              민족 Journal
            </Link>

            <div className="hidden md:flex space-x-4">
              <Link
                to="/papers"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Papers
              </Link>
              <Link
                to="/review"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Review Queue
              </Link>
              <Link
                to="/qna"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                Q&A
              </Link>
              <Link
                to="/board"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                게시판
              </Link>
              <Link
                to="/about"
                className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium"
              >
                About
              </Link>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {user && profile ? (
              <>
                <Link
                  to="/my-papers"
                  className="text-gray-600 hover:text-gray-900 text-sm font-medium"
                >
                  My Papers
                </Link>
                <Link
                  to={`/profile/${user.id}`}
                  className="flex items-center space-x-2"
                >
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      profile.role_type === "mentor"
                        ? "bg-yellow-500 text-yellow-900"
                        : "bg-green-500 text-green-900"
                    }`}
                  >
                    {profile.username || user.email}
                  </span>
                </Link>
                <Form method="post" action="/auth/logout">
                  <button
                    type="submit"
                    className="text-gray-600 hover:text-gray-900 text-sm font-medium"
                  >
                    Logout
                  </button>
                </Form>
              </>
            ) : (
              <>
                <Link
                  to="/auth/login"
                  className="text-gray-600 hover:text-gray-900 text-sm font-medium"
                >
                  Login
                </Link>
                <Link
                  to="/auth/signup"
                  className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

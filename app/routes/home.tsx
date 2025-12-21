import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

// Server-side loader to get user info
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  return { user, profile };
}

export default function Home() {
  const { user, profile } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <Nav user={user || undefined} profile={profile || undefined} />
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            민족 Journal
          </h1>
          <p className="text-xl text-gray-600 mb-12">
            Academic Paper Review Platform for Mentors and Mentees
          </p>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-3">Upload & Review</h3>
              <p className="text-gray-600">
                Submit academic papers with version control and receive detailed
                reviews
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-3">Q&A System</h3>
              <p className="text-gray-600">
                Ask questions and get expert answers from mentors
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold mb-3">Community Board</h3>
              <p className="text-gray-600">
                Stay updated with announcements and discussions
              </p>
            </div>
          </div>

          <div className="flex gap-4 justify-center">
            <Link
              to="/papers"
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Browse Papers
            </Link>
            {!user && (
              <Link
                to="/auth/login"
                className="px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

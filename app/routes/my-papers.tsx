import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/my-papers";
import { requireUser, createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

// Server-side loader - require authentication
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  // Fetch current user's profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Fetch user's papers
  const { data: papers } = await supabase
    .from("articles")
    .select("*")
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });

  return { papers: papers || [], user, profile };
}

export default function MyPapers() {
  const { papers, user, profile } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav user={user} profile={profile || undefined} />

      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Papers</h1>
          <Link
            to="/papers/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            Submit New Paper
          </Link>
        </div>

        {papers.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 mb-4">
              You haven't submitted any papers yet.
            </p>
            <Link
              to="/papers/new"
              className="inline-block bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Submit Your First Paper
            </Link>
          </div>
        ) : (
          <div className="grid gap-6">
            {papers.map((paper) => (
              <div
                key={paper.id}
                className="bg-white rounded-lg shadow hover:shadow-md transition p-6"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <Link
                      to={`/papers/${paper.id}`}
                      className="text-xl font-semibold text-gray-900 hover:text-blue-600"
                    >
                      {paper.title}
                    </Link>
                    <p className="text-sm text-gray-500 mt-2">
                      Created: {new Date(paper.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-500">
                      Last updated: {new Date(paper.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex flex-col items-end space-y-2">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        paper.status === "published"
                          ? "bg-green-100 text-green-800"
                          : paper.status === "in_review"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {paper.status}
                    </span>
                    <Link
                      to={`/papers/${paper.id}`}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                    >
                      Manage
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

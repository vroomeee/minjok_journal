import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/papers";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";

// Server-side loader to fetch all papers
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);

  // Get current user (optional - papers are public)
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

  // Fetch all papers with author info
  const { data: papers, error } = await supabase
    .from("articles")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        username,
        full_name,
        role_type
      )
    `
    )
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Response("Failed to load papers", { status: 500 });
  }

  return { papers: papers || [], user, profile };
}

export default function Papers() {
  const { papers, user, profile } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">All Papers</h1>
          {user && (
            <Link
              to="/papers/new"
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Submit New Paper
            </Link>
          )}
        </div>

        {papers.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No papers submitted yet.</p>
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
                    <div className="mt-2 flex items-center space-x-4">
                      <span className="text-sm text-gray-600">
                        by{" "}
                        {paper.author?.username || paper.author?.full_name}
                      </span>
                      {paper.author && (
                        <RoleBadge role={paper.author.role_type} />
                      )}
                      <span className="text-sm text-gray-500">
                        {new Date(paper.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div>
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

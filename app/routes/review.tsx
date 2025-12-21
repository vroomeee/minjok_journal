import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/review";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";

// Server-side loader to fetch papers in review
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);

  // Get current user (optional)
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

  // Fetch papers with status "in_review"
  const { data: papers } = await supabase
    .from("articles")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        username,
        full_name,
        role_type
      ),
      current_version:article_versions!current_version_id (
        id,
        version_number,
        created_at
      )
    `
    )
    .eq("status", "in_review")
    .order("updated_at", { ascending: false });

  return { papers: papers || [], user, profile };
}

export default function Review() {
  const { papers, user, profile } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Paper Review Queue
        </h1>

        {papers.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No papers in review at the moment.</p>
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
                        by {paper.author?.username || paper.author?.full_name}
                      </span>
                      {paper.author && (
                        <RoleBadge role={paper.author.role_type} />
                      )}
                      <span className="text-sm text-gray-500">
                        Submitted: {new Date(paper.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    {paper.current_version && (
                      <div className="mt-3">
                        <Link
                          to={`/papers/${paper.id}/versions/${paper.current_version.id}`}
                          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                        >
                          Review Version {paper.current_version.version_number}
                        </Link>
                      </div>
                    )}
                  </div>
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                    In Review
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

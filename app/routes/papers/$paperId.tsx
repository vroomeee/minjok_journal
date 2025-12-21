import { Link, useLoaderData, Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/$paperId";
import { createSupabaseServerClient, getUserProfile } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";

// Server-side loader to fetch paper details
export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { paperId } = params;

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

  // Fetch paper with author and versions
  const { data: paper, error } = await supabase
    .from("articles")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        username,
        full_name,
        role_type,
        admin_type
      ),
      versions:article_versions!article_versions_article_id_fkey (
        id,
        version_number,
        created_at,
        file_name,
        notes
      )
    `
    )
    .eq("id", paperId)
    .single();

  if (error || !paper) {
    console.error("Error fetching paper:", error);
    console.error("Paper ID:", paperId);
    throw new Response("Paper not found", { status: 404 });
  }

  // Sort versions by version number descending
  paper.versions?.sort((a, b) => b.version_number - a.version_number);

  return { paper, user, profile };
}

// Server-side action to delete paper or change status
export async function action({ request, params }: Route.ActionArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { paperId } = params;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    // Check if user is admin or author
    const { user, profile } = await getUserProfile(request);

    const { data: paper } = await supabase
      .from("articles")
      .select("author_id")
      .eq("id", paperId)
      .single();

    if (!paper || (paper.author_id !== user.id && profile.admin_type !== "admin")) {
      throw new Response("Unauthorized", { status: 403 });
    }

    const { error } = await supabase
      .from("articles")
      .delete()
      .eq("id", paperId);

    if (error) {
      return { error: "Failed to delete paper" };
    }

    return redirect("/papers");
  }

  if (intent === "updateStatus") {
    const newStatus = formData.get("status") as string;

    const { error } = await supabase
      .from("articles")
      .update({ status: newStatus })
      .eq("id", paperId);

    if (error) {
      return { error: "Failed to update status" };
    }

    return { success: true };
  }

  return null;
}

export default function PaperDetail() {
  const { paper, user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const isAuthor = user?.id === paper.author?.id;
  const isAdmin = profile?.admin_type === "admin";
  const canDelete = isAuthor || isAdmin;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="container mx-auto px-4 py-8">
        {actionData?.error && (
          <div className="mb-4 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{actionData.error}</p>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-8 mb-6">
          <div className="flex justify-between items-start mb-4">
            <h1 className="text-3xl font-bold text-gray-900">{paper.title}</h1>
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

          <div className="flex items-center space-x-4 mb-6">
            <span className="text-gray-600">
              by {paper.author?.username || paper.author?.full_name}
            </span>
            {paper.author && <RoleBadge role={paper.author.role_type} />}
            <span className="text-gray-500">
              {new Date(paper.created_at).toLocaleDateString()}
            </span>
          </div>

          {isAuthor && (
            <div className="mb-6 flex space-x-4">
              <Form method="post">
                <input type="hidden" name="intent" value="updateStatus" />
                <input type="hidden" name="status" value="in_review" />
                <button
                  type="submit"
                  className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
                >
                  Submit for Review
                </button>
              </Form>
              <Link
                to={`/papers/${paper.id}/new-version`}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Upload New Version
              </Link>
            </div>
          )}

          {canDelete && (
            <Form method="post" className="mt-4">
              <input type="hidden" name="intent" value="delete" />
              <button
                type="submit"
                onClick={(e) =>
                  !confirm("Are you sure you want to delete this paper?") &&
                  e.preventDefault()
                }
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
              >
                Delete Paper
              </button>
            </Form>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Versions</h2>

          {paper.versions && paper.versions.length > 0 ? (
            <div className="space-y-4">
              {paper.versions.map((version) => (
                <div
                  key={version.id}
                  className="border rounded-lg p-4 hover:border-blue-500 transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        Version {version.version_number}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {new Date(version.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {version.file_name}
                      </p>
                      {version.notes && (
                        <p className="text-sm text-gray-600 mt-2">
                          {version.notes}
                        </p>
                      )}
                    </div>
                    <Link
                      to={`/papers/${paper.id}/versions/${version.id}`}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                    >
                      View & Review
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">No versions uploaded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

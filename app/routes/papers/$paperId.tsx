import { Link, useLoaderData, Form, redirect, useActionData } from "react-router";
import { useState } from "react";
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
        storage_path,
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

  const activeVersionId =
    paper.current_version_id || paper.versions?.[0]?.id || null;

  let comments: any[] = [];
  if (activeVersionId) {
    const { data: commentsData } = await supabase
      .from("comments")
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
      .eq("article_id", paperId)
      .eq("version_id", activeVersionId)
      .is("parent_id", null)
      .order("created_at", { ascending: true });

    comments = commentsData || [];
  }

  const publishedVersion =
    paper.versions?.find((v) => v.id === paper.current_version_id) ||
    paper.versions?.[0] ||
    null;

  let publishedFileUrl: string | null = null;
  if (publishedVersion?.storage_path) {
    const { data: urlData } = supabase.storage
      .from("articles")
      .getPublicUrl(publishedVersion.storage_path);
    publishedFileUrl = urlData.publicUrl;
  }

  return {
    paper,
    user,
    profile,
    comments,
    activeVersionId,
    publishedVersion,
    publishedFileUrl,
  };
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

    const { user, profile } = await getUserProfile(request);
    const { data: paper } = await supabase
      .from("articles")
      .select("author_id, status")
      .eq("id", paperId)
      .single();

    if (!paper || (paper.author_id !== user.id && profile.admin_type !== "admin")) {
      throw new Response("Unauthorized", { status: 403 });
    }

    if (paper.status === "published") {
      return { error: "Paper is already published" };
    }

    const { error } = await supabase
      .from("articles")
      .update({ status: newStatus })
      .eq("id", paperId);

    if (error) {
      return { error: "Failed to update status" };
    }

    return { success: true };
  }

  if (intent === "publish") {
    const { user, profile } = await getUserProfile(request);

    const { data: paper } = await supabase
      .from("articles")
      .select("author_id, status")
      .eq("id", paperId)
      .single();

    if (!paper || (paper.author_id !== user.id && profile.admin_type !== "admin")) {
      throw new Response("Unauthorized", { status: 403 });
    }

    if (paper.status === "published") {
      return { error: "Paper is already published" };
    }

    const newTitle = (formData.get("publishTitle") as string) || paper.title;
    const newDescription = (formData.get("publishDescription") as string) || null;

    const { error } = await supabase
      .from("articles")
      .update({ status: "published", title: newTitle, description: newDescription })
      .eq("id", paperId);

    if (error) {
      return { error: "Failed to publish paper" };
    }

    return redirect(`/papers/${paperId}`);
  }

  if (intent === "unpublish") {
    const { user, profile } = await getUserProfile(request);

    const { data: paper } = await supabase
      .from("articles")
      .select("author_id, status")
      .eq("id", paperId)
      .single();

    if (!paper || (paper.author_id !== user.id && profile.admin_type !== "admin")) {
      throw new Response("Unauthorized", { status: 403 });
    }

    if (paper.status !== "published" && paper.status !== "in_review") {
      return { error: "Only published or in-review papers can be unpublished" };
    }

    const { error } = await supabase
      .from("articles")
      .update({ status: "draft" })
      .eq("id", paperId);

    if (error) {
      return { error: "Failed to unpublish paper" };
    }

    return redirect(`/papers/${paperId}`);
  }

  if (intent === "updateTitle") {
    const { user, profile } = await getUserProfile(request);
    const newTitle = formData.get("title") as string;
    if (!newTitle) {
      return { error: "Title is required" };
    }

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
      .update({ title: newTitle })
      .eq("id", paperId);

    if (error) {
      return { error: "Failed to update title" };
    }

    return redirect(`/papers/${paperId}`);
  }

  if (intent === "comment") {
    const { user } = await getUserProfile(request);
    const { data: paper } = await supabase
      .from("articles")
      .select(
        `status, current_version_id,
         versions:article_versions!article_versions_article_id_fkey (id, version_number)`
      )
      .eq("id", paperId)
      .single();

    if (!paper) {
      throw new Response("Paper not found", { status: 404 });
    }

    if (paper.status !== "published") {
      return { error: "Comments are only allowed on published papers" };
    }

    const targetVersionId =
      paper.current_version_id || paper.versions?.[0]?.id || null;
    if (!targetVersionId) {
      return { error: "No version available to attach the comment" };
    }

    const body = formData.get("body") as string;
    if (!body) {
      return { error: "Comment body is required" };
    }

    const { error } = await supabase.from("comments").insert({
      article_id: paperId,
      version_id: targetVersionId,
      author_id: user.id,
      body,
      parent_id: null,
    });

    if (error) {
      return { error: "Failed to post comment" };
    }

    return redirect(`/papers/${paperId}`);
  }

  return null;
}

export default function PaperDetail() {
  const { paper, user, profile, comments, activeVersionId, publishedVersion, publishedFileUrl } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const [showVersions, setShowVersions] = useState(paper.status !== "published");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState(paper.title);

  const isAuthor = user?.id === paper.author?.id;
  const isAdmin = profile?.admin_type === "admin";
  const canDelete = isAuthor || isAdmin;
  const canPublish = isAuthor || isAdmin;
  const canUploadNewVersion = isAuthor && paper.status !== "published";
  const canSubmitForReview = isAuthor && paper.status === "draft";
  const showComments = paper.status === "published" && !!activeVersionId;
  const truncateNotes = (notes?: string | null) =>
    notes && notes.length > 200 ? `${notes.slice(0, 200)}...` : notes;

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
          <div className="flex items-start justify-between gap-4 mb-2">
            {isEditingTitle && (isAuthor || isAdmin) ? (
              <Form
                method="post"
                className="flex items-center gap-3"
                onSubmit={() => setIsEditingTitle(false)}
              >
                <input type="hidden" name="intent" value="updateTitle" />
                <input
                  type="text"
                  name="title"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  className="text-3xl font-bold text-gray-900 bg-white border-b border-gray-300 focus:outline-none focus:border-blue-500"
                  required
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-gray-800 text-white rounded-md hover:bg-gray-900 text-sm"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingTitle(false);
                      setDraftTitle(paper.title);
                    }}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </Form>
            ) : (
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">{paper.title}</h1>
                {(isAuthor || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(true)}
                    className="px-3 py-1.5 bg-gray-800 text-white rounded-md hover:bg-gray-900 text-sm"
                  >
                    Edit Title
                  </button>
                )}
              </div>
            )}
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

          <div className="flex flex-col gap-2 mb-4">
            <div className="flex items-center space-x-4">
              <span className="text-gray-600">
                by {paper.author?.username || paper.author?.full_name}
              </span>
              {paper.author && <RoleBadge role={paper.author.role_type} />}
              <span className="text-gray-500">
                {new Date(paper.created_at).toLocaleDateString()}
              </span>
            </div>
            {paper.description && (
              <p className="text-sm text-gray-700">{paper.description}</p>
            )}
          </div>

          {(isAuthor || isAdmin) && (
            <div className="mb-6 flex flex-wrap items-center gap-3">
              {isAuthor && canSubmitForReview && (
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
              )}
              {isAuthor && canUploadNewVersion && (
                <Link
                  to={`/papers/${paper.id}/new-version`}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Upload New Version
                </Link>
              )}
              {canPublish && paper.status === "in_review" && (
                <Link
                  to={`/papers/${paper.id}/publish`}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Publish
                </Link>
              )}
              {canPublish && paper.status === "published" && (
                <Form method="post">
                  <input type="hidden" name="intent" value="unpublish" />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700"
                  >
                    Unpublish
                  </button>
                </Form>
              )}
              {canDelete && (
                <Form method="post">
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
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Versions</h2>
            {paper.status === "published" && (
              <button
                type="button"
                onClick={() => setShowVersions((prev) => !prev)}
                className="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 text-sm"
              >
                {showVersions ? "Hide Past Versions" : "View Past Versions"}
              </button>
            )}
          </div>

          {(showVersions || paper.status !== "published") && (
            <>
              {paper.versions && paper.versions.length > 0 ? (
                <div className="space-y-4">
                  {paper.versions.map((version) => (
                    <div
                      key={version.id}
                      className="border rounded-lg p-4 hover:border-blue-500 transition"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-gray-900">
                              Version {version.version_number}
                            </h3>
                            {paper.current_version_id === version.id &&
                              paper.status === "published" && (
                                <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-green-100 text-green-800">
                                  Published
                                </span>
                              )}
                          </div>
                          <p className="text-sm text-gray-500">
                            {new Date(version.created_at).toLocaleDateString()}
                          </p>
                          <p className="text-sm text-gray-600 mt-1">
                            {version.file_name}
                          </p>
                          {version.notes && (
                            <p className="text-sm text-gray-600 mt-2 break-words">
                              {truncateNotes(version.notes)}
                            </p>
                          )}
                        </div>
                        <Link
                          to={`/papers/${paper.id}/versions/${version.id}`}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm flex-shrink-0 whitespace-nowrap"
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
            </>
          )}
        </div>

        {paper.status === "published" && publishedVersion && (
          <div className="bg-white rounded-lg shadow p-8 mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Published Version
                </h2>
                <p className="text-sm text-gray-600">
                  {publishedVersion.file_name} (v{publishedVersion.version_number})
                </p>
              </div>
              {publishedFileUrl && (
                <a
                  href={publishedFileUrl}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download
                </a>
              )}
            </div>
            {publishedFileUrl &&
              publishedVersion.file_name.toLowerCase().endsWith(".pdf") && (
                <div className="mt-4">
                  <iframe
                    src={publishedFileUrl}
                    className="w-full h-[600px] border rounded"
                    title="Published File"
                  />
                </div>
              )}
          </div>
        )}

        {showComments && (
          <div className="bg-white rounded-lg shadow p-8 mt-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Paper Comments
            </h2>
            {user ? (
              <Form method="post" className="mb-6">
                <input type="hidden" name="intent" value="comment" />
                <textarea
                  name="body"
                  rows={3}
                  required
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  placeholder="Share feedback or peer review for this published paper..."
                />
                <button
                  type="submit"
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Post Comment
                </button>
              </Form>
            ) : (
              <p className="text-sm text-gray-500 mb-6">
                Please log in to leave a comment.
              </p>
            )}

            <div className="space-y-4">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="border-l-2 border-gray-200 pl-4"
                >
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-semibold text-sm text-gray-900">
                      {comment.author?.username || comment.author?.full_name}
                    </span>
                    {comment.author && (
                      <RoleBadge
                        role={comment.author.role_type}
                        className="text-xs py-0 px-1"
                      />
                    )}
                    <span className="text-xs text-gray-500">
                      {new Date(comment.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{comment.body}</p>
                </div>
              ))}

              {comments.length === 0 && (
                <p className="text-gray-500 text-sm">
                  No comments yet. Share your thoughts on this paper.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

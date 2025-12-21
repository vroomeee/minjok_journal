import {
  useLoaderData,
  Form,
  redirect,
  useActionData,
  useNavigation,
} from "react-router";
import type { Route } from "./+types/$paperId.versions.$versionId";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
  requireUser,
} from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { useEffect, useRef } from "react";

// Server-side loader to fetch version and comments
export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { paperId, versionId } = params;

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

  // Fetch paper
  const { data: paper } = await supabase
    .from("articles")
    .select("*")
    .eq("id", paperId)
    .single();

  // Fetch version with file URL
  const { data: version, error: versionError } = await supabase
    .from("article_versions")
    .select("*")
    .eq("id", versionId)
    .single();

  if (versionError || !version) {
    throw new Response("Version not found", { status: 404 });
  }

  // Get public URL for the file
  const { data: urlData } = supabase.storage
    .from("articles")
    .getPublicUrl(version.storage_path);

  const fileUrl = urlData.publicUrl;

  // Fetch comments for this version
  const { data: comments } = await supabase
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
    .eq("version_id", versionId)
    .is("parent_id", null)
    .order("created_at", { ascending: true });

  // Fetch replies for all comments
  const commentIds = comments?.map((c) => c.id) || [];
  let replies: any[] = [];
  if (commentIds.length > 0) {
    const { data: repliesData } = await supabase
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
      .in("parent_id", commentIds)
      .order("created_at", { ascending: true });

    replies = repliesData || [];
  }

  // Fetch version list to know if this is the last version
  const { data: versionList } = await supabase
    .from("article_versions")
    .select("id")
    .eq("article_id", paperId);

  return {
    paper,
    version,
    fileUrl,
    comments: comments || [],
    replies,
    user,
    profile,
    totalVersions: versionList?.length || 0,
  };
}

// Server-side action to add comments or manage version notes
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const adminClient = createSupabaseAdminClient();
  // Prefer admin client for destructive operations when available to avoid RLS issues
  const db = adminClient?.supabase || supabase;
  const { paperId, versionId } = params;

  const formData = await request.formData();
  const intent = (formData.get("intent") as string) || "addComment";

  // Shared profile & ownership check for version-level actions
  const { data: profile } = await supabase
    .from("profiles")
    .select("admin_type")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.admin_type === "admin";

  const { data: paper } = await supabase
    .from("articles")
    .select("author_id")
    .eq("id", paperId)
    .single();

  const isAuthor = paper?.author_id === user.id;

  if ((intent === "updateNotes" || intent === "deleteNotes") && !paper) {
    return { error: "Paper not found" };
  }

  if (intent === "deleteVersion") {
    if (!paper || (!isAuthor && !isAdmin)) {
      return { error: "Unauthorized to delete this version" };
    }

    const { data: versions } = await supabase
      .from("article_versions")
      .select("id, version_number, created_at")
      .eq("article_id", paperId)
      .order("version_number", { ascending: false });

    if (!versions || versions.length === 0) {
      return { error: "No versions found for this paper" };
    }

    const targetVersion = versions.find((v) => v.id === versionId);
    if (!targetVersion) {
      return { error: "Version not found" };
    }

    // Remove related comments before deleting the version to avoid FK errors
    const { error: deleteCommentsError } = await db
      .from("comments")
      .delete()
      .eq("version_id", versionId);
    if (deleteCommentsError) {
      return { error: "Failed to delete comments for this version" };
    }

    if (versions.length === 1) {
      // Clean up any remaining comments for this paper before deleting it
      const { error: deletePaperCommentsError } = await db
        .from("comments")
        .delete()
        .eq("article_id", paperId);
      if (deletePaperCommentsError) {
        return { error: "Version deleted but failed to delete paper comments" };
      }

      const { error: deleteArticleError } = await db
        .from("articles")
        .delete()
        .eq("id", paperId);
      if (deleteArticleError) {
        return { error: "Version deleted but failed to delete paper" };
      }

      const { error: deleteVersionError } = await db
        .from("article_versions")
        .delete()
        .eq("id", versionId);
      if (deleteVersionError) {
        return { error: "Failed to delete version" };
      }

      return redirect("/papers");
    }

    const fallbackVersion = versions.find((v) => v.id !== versionId);
    if (!fallbackVersion) {
      return { error: "Could not determine fallback version" };
    }

    const { error: updateArticleError } = await db
      .from("articles")
      .update({ current_version_id: fallbackVersion.id })
      .eq("id", paperId);
    if (updateArticleError) {
      return { error: "Failed to update paper to fallback version" };
    }

    const { error: deleteVersionError } = await db
      .from("article_versions")
      .delete()
      .eq("id", versionId);
    if (deleteVersionError) {
      return { error: "Failed to delete version" };
    }

    return redirect(`/papers/${paperId}`);
  }

  if (intent === "updateNotes" || intent === "deleteNotes") {
    if (!paper || (!isAuthor && !isAdmin)) {
      return { error: "Unauthorized to edit notes" };
    }

    const notesValue =
      intent === "deleteNotes"
        ? null
        : ((formData.get("notes") as string | null) || null);

    const { error: updateError } = await db
      .from("article_versions")
      .update({ notes: notesValue })
      .eq("id", versionId)
      .eq("article_id", paperId);

    if (updateError) {
      return { error: "Failed to update version notes" };
    }

    return redirect(`/papers/${paperId}/versions/${versionId}`);
  }

  const body = formData.get("body") as string;
  const parentId = (formData.get("parentId") as string | null) || null;

  if (!body) {
    return { error: "Comment body is required" };
  }

  const { error } = await supabase.from("comments").insert({
    article_id: paperId,
    version_id: versionId,
    author_id: user.id,
    body,
    parent_id: parentId,
  });

  if (error) {
    return { error: "Failed to post comment" };
  }

  return redirect(`/papers/${paperId}/versions/${versionId}`);
}

export default function VersionReview() {
  const formRef = useRef<HTMLFormElement>(null);
  const navigation = useNavigation();
  useEffect(() => {
    if (navigation.state === "idle") {
      formRef.current?.reset();
    }
  }, [navigation.state]);
  const {
    paper,
    version,
    fileUrl,
    comments,
    replies,
    user,
    profile,
    totalVersions,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const isAdmin = profile?.admin_type === "admin";
  const isAuthor = user?.id === paper?.author_id;
  const canEditNotes = isAdmin || isAuthor;
  const canDeleteVersion = isAdmin || isAuthor;
  const deleteWarning =
    totalVersions === 1
      ? "WARNING: this is the only version of the paper. If you delete this, the paper will be deleted as well."
      : "Delete this version?";
  const truncatedNotes =
    version.notes && version.notes.length > 200
      ? `${version.notes.slice(0, 200)}...`
      : version.notes;

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left: File viewer */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {paper?.title} - Version {version.version_number}
            </h2>
            {canDeleteVersion && (
              <Form
                method="post"
                className="mb-4"
                onSubmit={(e) => {
                  if (!confirm(deleteWarning)) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="intent" value="deleteVersion" />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm hover:bg-red-700"
                >
                  Delete This Version
                </button>
                {totalVersions === 1 && (
                  <p className="mt-2 text-xs text-red-700">
                    WARNING: this is the only version of the paper. If you delete
                    this, the paper will be deleted as well.
                  </p>
                )}
              </Form>
            )}

            <div className="mb-4">
              <p className="text-sm text-gray-600">File: {version.file_name}</p>
              <p className="text-sm text-gray-500">
                Uploaded: {new Date(version.created_at).toLocaleDateString()}
              </p>
              <div className="mt-4">
                <h4 className="text-sm font-semibold text-gray-900">
                  Version Notes
                </h4>
                {canEditNotes ? (
                  <div className="mt-2 space-y-2">
                    {actionData?.error && (
                      <div className="rounded-md bg-red-50 p-3">
                        <p className="text-xs text-red-800">{actionData.error}</p>
                      </div>
                    )}
                    <p className="text-xs text-gray-500">
                      {version.notes
                        ? "Update or clear the context for this version."
                        : "Add context about the changes in this version."}
                    </p>
                    <Form method="post" className="space-y-2">
                      <input type="hidden" name="intent" value="updateNotes" />
                      <textarea
                        name="notes"
                        defaultValue={version.notes || ""}
                        rows={3}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        placeholder="Add context about the changes in this version..."
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
                      >
                        Save Notes
                      </button>
                    </Form>
                    {version.notes && (
                      <Form
                        method="post"
                        onSubmit={(e) =>
                          !confirm("Remove the notes for this version?") &&
                          e.preventDefault()
                        }
                        className="inline"
                      >
                        <input type="hidden" name="intent" value="deleteNotes" />
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded-md bg-red-600 text-white text-sm hover:bg-red-700"
                        >
                          Delete Notes
                        </button>
                      </Form>
                    )}
                    {!version.notes && (
                      <p className="text-xs text-gray-500">
                        These notes are visible to reviewers and editors.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 mt-1 italic">
                    {truncatedNotes
                      ? `Notes: ${truncatedNotes}`
                      : "No notes provided for this version."}
                  </p>
                )}
              </div>
            </div>

            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Download / View File
            </a>

            {/* Embedded PDF viewer (if PDF) */}
            {version.file_name.toLowerCase().endsWith(".pdf") && (
              <div className="mt-6">
                <iframe
                  src={fileUrl}
                  className="w-full h-[600px] border rounded"
                  title="PDF Viewer"
                />
              </div>
            )}
          </div>

          {/* Right: Comments */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Reviews & Comments
            </h3>

            {actionData?.error && (
              <div className="mb-4 rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">{actionData.error}</p>
              </div>
            )}

            {/* Comment form */}
            {user ? (
              <Form method="post" className="mb-6" ref={formRef}>
                <input type="hidden" name="intent" value="addComment" />
                <textarea
                  name="body"
                  rows={3}
                  required
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  placeholder="Write your review or comment..."
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

            {/* Comments list */}
            <div className="space-y-4">
              {comments.map((comment) => {
                const commentReplies = replies.filter(
                  (r) => r.parent_id === comment.id
                );

                return (
                  <div
                    key={comment.id}
                    className="border-l-2 border-gray-200 pl-2"
                  >
                    <div className="flex items-start space-x-2">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-sm text-gray-900">
                            {comment.author?.username ||
                              comment.author?.full_name}
                          </span>
                          {comment.author && (
                            <RoleBadge
                              role={comment.author.role_type}
                              className="text-xs py-0 px-1"
                            />
                          )}
                          <span className="text-[8px] text-gray-500">
                            {new Date(comment.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-gray-700" text-sm>
                          {comment.body}
                        </p>

                        {/* Replies */}
                        {commentReplies.length > 0 && (
                          <div className="mt-3 space-y-3 pl-4 border-l border-gray-200">
                            {commentReplies.map((reply) => (
                              <div key={reply.id}>
                                <div className="flex items-center space-x-2">
                                  <span className="font-semibold text-sm text-gray-900">
                                    {reply.author?.username ||
                                      reply.author?.full_name}
                                  </span>
                                  {reply.author && (
                                    <RoleBadge
                                      role={reply.author.role_type}
                                      className="text-xs px-1 py-0"
                                    />
                                  )}
                                  <span className="text-xs text-gray-500">
                                    {new Date(
                                      reply.created_at
                                    ).toLocaleDateString()}
                                  </span>
                                </div>
                                <p className="mt-1 text-[12px] text-gray-700">
                                  {reply.body}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Reply form */}
                        {user && (
                          <details className="mt-2">
                            <summary className="text-sm text-blue-600 cursor-pointer hover:text-blue-700">
                              Reply
                            </summary>
                            <Form method="post" className="mt-2">
                              <input type="hidden" name="intent" value="addComment" />
                              <input
                                type="hidden"
                                name="parentId"
                                value={comment.id}
                              />
                              <textarea
                                name="body"
                                rows={2}
                                required
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2 border"
                                placeholder="Write a reply..."
                              />
                              <button
                                type="submit"
                                className="mt-1 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                              >
                                Reply
                              </button>
                            </Form>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {comments.length === 0 && (
                <p className="text-gray-500 text-sm">
                  No comments yet. Be the first to review!
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

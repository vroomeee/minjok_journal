import {
  useLoaderData,
  Form,
  redirect,
  useActionData,
  useFetcher,
  useRevalidator,
} from "react-router";
import type { Route } from "./+types/$paperId.versions.$versionId";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
  requireUser,
  getUserProfile,
} from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { useEffect, useRef } from "react";
import { UserLink } from "~/components/user-link";

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { paperId, versionId } = params;

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

  const { data: paper } = await supabase.from("articles").select("*").eq("id", paperId).single();

  const { data: version, error: versionError } = await supabase
    .from("article_versions")
    .select("*")
    .eq("id", versionId)
    .single();

  if (versionError || !version) {
    throw new Response("Version not found", { status: 404 });
  }

  const { data: urlData } = supabase.storage
    .from("articles")
    .getPublicUrl(version.storage_path);
  const fileUrl = urlData.publicUrl;

  const { data: comments } = await supabase
    .from("comments")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        email,
        full_name,
        role_type
      )
    `
    )
    .eq("version_id", versionId)
    .is("parent_id", null)
    .order("created_at", { ascending: true });

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
          email,
          full_name,
          role_type
        )
      `
      )
      .in("parent_id", commentIds)
      .order("created_at", { ascending: true });

    replies = repliesData || [];
  }

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
  const db = adminClient?.supabase || supabase;
  const { paperId, versionId } = params;

  const formData = await request.formData();
  const intent = (formData.get("intent") as string) || "addComment";

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
    if (!paper || (!isAuthor && !isAdmin)) return { error: "Unauthorized to delete this version" };

    const { data: versions } = await supabase
      .from("article_versions")
      .select("id, version_number, created_at, storage_path")
      .eq("article_id", paperId)
      .order("version_number", { ascending: false });

    if (!versions || versions.length === 0) return { error: "No versions found for this paper" };
    const targetVersion = versions.find((v) => v.id === versionId);
    if (!targetVersion) return { error: "Version not found" };

    const { error: deleteCommentsError } = await db
      .from("comments")
      .delete()
      .eq("version_id", versionId);
    if (deleteCommentsError) return { error: "Failed to delete comments for this version" };

    // Remove storage objects for this version (and all if deleting last)
    const targetPath = targetVersion.storage_path ? [targetVersion.storage_path] : [];
    const allPaths = versions
      .map((v) => v.storage_path)
      .filter((p): p is string => Boolean(p));

    if (versions.length === 1) {
      if (allPaths.length > 0) {
        await supabase.storage.from("articles").remove(allPaths);
      }
      const { error: deletePaperCommentsError } = await db
        .from("comments")
        .delete()
        .eq("article_id", paperId);
      if (deletePaperCommentsError)
        return { error: "Version deleted but failed to delete paper comments" };

      const { error: deleteArticleError } = await db.from("articles").delete().eq("id", paperId);
      if (deleteArticleError) return { error: "Version deleted but failed to delete paper" };

      const { error: deleteVersionError } = await db
        .from("article_versions")
        .delete()
        .eq("id", versionId);
      if (deleteVersionError) return { error: "Failed to delete version" };

      return redirect("/papers");
    }

    if (targetPath.length > 0) {
      await supabase.storage.from("articles").remove(targetPath);
    }

    const fallbackVersion = versions.find((v) => v.id !== versionId);
    if (!fallbackVersion) return { error: "Could not determine fallback version" };

    const { error: updateArticleError } = await db
      .from("articles")
      .update({ current_version_id: fallbackVersion.id })
      .eq("id", paperId);
    if (updateArticleError) return { error: "Failed to update paper to fallback version" };

    const { error: deleteVersionError } = await db
      .from("article_versions")
      .delete()
      .eq("id", versionId);
    if (deleteVersionError) return { error: "Failed to delete version" };

    return redirect(`/papers/${paperId}`);
  }

  if (intent === "updateNotes" || intent === "deleteNotes") {
    if (!paper || (!isAuthor && !isAdmin)) return { error: "Unauthorized to edit notes" };

    const notesValue =
      intent === "deleteNotes" ? null : ((formData.get("notes") as string | null) || null);

    const { error: updateError } = await db
      .from("article_versions")
      .update({ notes: notesValue })
      .eq("id", versionId)
      .eq("article_id", paperId);

    if (updateError) return { error: "Failed to update version notes" };

    return redirect(`/papers/${paperId}/versions/${versionId}`);
  }

  const body = formData.get("body") as string;
  const parentId = (formData.get("parentId") as string | null) || null;

  if (intent === "deleteComment" || intent === "editComment") {
    const commentId = formData.get("commentId") as string;
    if (!commentId) return { error: "Comment not found" };

    const { data: comment } = await supabase
      .from("comments")
      .select("author_id")
      .eq("id", commentId)
      .single();
    if (!comment) return { error: "Comment not found" };

    const { user, profile } = await getUserProfile(request);
    const isAdmin = profile.admin_type === "admin";
    if (comment.author_id !== user.id && !isAdmin) {
      return { error: "Unauthorized" };
    }

    if (intent === "deleteComment") {
      const { error } = await supabase.from("comments").delete().eq("id", commentId);
      if (error) return { error: "Failed to delete comment" };
      return { success: true };
    }

    const newBody = formData.get("body") as string;
    if (!newBody) return { error: "Comment body is required" };

    const { error } = await supabase.from("comments").update({ body: newBody }).eq("id", commentId);
    if (error) return { error: "Failed to update comment" };
    return { success: true };
  }

  if (!body) return { error: "Comment body is required" };

  const { error } = await supabase.from("comments").insert({
    article_id: paperId,
    version_id: versionId,
    author_id: user.id,
    body,
    parent_id: parentId,
  });

  if (error) return { error: "Failed to post comment" };

  return { success: true };
}

export default function VersionReview() {
  const formRef = useRef<HTMLFormElement>(null);
  const { paper, version, fileUrl, comments, replies, user, profile, totalVersions } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const commentFetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const commentFormsRef = useRef<HTMLFormElement[]>([]);
  const editCommentFormsRef = useRef<HTMLFormElement[]>([]);
  const handledCommentSuccess = useRef(false);
  const rowsForBody = (body: string) =>
    Math.min(14, Math.max(3, Math.ceil((body?.length || 0) / 60)));
  useEffect(() => {
    if (commentFetcher.state === "submitting") {
      handledCommentSuccess.current = false;
    }
    if (
      !handledCommentSuccess.current &&
      commentFetcher.state === "idle" &&
      commentFetcher.data?.success
    ) {
      commentFormsRef.current.forEach((f) => f?.reset());
      editCommentFormsRef.current.forEach((f) => f?.reset());
      revalidator.revalidate();
      handledCommentSuccess.current = true;
    }
  }, [commentFetcher.state, commentFetcher.data, revalidator]);
  const isAdmin = profile?.admin_type === "admin";
  const isAuthor = user?.id === paper?.author_id;
  const canEditNotes = isAdmin || isAuthor;
  const canDeleteVersion = isAdmin || isAuthor;
  const deleteWarning =
    totalVersions === 1
      ? "WARNING: this is the only version of the paper. If you delete this, the paper will be deleted as well."
      : "Delete this version?";
  const truncatedNotes =
    version.notes && version.notes.length > 200 ? `${version.notes.slice(0, 200)}...` : version.notes;

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="page-body">
        {actionData?.error && (
          <div className="section-compact subtle">
            <p className="text-sm" style={{ color: "#f6b8bd" }}>
              {actionData.error}
            </p>
          </div>
        )}

        <div className="section">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h2 style={{ fontSize: 22, margin: 0 }}>
                {paper?.title} - Version {version.version_number}
              </h2>
              <p className="muted" style={{ margin: "4px 0" }}>
                Uploaded: {new Date(version.created_at).toLocaleDateString()}
              </p>
            </div>
            {canDeleteVersion && (
              <Form
                method="post"
                className="row"
                onSubmit={(e) => {
                  if (!confirm(deleteWarning)) e.preventDefault();
                }}
              >
                <input type="hidden" name="intent" value="deleteVersion" />
                <button type="submit" className="btn btn-danger">
                  Delete Version
                </button>
              </Form>
            )}
          </div>

          <div className="row" style={{ gap: 12, flexWrap: "wrap", marginTop: 6 }}>
            <span className="meta">File: {version.file_name}</span>
            {version.notes && (
              <span className="muted" style={{ fontStyle: "italic" }}>
                Notes: {truncatedNotes}
              </span>
            )}
          </div>

          {canEditNotes && (
            <div className="section-compact" style={{ marginTop: 10 }}>
              <h4 style={{ margin: "0 0 6px", fontSize: 14 }}>Version Notes</h4>
              <Form method="post" className="list">
                <input type="hidden" name="intent" value="updateNotes" />
                <textarea
                  name="notes"
                  defaultValue={version.notes || ""}
                  rows={3}
                  className="textarea"
                  placeholder="Add context about the changes in this version..."
                />
                <div className="row">
                  <button type="submit" className="btn btn-accent">
                    Save Notes
                  </button>
                  {version.notes && (
                    <Form
                      method="post"
                      onSubmit={(e) => !confirm("Remove the notes for this version?") && e.preventDefault()}
                    >
                      <input type="hidden" name="intent" value="deleteNotes" />
                      <button type="submit" className="btn btn-ghost">
                        Delete Notes
                      </button>
                    </Form>
                  )}
                </div>
              </Form>
            </div>
          )}

          <div className="row" style={{ gap: 10, marginTop: 12 }}>
            <a href={fileUrl} className="btn btn-accent" target="_blank" rel="noopener noreferrer">
              Download / View File
            </a>
          </div>

          {version.file_name.toLowerCase().endsWith(".pdf") && (
            <div style={{ marginTop: 12 }}>
              <iframe
                src={fileUrl}
                className="w-full"
                style={{ height: 520, border: `1px solid var(--border)`, borderRadius: 6 }}
                title="PDF Viewer"
              />
            </div>
          )}
        </div>

        <div className="section">
          <h3 style={{ fontSize: 18, marginBottom: 10 }}>Reviews & Comments</h3>

          {user ? (
            <commentFetcher.Form
              method="post"
              ref={(form) => {
                if (form && !commentFormsRef.current.includes(form)) {
                  commentFormsRef.current.push(form);
                }
                formRef.current = form || undefined;
              }}
              className="list"
              style={{ marginBottom: 12 }}
              onSubmit={(e) => {
                handledCommentSuccess.current = false;
                e.currentTarget.reset();
              }}
            >
              <input type="hidden" name="intent" value="addComment" />
              <textarea
                name="body"
                rows={3}
                required
                className="textarea"
                placeholder="Write your review or comment..."
              />
              <button
                type="submit"
                className="btn btn-accent"
                disabled={commentFetcher.state === "submitting"}
              >
                {commentFetcher.state === "submitting" ? "Posting..." : "Post Comment"}
              </button>
            </commentFetcher.Form>
          ) : (
            <p className="muted" style={{ marginBottom: 12 }}>
              Please log in to leave a comment.
            </p>
          )}

          <div className="card-grid">
              {comments.map((comment) => {
                const commentReplies = replies.filter((r) => r.parent_id === comment.id);

                return (
                  <div key={comment.id} className="section-compact" style={{ borderRadius: 6 }}>
                  <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      <UserLink user={comment.author} />
                    </span>
                    {comment.author && (
                      <RoleBadge role={comment.author.role_type} className="text-xs py-0 px-1" />
                    )}
                    <span className="meta">
                      {new Date(comment.created_at).toLocaleDateString()}
                    </span>
                    {(user?.id === comment.author_id || isAdmin) && (
                      <div className="row" style={{ gap: 6 }}>
                        <commentFetcher.Form method="post">
                          <input type="hidden" name="intent" value="deleteComment" />
                          <input type="hidden" name="commentId" value={comment.id} />
                          <button
                            type="submit"
                            className="btn btn-ghost"
                            onClick={(e) => !confirm("Delete this comment?") && e.preventDefault()}
                          >
                            Delete
                          </button>
                        </commentFetcher.Form>
                        <details>
                          <summary className="nav-link" style={{ padding: 0 }}>
                            Edit
                          </summary>
                          <commentFetcher.Form
                            method="post"
                            className="list"
                            style={{ marginTop: 6 }}
                            ref={(form) => {
                              if (form && !editCommentFormsRef.current.includes(form)) {
                                editCommentFormsRef.current.push(form);
                              }
                            }}
                          >
                            <input type="hidden" name="intent" value="editComment" />
                            <input type="hidden" name="commentId" value={comment.id} />
                            <textarea
                              name="body"
                              defaultValue={comment.body}
                              rows={rowsForBody(comment.body)}
                              required
                              className="textarea"
                              style={{ width: "100%" }}
                            />
                            <button
                              type="submit"
                              className="btn btn-accent"
                              style={{ marginTop: 4 }}
                              disabled={commentFetcher.state === "submitting"}
                            >
                              {commentFetcher.state === "submitting" ? "Saving..." : "Save"}
                            </button>
                          </commentFetcher.Form>
                        </details>
                      </div>
                    )}
                  </div>
                  <p className="muted" style={{ marginTop: 4 }}>
                    {comment.body}
                  </p>

                  {commentReplies.length > 0 && (
                    <div className="card-grid" style={{ marginTop: 8 }}>
                      {commentReplies.map((reply) => (
                        <div key={reply.id} className="section-compact" style={{ background: "var(--surface-2)" }}>
                          <div className="row" style={{ gap: 6 }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>
                              <UserLink user={reply.author} />
                            </span>
                            {reply.author && (
                              <RoleBadge
                                role={reply.author.role_type}
                                className="text-xs py-0 px-1"
                              />
                            )}
                            <span className="meta">
                              {new Date(reply.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="muted" style={{ marginTop: 4 }}>
                            {reply.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {user && (
                    <details style={{ marginTop: 8 }}>
                      <summary className="nav-link" style={{ padding: 0 }}>
                        Reply
                      </summary>
                      <commentFetcher.Form
                        method="post"
                        style={{ marginTop: 6 }}
                        ref={(form) => {
                          if (form && !commentFormsRef.current.includes(form)) {
                            commentFormsRef.current.push(form);
                          }
                        }}
                        onSubmit={(e) => {
                          handledCommentSuccess.current = false;
                          e.currentTarget.reset();
                        }}
                      >
                        <input type="hidden" name="intent" value="addComment" />
                        <input type="hidden" name="parentId" value={comment.id} />
                        <textarea
                          name="body"
                          rows={2}
                          required
                          className="textarea"
                          placeholder="Write a reply..."
                        />
                        <button
                          type="submit"
                          className="btn btn-accent"
                          style={{ marginTop: 6 }}
                          disabled={commentFetcher.state === "submitting"}
                        >
                          {commentFetcher.state === "submitting" ? "Posting..." : "Reply"}
                        </button>
                      </commentFetcher.Form>
                    </details>
                  )}
                </div>
              );
            })}

            {comments.length === 0 && (
              <p className="muted">No comments yet. Be the first to review!</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

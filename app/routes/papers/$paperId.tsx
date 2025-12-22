import { Link, useLoaderData, Form, redirect, useActionData, useFetcher, useRevalidator } from "react-router";
import { useEffect, useRef, useState } from "react";
import type { Route } from "./+types/$paperId";
import { createSupabaseServerClient, getUserProfile } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { UserLink } from "~/components/user-link";

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
        email,
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
          email,
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

    // Remove storage objects for all versions of this paper
    const { data: versionPaths } = await supabase
      .from("article_versions")
      .select("storage_path")
      .eq("article_id", paperId);
    const pathsToRemove =
      versionPaths?.map((v: { storage_path: string | null }) => v.storage_path).filter(Boolean) || [];
    if (pathsToRemove.length > 0) {
      await supabase.storage.from("articles").remove(pathsToRemove as string[]);
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

    return { success: true };
  }

  if (intent === "editComment" || intent === "deleteComment") {
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

    const body = formData.get("body") as string;
    if (!body) return { error: "Comment body is required" };

    const { error } = await supabase.from("comments").update({ body }).eq("id", commentId);
    if (error) return { error: "Failed to update comment" };
    return { success: true };
  }

  return null;
}

export default function PaperDetail() {
  const { paper, user, profile, comments, activeVersionId, publishedVersion, publishedFileUrl } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const commentFetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const commentFormsRef = useRef<HTMLFormElement[]>([]);
  const editCommentFormsRef = useRef<HTMLFormElement[]>([]);
  const handledCommentSuccess = useRef(false);
  useEffect(() => {
    if (commentFetcher.state === "submitting") {
      handledCommentSuccess.current = false;
    }
    if (
      !handledCommentSuccess.current &&
      commentFetcher.state === "idle" &&
      commentFetcher.data?.success
    ) {
      commentFormsRef.current.forEach((form) => form?.reset());
      editCommentFormsRef.current.forEach((form) => form?.reset());
      revalidator.revalidate();
      handledCommentSuccess.current = true;
    }
  }, [commentFetcher.state, commentFetcher.data, revalidator]);

  const [showVersions, setShowVersions] = useState(paper.status !== "published");

  const isAuthor = user?.id === paper.author?.id;
  const isAdmin = profile?.admin_type === "admin";
  const canDelete = isAuthor || isAdmin;
  const canPublish = isAuthor || isAdmin;
  const canUploadNewVersion = isAuthor && paper.status !== "published";
  const canSubmitForReview = isAuthor && paper.status === "draft";
  const showComments = paper.status === "published" && !!activeVersionId;
  const truncateNotes = (notes?: string | null) =>
    notes && notes.length > 200 ? `${notes.slice(0, 200)}...` : notes;
  const rowsForBody = (body: string) =>
    Math.min(14, Math.max(3, Math.ceil((body?.length || 0) / 60)));

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
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <div className="row" style={{ gap: 10 }}>
              <h1 style={{ fontSize: 26 }}>{paper.title}</h1>
              {(isAuthor || isAdmin) && (
                <Link to={`/papers/${paper.id}/edit`} className="btn">
                  Edit Title or Description
                </Link>
              )}
            </div>
            <span className="pill">
              {paper.status === "published"
                ? "Published"
                : paper.status === "in_review"
                ? "In Review"
                : "Draft"}
            </span>
          </div>

          <div className="row" style={{ flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
            <span className="meta">
              by <UserLink user={paper.author} />
            </span>
            {paper.author && <RoleBadge role={paper.author.role_type} />}
            <span className="meta">{new Date(paper.created_at).toLocaleDateString()}</span>
          </div>
          {paper.description && (
            <p className="muted" style={{ marginBottom: 12 }}>
              {paper.description}
            </p>
          )}

          {(isAuthor || isAdmin) && (
            <div className="row-wrap" style={{ marginTop: 4 }}>
              {isAuthor && canSubmitForReview && (
                <Form method="post">
                  <input type="hidden" name="intent" value="updateStatus" />
                  <input type="hidden" name="status" value="in_review" />
                  <button type="submit" className="btn btn-warn">
                    Submit for Review
                  </button>
                </Form>
              )}
              {isAuthor && canUploadNewVersion && (
                <Link to={`/papers/${paper.id}/new-version`} className="btn btn-ghost">
                  Upload New Version
                </Link>
              )}
              {canPublish && paper.status === "in_review" && (
                <Link to={`/papers/${paper.id}/publish`} className="btn btn-accent">
                  Publish
                </Link>
              )}
              {canPublish && paper.status === "published" && (
                <Form method="post">
                  <input type="hidden" name="intent" value="unpublish" />
                  <button type="submit" className="btn btn-warn">
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
                    className="btn btn-danger"
                  >
                    Delete Paper
                  </button>
                </Form>
              )}
            </div>
          )}
        </div>

        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 18 }}>Versions</h2>
            {paper.status === "published" && (
              <button
                type="button"
                onClick={() => setShowVersions((prev) => !prev)}
                className="btn btn-ghost"
              >
                {showVersions ? "Hide Past Versions" : "View Past Versions"}
              </button>
            )}
          </div>

          {(showVersions || paper.status !== "published") && (
            <>
              {paper.versions && paper.versions.length > 0 ? (
                <div className="card-grid">
                  {paper.versions.map((version) => (
                    <div
                      key={version.id}
                      className="section-compact"
                      style={{
                        background: "var(--surface-2)",
                        border: `1px solid var(--border)`,
                        borderRadius: "6px",
                      }}
                    >
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <div>
                          <div className="row" style={{ gap: 6 }}>
                            <h3 style={{ fontSize: 15, margin: 0 }}>
                              Version {version.version_number}
                            </h3>
                            {paper.current_version_id === version.id &&
                              paper.status === "published" && (
                                <span className="pill" style={{ background: "#103c2d" }}>
                                  Published
                                </span>
                              )}
                          </div>
                          <p className="meta" style={{ margin: "2px 0" }}>
                            {new Date(version.created_at).toLocaleDateString()}
                          </p>
                          <p className="muted" style={{ margin: "2px 0" }}>
                            {version.file_name}
                          </p>
                          {version.notes && (
                            <p className="muted" style={{ margin: "4px 0" }}>
                              {truncateNotes(version.notes)}
                            </p>
                          )}
                        </div>
                        <Link
                          to={`/papers/${paper.id}/versions/${version.id}`}
                          className="btn btn-ghost"
                        >
                          View & Review
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No versions uploaded yet.</p>
              )}
            </>
          )}
        </div>

        {paper.status === "published" && publishedVersion && (
          <div className="section">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <h2 style={{ fontSize: 18 }}>Published Version</h2>
                <p className="muted">
                  {publishedVersion.file_name} (v{publishedVersion.version_number})
                </p>
              </div>
              {publishedFileUrl && (
                <a
                  href={publishedFileUrl}
                  className="btn btn-ghost"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download
                </a>
              )}
            </div>
            {publishedFileUrl &&
              publishedVersion.file_name.toLowerCase().endsWith(".pdf") && (
                <div style={{ marginTop: 12 }}>
                  <iframe
                    src={publishedFileUrl}
                    className="w-full"
                    style={{ height: 520, border: `1px solid var(--border)`, borderRadius: 6 }}
                    title="Published File"
                  />
                </div>
              )}
          </div>
        )}

        {showComments && (
          <div className="section">
            <h2 style={{ fontSize: 18, marginBottom: 10 }}>Paper Comments</h2>
            {user ? (
              <commentFetcher.Form
                method="post"
                style={{ marginBottom: 12 }}
                ref={(form) => {
                  if (form && !commentFormsRef.current.includes(form)) {
                    commentFormsRef.current.push(form);
                  }
                }}
                onSubmit={(e) => {
                  handledCommentSuccess.current = false;
                  // Clear immediately for better UX; fetcher will still submit values already serialized
                  e.currentTarget.reset();
                }}
                data-comment-form
              >
                <input type="hidden" name="intent" value="comment" />
                <textarea
                  name="body"
                  rows={3}
                  required
                  className="textarea"
                  placeholder="Share feedback or peer review for this published paper..."
                />
                <button
                  type="submit"
                  className="btn btn-accent"
                  style={{ marginTop: 8 }}
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
              {comments.map((comment) => (
                <div key={comment.id} className="section-compact" style={{ borderRadius: 6 }}>
                  <div className="row" style={{ gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      <UserLink user={comment.author} />
                    </span>
                    {comment.author && (
                      <RoleBadge
                        role={comment.author.role_type}
                        className="text-xs py-0 px-1"
                      />
                    )}
                    <span className="meta">
                      {new Date(comment.created_at).toLocaleDateString()}
                    </span>
                    {(user?.id === comment.author_id || profile?.admin_type === "admin") && (
                      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
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
                  <p className="muted" style={{ margin: 0 }}>
                    {comment.body}
                  </p>
                </div>
              ))}

              {comments.length === 0 && (
                <p className="muted">No comments yet. Share your thoughts on this paper.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

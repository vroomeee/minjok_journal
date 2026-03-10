import {
  useLoaderData,
  Form,
  useRevalidator,
  Link,
  redirect,
  useFetcher,
  useRouteLoaderData,
} from "react-router";
import type { Route } from "./+types/$postId";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { useEffect, useRef, useState } from "react";
import { UserLink } from "~/components/user-link";
import type { Database } from "~/lib/database.types";
import { BOARD_ATTACHMENTS_BUCKET } from "~/lib/board-attachments";

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "n/a";
  return dateFmt.format(new Date(dateStr));
}

function formatFileSize(sizeInBytes: number | null) {
  if (!sizeInBytes || sizeInBytes <= 0) return "Unknown size";
  if (sizeInBytes < 1024) return `${sizeInBytes} B`;
  if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
}

type CommentInsert = Database["public"]["Tables"]["comments"]["Insert"];

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { postId } = params;

  const [postResult, commentsResult, attachmentsResult] = await Promise.all([
    supabase
      .from("board_posts")
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
      .eq("id", postId)
      .single(),
    supabase
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
      .eq("article_id", postId)
      .eq("comment_type", "board")
      .is("parent_id", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("board_post_attachments")
      .select("*")
      .eq("board_post_id", postId)
      .order("created_at", { ascending: true }),
  ]);

  const { data: post, error } = postResult;
  const { data: comments } = commentsResult;
  const { data: attachments } = attachmentsResult;

  if (error || !post) throw new Response("Post not found", { status: 404 });

  const formattedPost = { ...post, formattedDate: formatDate(post.created_at) };
  const formattedComments = (comments || []).map((c) => ({
    ...c,
    formattedDate: formatDate(c.created_at),
  }));
  const formattedAttachments = (attachments || []).map((attachment) => {
    const {
      data: { publicUrl },
    } = supabase.storage
      .from(BOARD_ATTACHMENTS_BUCKET)
      .getPublicUrl(attachment.storage_path, { download: attachment.file_name });

    return {
      ...attachment,
      downloadUrl: publicUrl,
    };
  });

  return {
    post: formattedPost,
    comments: formattedComments,
    attachments: formattedAttachments,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { postId } = params;
  if (!postId) {
    throw new Response("Post not found", { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_type, id")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role_type === "admin";

  if (intent === "delete") {
    const { data: post } = await supabase
      .from("board_posts")
      .select("author_id")
      .eq("id", postId)
      .single();

    if (!post || (post.author_id !== user.id && !isAdmin)) {
      return { error: "Unauthorized to delete this post" };
    }

    const { data: attachments } = await supabase
      .from("board_post_attachments")
      .select("storage_path")
      .eq("board_post_id", postId);

    const attachmentPaths = Array.from(
      new Set(
        (attachments || [])
          .map((attachment) => attachment.storage_path)
          .filter((path): path is string => Boolean(path)),
      ),
    );

    if (attachmentPaths.length > 0) {
      const { error: removeStorageError } = await supabase.storage
        .from(BOARD_ATTACHMENTS_BUCKET)
        .remove(attachmentPaths);
      if (removeStorageError) {
        return { error: "Failed to remove one or more attachment files. Delete aborted." };
      }
    }

    const { error } = await supabase
      .from("board_posts")
      .delete()
      .eq("id", postId);
    if (error) return { error: "Failed to delete post" };

    return redirect("/board");
  }

  if (intent === "comment") {
    const body = formData.get("body") as string;
    if (!body) return { error: "Comment is required" };

    const payload = {
      article_id: postId,
      version_id: null,
      author_id: user.id,
      body,
      parent_id: null,
      comment_type: "board",
    } as unknown as CommentInsert;

    const { error } = await supabase.from("comments").insert(payload);
    if (error)
      return {
        error: "Failed to post comment: " + (error.message ?? "unknown error"),
      };

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

    const { data: profile } = await supabase
      .from("profiles")
      .select("role_type")
      .eq("id", user.id)
      .single();
    const isAdminComment = profile?.role_type === "admin";
    if (comment.author_id !== user.id && !isAdminComment) {
      return { error: "Unauthorized" };
    }

    if (intent === "deleteComment") {
      const { error } = await supabase
        .from("comments")
        .delete()
        .eq("id", commentId);
      if (error) return { error: "Failed to delete comment" };
      return { success: true };
    }

    const body = formData.get("body") as string;
    if (!body) return { error: "Comment is required" };
    const { error } = await supabase
      .from("comments")
      .update({ body })
      .eq("id", commentId);
    if (error)
      return {
        error: "Failed to update comment: " + (error.message ?? "unknown error"),
      };
    return { success: true };
  }

  return null;
}

export default function BoardPost() {
  const commentFetcher = useFetcher<typeof action>();
  const commentFormRef = useRef<HTMLFormElement>(null);
  const editCommentFormsRef = useRef<HTMLFormElement[]>([]);
  const needsResetRef = useRef(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const rowsForBody = (body: string) =>
    Math.min(14, Math.max(3, Math.ceil((body?.length || 0) / 60)));
  const revalidator = useRevalidator();

  const { post, comments, attachments } = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData("root") as {
    user?: { id: string };
    profile?: { role_type?: string | null };
  } | null;
  const user = rootData?.user;
  const profile = rootData?.profile;

  const isAdmin = profile?.role_type === "admin";
  const isAuthor = user?.id === post.author?.id;
  const canEdit = isAdmin || isAuthor;
  const canDelete = isAdmin || isAuthor;

  useEffect(() => {
    if (
      needsResetRef.current &&
      commentFetcher.state === "idle" &&
      commentFetcher.data?.success
    ) {
      commentFormRef.current?.reset();
      editCommentFormsRef.current.forEach((form) => form?.reset());
      setEditingCommentId(null);
      revalidator.revalidate();
      needsResetRef.current = false;
    }
  }, [commentFetcher.state, commentFetcher.data, revalidator]);

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="page-body">
        <div className="section">
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <Link to="/board" className="nav-link" style={{ padding: 0 }}>
              {"<- Back to Board"}
            </Link>
          </div>
          <div
            className="row"
            style={{ justifyContent: "space-between", marginBottom: 6 }}
          >
            <h1 style={{ fontSize: 22, margin: 0 }}>{post.title}</h1>
            {canEdit && (
              <div className="row" style={{ gap: 6 }}>
                <Link to={`/board/${post.id}/edit`} className="btn btn-ghost">
                  Edit
                </Link>
                {canDelete && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <button
                      type="submit"
                      onClick={(e) =>
                        !confirm(
                          "Are you sure you want to delete this post?"
                        ) && e.preventDefault()
                      }
                      className="btn btn-danger"
                    >
                      Delete
                    </button>
                  </Form>
                )}
              </div>
            )}
          </div>
          <div
            className="row"
            style={{ flexWrap: "wrap", gap: 10, marginBottom: 8 }}
          >
            <span className="meta">
              Posted by <UserLink user={post.author} />
            </span>
            {post.author && <RoleBadge role={post.author.role_type} />}
            <span className="meta">
              {post.formattedDate}
            </span>
          </div>
          <div
            className="section-compact"
            style={{ background: "var(--surface-2)" }}
          >
            <p className="muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {post.content}
            </p>
          </div>

          {attachments.length > 0 && (
            <div className="section-compact" style={{ marginTop: 10 }}>
              <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>Attachments</h2>
              <div className="list" style={{ gap: 6 }}>
                {attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.downloadUrl}
                    className="nav-link"
                    style={{ padding: 0, display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <span>{attachment.file_name}</span>
                    <span className="meta">({formatFileSize(attachment.file_size)})</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="section">
          <h2 style={{ fontSize: 18, marginBottom: 10 }}>Comments</h2>

          {commentFetcher.data?.error && (
            <div
              className="section-compact subtle"
              style={{ marginBottom: 10 }}
            >
              <p className="text-sm" style={{ color: "#f6b8bd" }}>
                {commentFetcher.data.error}
              </p>
            </div>
          )}

          {user ? (
            <commentFetcher.Form
              method="post"
              className="list"
              ref={commentFormRef}
              style={{ marginBottom: 12 }}
            onSubmit={() => {
              needsResetRef.current = true;
            }}
            >
              <input type="hidden" name="intent" value="comment" />
              <textarea
                name="body"
                rows={3}
                required
                className="textarea"
                placeholder="Write a comment..."
              />
              <button
                type="submit"
                className="btn btn-accent"
                disabled={commentFetcher.state === "submitting"}
              >
                {commentFetcher.state === "submitting"
                  ? "Posting..."
                  : "Post Comment"}
              </button>
            </commentFetcher.Form>
          ) : (
            <p className="muted" style={{ marginBottom: 12 }}>
              Please log in to leave a comment.
            </p>
          )}

          <div className="card-grid">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="section-compact"
                style={{ borderRadius: 6 }}
              >
                <div
                  className="row"
                  style={{ gap: 8, marginBottom: 4, flexWrap: "wrap" }}
                >
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
                    {comment.formattedDate}
                  </span>
                  {(user?.id === comment.author_id ||
                    profile?.role_type === "admin") && (
                    <div className="row" style={{ gap: 6 }}>
                      <commentFetcher.Form method="post">
                        <input
                          type="hidden"
                          name="intent"
                          value="deleteComment"
                        />
                        <input
                          type="hidden"
                          name="commentId"
                          value={comment.id}
                        />
                        <button
                          type="submit"
                          className="btn btn-ghost"
                          onClick={(e) =>
                            !confirm("Delete this comment?") &&
                            e.preventDefault()
                          }
                          disabled={commentFetcher.state === "submitting"}
                        >
                          Delete
                        </button>
                      </commentFetcher.Form>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() =>
                          setEditingCommentId(
                            editingCommentId === comment.id ? null : comment.id
                          )
                        }
                      >
                        {editingCommentId === comment.id ? "Cancel" : "Edit"}
                      </button>
                    </div>
                  )}
                </div>
                {editingCommentId === comment.id ? (
                  <commentFetcher.Form
                    method="post"
                    className="list"
                    style={{ marginTop: 6 }}
                    ref={(form) => {
                      if (form && !editCommentFormsRef.current.includes(form)) {
                        editCommentFormsRef.current.push(form);
                      }
                    }}
                  onSubmit={() => {
                    needsResetRef.current = true;
                    setEditingCommentId(null);
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
                    <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setEditingCommentId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-accent"
                        disabled={commentFetcher.state === "submitting"}
                      >
                        {commentFetcher.state === "submitting"
                          ? "Saving..."
                          : "Save"}
                      </button>
                    </div>
                  </commentFetcher.Form>
                ) : (
                  <p className="muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                    {comment.body}
                  </p>
                )}
              </div>
            ))}

            {comments.length === 0 && (
              <p className="muted">No comments yet. Be the first to comment!</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


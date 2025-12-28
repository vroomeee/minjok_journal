import {
  useLoaderData,
  Form,
  useRevalidator,
  Link,
  redirect,
  useFetcher,
} from "react-router";
import type { Route } from "./+types/$postId";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { useEffect, useRef } from "react";
import { UserLink } from "~/components/user-link";

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { postId } = params;

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

  const { data: post, error } = await supabase
    .from("board_posts")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        email,
        full_name,
        role_type,
        admin_type
      )
    `
    )
    .eq("id", postId)
    .single();

  if (error || !post) throw new Response("Post not found", { status: 404 });

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
    .eq("article_id", postId)
    .is("parent_id", null)
    .order("created_at", { ascending: true });

  return {
    post,
    comments: comments || [],
    user,
    profile,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { postId } = params;

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  const { data: profile } = await supabase
    .from("profiles")
    .select("admin_type, id")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.admin_type === "admin";

  if (intent === "delete") {
    const { data: post } = await supabase
      .from("board_posts")
      .select("author_id")
      .eq("id", postId)
      .single();

    if (!post || (post.author_id !== user.id && !isAdmin)) {
      return { error: "Unauthorized to delete this post" };
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

    const { error } = await supabase.from("comments").insert({
      article_id: postId,
      version_id: postId,
      author_id: user.id,
      body,
      parent_id: null,
    });
    if (error) return { error: "Failed to post comment" };

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
      .select("admin_type")
      .eq("id", user.id)
      .single();
    const isAdminComment = profile?.admin_type === "admin";
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
    if (error) return { error: "Failed to update comment" };
    return { success: true };
  }

  return null;
}

export default function BoardPost() {
  const commentFetcher = useFetcher<typeof action>();
  const commentFormRef = useRef<HTMLFormElement>(null);
  const editCommentFormsRef = useRef<HTMLFormElement[]>([]);
  const prevCommentState = useRef<"idle" | "loading" | "submitting">(
    commentFetcher.state
  );
  const rowsForBody = (body: string) =>
    Math.min(14, Math.max(3, Math.ceil((body?.length || 0) / 60)));
  const revalidator = useRevalidator();

  const { post, comments, user, profile } = useLoaderData<typeof loader>();

  const isAdmin = profile?.admin_type === "admin";
  const isAuthor = user?.id === post.author?.id;
  const canEdit = isAdmin || isAuthor;
  const canDelete = isAdmin || isAuthor;

  useEffect(() => {
    if (
      prevCommentState.current === "submitting" &&
      commentFetcher.state === "idle" &&
      commentFetcher.data?.success
    ) {
      commentFormRef.current?.reset();
      editCommentFormsRef.current.forEach((form) => form?.reset());
      revalidator.revalidate();
    }
    prevCommentState.current = commentFetcher.state;
  }, [commentFetcher.state, commentFetcher.data, revalidator]);

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="page-body">
        <div className="section">
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <Link to="/board" className="nav-link" style={{ padding: 0 }}>
              ← Back to Board
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
            {post.author?.admin_type === "admin" && (
              <span className="pill">Admin</span>
            )}
            <span className="meta">
              {new Date(post.created_at).toLocaleDateString()}
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
              onSubmit={(e) => {
                prevCommentState.current = "submitting";
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
                    {new Date(comment.created_at).toLocaleDateString()}
                  </span>
                  {(user?.id === comment.author_id ||
                    profile?.admin_type === "admin") && (
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
                      <details>
                        <summary className="nav-link" style={{ padding: 0 }}>
                          Edit
                        </summary>
                        <commentFetcher.Form
                          method="post"
                          className="list"
                          style={{ marginTop: 6 }}
                          ref={(form) => {
                            if (
                              form &&
                              !editCommentFormsRef.current.includes(form)
                            ) {
                              editCommentFormsRef.current.push(form);
                            }
                          }}
                        >
                          <input
                            type="hidden"
                            name="intent"
                            value="editComment"
                          />
                          <input
                            type="hidden"
                            name="commentId"
                            value={comment.id}
                          />
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
                            {commentFetcher.state === "submitting"
                              ? "Saving..."
                              : "Save"}
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
              <p className="muted">No comments yet. Be the first to comment!</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

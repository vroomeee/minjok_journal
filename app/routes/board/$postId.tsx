import {
  useLoaderData,
  Form,
  useActionData,
  useNavigation,
  useRevalidator,
  Link,
  redirect,
} from "react-router";
import type { Route } from "./+types/$postId";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { useEffect, useRef } from "react";

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

    const { error } = await supabase.from("board_posts").delete().eq("id", postId);
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

  return null;
}

export default function BoardPost() {
  const commentFormRef = useRef<HTMLFormElement>(null);
  const navigation = useNavigation();
  const revalidator = useRevalidator();

  const { post, comments, user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const isAdmin = profile?.admin_type === "admin";
  const isAuthor = user?.id === post.author?.id;
  const canEdit = isAdmin || isAuthor;
  const canDelete = isAdmin || isAuthor;

  useEffect(() => {
    if (actionData?.success && navigation.state === "idle") {
      commentFormRef.current?.reset();
      revalidator.revalidate();
    }
  }, [actionData, navigation.state, revalidator]);

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
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
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
                        !confirm("Are you sure you want to delete this post?") && e.preventDefault()
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
          <div className="row" style={{ flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
            <span className="meta">
              Posted by {post.author?.email || post.author?.full_name}
            </span>
            {post.author && <RoleBadge role={post.author.role_type} />}
            {post.author?.admin_type === "admin" && <span className="pill">Admin</span>}
            <span className="meta">{new Date(post.created_at).toLocaleDateString()}</span>
          </div>
          <div className="section-compact" style={{ background: "var(--surface-2)" }}>
            <p className="muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {post.content}
            </p>
          </div>
        </div>

        <div className="section">
          <h2 style={{ fontSize: 18, marginBottom: 10 }}>Comments</h2>

          {actionData?.error && (
            <div className="section-compact subtle" style={{ marginBottom: 10 }}>
              <p className="text-sm" style={{ color: "#f6b8bd" }}>
                {actionData.error}
              </p>
            </div>
          )}

          {user ? (
            <Form method="post" className="list" ref={commentFormRef} style={{ marginBottom: 12 }}>
              <input type="hidden" name="intent" value="comment" />
              <textarea
                name="body"
                rows={3}
                required
                className="textarea"
                placeholder="Write a comment..."
              />
              <button type="submit" className="btn btn-accent">
                Post Comment
              </button>
            </Form>
          ) : (
            <p className="muted" style={{ marginBottom: 12 }}>
              Please log in to leave a comment.
            </p>
          )}

          <div className="card-grid">
            {comments.map((comment) => (
              <div key={comment.id} className="section-compact" style={{ borderRadius: 6 }}>
                <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>
                    {comment.author?.email || comment.author?.full_name}
                  </span>
                  {comment.author && (
                    <RoleBadge role={comment.author.role_type} className="text-xs py-0 px-1" />
                  )}
                  <span className="meta">
                    {new Date(comment.created_at).toLocaleDateString()}
                  </span>
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

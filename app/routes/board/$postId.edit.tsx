import { Form, redirect, useActionData, useLoaderData, Link } from "react-router";
import type { Route } from "./+types/$postId.edit";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { postId } = params;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.admin_type === "admin";

  const { data: post, error } = await supabase
    .from("board_posts")
    .select("*")
    .eq("id", postId)
    .single();

  if (error || !post) {
    throw new Response("Post not found", { status: 404 });
  }

  if (post.author_id !== user.id && !isAdmin) {
    throw new Response("Unauthorized", { status: 403 });
  }

  return { post, user, profile };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { postId } = params;

  const { data: profile } = await supabase
    .from("profiles")
    .select("admin_type")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.admin_type === "admin";

  const { data: post } = await supabase
    .from("board_posts")
    .select("author_id")
    .eq("id", postId)
    .single();

  if (!post || (post.author_id !== user.id && !isAdmin)) {
    return { error: "Unauthorized" };
  }

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;

  if (!title || !content) {
    return { error: "Title and content are required" };
  }

  const { error } = await supabase.from("board_posts").update({ title, content }).eq("id", postId);
  if (error) return { error: "Failed to update post" };

  return redirect(`/board/${postId}`);
}

export default function EditBoardPost() {
  const { post, user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="page">
      <Nav user={user} profile={profile || undefined} />

      <div className="page-body" style={{ maxWidth: 800 }}>
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Edit Board Post</h1>
              <p className="muted" style={{ margin: 0 }}>
                Update the title and content.
              </p>
            </div>
            <Link to={`/board/${post.id}`} className="btn btn-ghost">
              Back to Post
            </Link>
          </div>

          {actionData?.error && (
            <div className="section-compact subtle" style={{ marginBottom: 10 }}>
              <p className="text-sm" style={{ color: "#f6b8bd" }}>
                {actionData.error}
              </p>
            </div>
          )}

          <Form method="post" className="list">
            <div>
              <label className="label">Title</label>
              <input
                type="text"
                name="title"
                defaultValue={post.title}
                required
                className="input"
              />
            </div>
            <div>
              <label className="label">Content</label>
              <textarea
                name="content"
                rows={10}
                defaultValue={post.content}
                required
                className="textarea"
              />
            </div>

            <div className="row">
              <button type="submit" className="btn btn-accent">
                Save
              </button>
              <Link to={`/board/${post.id}`} className="btn btn-ghost">
                Cancel
              </Link>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}

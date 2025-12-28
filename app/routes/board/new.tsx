import { Form, redirect, useActionData, Link } from "react-router";
import type { Route } from "./+types/new";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_type")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role_type !== "admin") {
    throw new Response("Unauthorized: Admin access required", { status: 403 });
  }

  return { user, profile };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_type")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role_type !== "admin") {
    throw new Response("Unauthorized: Admin access required", { status: 403 });
  }

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;

  if (!title || !content) return { error: "Title and content are required" };

  const { error } = await supabase.from("board_posts").insert({
    title,
    content,
    author_id: user.id,
  });

  if (error) return { error: "Failed to create post" };

  return redirect("/board");
}

export default function NewBoardPost() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="page">
      <Nav user={undefined} profile={undefined} />

      <div className="page-body" style={{ maxWidth: 800 }}>
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>New Board Post</h1>
              <p className="muted" style={{ margin: 0 }}>
                Admins only.
              </p>
            </div>
            <Link to="/board" className="btn btn-ghost">
              Back to Board
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
                required
                className="input"
                placeholder="Board post title"
              />
            </div>

            <div>
              <label className="label">Content</label>
              <textarea
                name="content"
                rows={10}
                required
                className="textarea"
                placeholder="Write the post content"
              />
            </div>

            <div className="row">
              <button type="submit" className="btn btn-accent">
                Create Post
              </button>
              <Link to="/board" className="btn btn-ghost">
                Cancel
              </Link>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}

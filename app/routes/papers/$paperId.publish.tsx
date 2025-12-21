import { Form, redirect, useActionData, useLoaderData, Link } from "react-router";
import type { Route } from "./+types/$paperId.publish";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { paperId } = params;

  const { data: paper, error } = await supabase
    .from("articles")
    .select("id, title, description, author_id, status")
    .eq("id", paperId)
    .single();

  if (error || !paper) {
    throw new Response("Paper not found", { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("admin_type")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.admin_type === "admin";
  if (paper.author_id !== user.id && !isAdmin) {
    throw new Response("Unauthorized", { status: 403 });
  }

  if (paper.status === "published") {
    return redirect(`/papers/${paperId}`);
  }

  return { paper, user, profile };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { paperId } = params;

  const formData = await request.formData();
  const title = (formData.get("title") as string) || "";
  const description = (formData.get("description") as string) || null;

  if (!title.trim()) return { error: "Title is required" };

  const { data: paper } = await supabase
    .from("articles")
    .select("author_id, status")
    .eq("id", paperId)
    .single();

  if (!paper) throw new Response("Paper not found", { status: 404 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("admin_type")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.admin_type === "admin";
  if (paper.author_id !== user.id && !isAdmin) {
    throw new Response("Unauthorized", { status: 403 });
  }

  const { error } = await supabase
    .from("articles")
    .update({ status: "published", title, description })
    .eq("id", paperId);

  if (error) return { error: "Failed to publish paper" };

  return redirect(`/papers/${paperId}`);
}

export default function PublishPaper() {
  const { paper, user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="page-body" style={{ maxWidth: 720 }}>
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Publish Paper</h1>
              <p className="muted" style={{ margin: 0 }}>
                Set the title and description for the published paper.
              </p>
            </div>
            <Link to={`/papers/${paper.id}`} className="btn btn-ghost">
              Back to paper
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
              <label className="label">Publish Title</label>
              <input
                type="text"
                name="title"
                defaultValue={paper.title}
                required
                className="input"
              />
            </div>
            <div>
              <label className="label">Description (optional)</label>
              <textarea
                name="description"
                defaultValue={paper.description || ""}
                rows={3}
                className="textarea"
                placeholder="Short description to display when published"
              />
            </div>

            <div className="row">
              <button type="submit" className="btn btn-accent">
                Publish
              </button>
              <Link to={`/papers/${paper.id}`} className="btn btn-ghost">
                Cancel
              </Link>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}

import { Form, redirect, useActionData, Link } from "react-router";
import type { Route } from "./+types/new";
import { requireUser, createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return {};
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const notes = formData.get("notes") as string;
  const file = formData.get("file") as File;

  if (!title || !file) return { error: "Title and file are required" };

  // Throttle duplicate submits: block if the user created an article in the last 5 seconds.
  const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
  const { data: recentArticle } = await supabase
    .from("articles")
    .select("id, created_at")
    .eq("author_id", user.id)
    .gte("created_at", fiveSecondsAgo)
    .limit(1)
    .maybeSingle();
  if (recentArticle) {
    return {
      error: "You can only upload an article every 5 seconds. Please wait a moment.",
    };
  }

  const { data: article, error: articleError } = await supabase
    .from("articles")
    .insert({
      title,
      author_id: user.id,
      status: "draft",
    })
    .select()
    .single();

  if (articleError || !article) {
    return { error: "Failed to create article" };
  }

  const filePath = `${user.id}/${article.id}/v1/${file.name}`;
  const { error: uploadError } = await supabase.storage.from("articles").upload(filePath, file);
  if (uploadError) return { error: "Failed to upload file: " + uploadError.message };

  const { data: version, error: versionError } = await supabase
    .from("article_versions")
    .insert({
      article_id: article.id,
      version_number: 1,
      storage_path: filePath,
      file_name: file.name,
      file_size: file.size,
      notes: notes || null,
    })
    .select()
    .single();

  if (versionError || !version) return { error: "Failed to create version record" };

  await supabase
    .from("articles")
    .update({
      current_version_id: version.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", article.id);

  return redirect(`/papers/${article.id}`);
}

export default function NewPaper() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="page">
      <Nav />
      <div className="page-body" style={{ maxWidth: 720 }}>
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Submit New Paper</h1>
              <p className="muted" style={{ margin: 0 }}>
                Start a draft and upload your first version.
              </p>
            </div>
            <Link to="/papers" className="btn btn-ghost">
              Cancel
            </Link>
          </div>

          {actionData?.error && (
            <div className="section-compact subtle" style={{ marginBottom: 10 }}>
              <p className="text-sm" style={{ color: "#f6b8bd" }}>
                {actionData.error}
              </p>
            </div>
          )}

          <Form method="post" encType="multipart/form-data" className="list">
            <div>
              <label className="label">Title</label>
              <input
                type="text"
                name="title"
                required
                className="input"
                placeholder="Paper title"
              />
            </div>
            <div>
              <label className="label">Initial Version (PDF/DOC)</label>
              <input type="file" name="file" accept=".pdf,.doc,.docx" required className="input" />
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <textarea
                name="notes"
                rows={4}
                className="textarea"
                placeholder="Describe the contents of this version"
              />
            </div>
            <div className="row">
              <button type="submit" className="btn btn-accent">
                Submit Paper
              </button>
              <Link to="/papers" className="btn btn-ghost">
                Cancel
              </Link>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}

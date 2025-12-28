import { Form, redirect, useActionData, useLoaderData, Link } from "react-router";
import type { Route } from "./+types/$paperId.new-version";
import { requireUser, createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { paperId } = params;

  const { data: paper, error } = await supabase
    .from("articles")
    .select("*, authors:article_authors(profile_id)")
    .eq("id", paperId)
    .single();

  if (error || !paper) throw new Response("Paper not found", { status: 404 });
  const isAuthor =
    paper.author_id === user.id ||
    paper.authors?.some((a: { profile_id: string }) => a.profile_id === user.id);
  if (!isAuthor) {
    throw new Response("Unauthorized: You can only upload versions for your own papers", {
      status: 403,
    });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role_type")
    .eq("id", user.id)
    .single();

  const { data: versions } = await supabase
    .from("article_versions")
    .select("version_number")
    .eq("article_id", paperId)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersionNumber = versions && versions.length > 0 ? versions[0].version_number + 1 : 1;

  return { paper, nextVersionNumber, user, profile };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { paperId } = params;

  const formData = await request.formData();
  const notes = formData.get("notes") as string;
  const file = formData.get("file") as File;

  if (!file) return { error: "File is required" };

  // Throttle duplicate uploads: limit to one version upload every 5 seconds per user.
  const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
  const { data: recentVersion } = await supabase
    .from("article_versions")
    .select("id, created_at")
    .eq("article_id", paperId)
    .gte("created_at", fiveSecondsAgo)
    .limit(1)
    .maybeSingle();
  if (recentVersion) {
    return {
      error: "You can only upload a new version every 5 seconds. Please wait a moment.",
    };
  }

  const { data: paper } = await supabase
    .from("articles")
    .select("author_id, authors:article_authors(profile_id)")
    .eq("id", paperId)
    .single();

  const isAuthor =
    paper?.author_id === user.id ||
    paper?.authors?.some((a: { profile_id: string }) => a.profile_id === user.id);
  if (!paper || !isAuthor) throw new Response("Unauthorized", { status: 403 });

  const { data: versions } = await supabase
    .from("article_versions")
    .select("version_number")
    .eq("article_id", paperId)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersionNumber = versions && versions.length > 0 ? versions[0].version_number + 1 : 1;

  const filePath = `${user.id}/${paperId}/v${nextVersionNumber}/${file.name}`;
  const { error: uploadError } = await supabase.storage.from("articles").upload(filePath, file);
  if (uploadError) return { error: "Failed to upload file: " + uploadError.message };

  const { data: version, error: versionError } = await supabase
    .from("article_versions")
    .insert({
      article_id: paperId,
      version_number: nextVersionNumber,
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
    .eq("id", paperId);

  return redirect(`/papers/${paperId}`);
}

export default function NewVersion() {
  const { paper, nextVersionNumber, user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />
      <div className="page-body" style={{ maxWidth: 720 }}>
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Upload New Version</h1>
              <p className="muted" style={{ margin: 0 }}>
                Paper: {paper.title} (Version {nextVersionNumber})
              </p>
            </div>
            <Link to={`/papers/${paper.id}`} className="btn btn-ghost">
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
              <label className="label">File</label>
              <input
                type="file"
                name="file"
                accept=".pdf,.doc,.docx"
                required
                className="input"
              />
            </div>

            <div>
              <label className="label">Version Notes</label>
              <textarea
                name="notes"
                rows={4}
                className="textarea"
                placeholder="Describe the changes in this version..."
              />
              <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                Explain what was changed or improved in this version.
              </p>
            </div>

            <div className="row">
              <button type="submit" className="btn btn-accent">
                Upload Version {nextVersionNumber}
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

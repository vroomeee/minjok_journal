import { Form, redirect, useActionData, useLoaderData, Link } from "react-router";
import type { Route } from "./+types/$paperId.new-version";
import {
  requireUser,
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/supabase.server";
import {
  ARTICLE_FILE_ACCEPT,
  getOptionalFormFile,
  validateArticleUpload,
} from "~/lib/article-files";
import {
  buildBlindArticlePath,
  buildCopyrightArticlePath,
  buildOriginalArticlePath,
  removeArticleFiles,
  uploadArticleFile,
} from "~/lib/article-files.server";
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
  if (paper.status === "published") {
    return redirect(`/papers/${paper.id}`);
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

  return {
    paper,
    nextVersionNumber,
    user,
    profile,
    hasCopyrightConsent: Boolean(paper.copyright_storage_path),
    copyrightFileName: paper.copyright_file_name,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const adminClient = createSupabaseAdminClient();
  const db = adminClient?.supabase || supabase;
  const { paperId } = params;

  const formData = await request.formData();
  const notes = formData.get("notes") as string;
  const originalFile = getOptionalFormFile(formData, "originalFile");
  const blindFile = getOptionalFormFile(formData, "blindFile");
  const copyrightFile = getOptionalFormFile(formData, "copyrightFile");

  const originalValidation = validateArticleUpload(originalFile, "Original file");
  if (originalValidation) {
    return { error: originalValidation };
  }

  const blindValidation = validateArticleUpload(blindFile, "Blinded file");
  if (blindValidation) {
    return { error: blindValidation };
  }

  const copyrightValidation = validateArticleUpload(
    copyrightFile,
    "Copyright consent",
    { required: false },
  );
  if (copyrightValidation) {
    return { error: copyrightValidation };
  }

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
    .select(
      "author_id, status, copyright_storage_path, authors:article_authors(profile_id)",
    )
    .eq("id", paperId)
    .single();

  const isAuthor =
    paper?.author_id === user.id ||
    paper?.authors?.some((a: { profile_id: string }) => a.profile_id === user.id);
  if (!paper || !isAuthor) throw new Response("Unauthorized", { status: 403 });
  if (paper.status === "published") {
    return { error: "Published papers cannot receive new versions." };
  }

  const { data: versions } = await supabase
    .from("article_versions")
    .select("version_number")
    .eq("article_id", paperId)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersionNumber = versions && versions.length > 0 ? versions[0].version_number + 1 : 1;

  const originalPath = buildOriginalArticlePath(
    paperId,
    nextVersionNumber,
    originalFile!.name,
  );
  const blindPath = buildBlindArticlePath(paperId, nextVersionNumber, blindFile!.name);
  const copyrightPath = copyrightFile
    ? buildCopyrightArticlePath(paperId, copyrightFile.name)
    : null;

  try {
    await uploadArticleFile(originalPath, originalFile!);
    await uploadArticleFile(blindPath, blindFile!);
    if (copyrightFile && copyrightPath) {
      await uploadArticleFile(copyrightPath, copyrightFile);
    }
  } catch (error) {
    try {
      await removeArticleFiles([originalPath, blindPath, copyrightPath]);
    } catch {
      // Best-effort rollback.
    }
    return {
      error:
        error instanceof Error ? error.message : "Failed to upload article files",
    };
  }

  const { data: version, error: versionError } = await supabase
    .from("article_versions")
    .insert({
      article_id: paperId,
      version_number: nextVersionNumber,
      storage_path: originalPath,
      file_name: originalFile!.name,
      file_size: originalFile!.size,
      blind_storage_path: blindPath,
      blind_file_name: blindFile!.name,
      blind_file_size: blindFile!.size,
      notes: notes || null,
    })
    .select()
    .single();

  if (versionError || !version) {
    try {
      await removeArticleFiles([originalPath, blindPath, copyrightPath]);
    } catch {
      // Best-effort rollback.
    }
    return { error: "Failed to create version record" };
  }

  const articleUpdate: Record<string, string | number | null> = {
    current_version_id: version.id,
    updated_at: new Date().toISOString(),
  };
  if (copyrightFile && copyrightPath) {
    articleUpdate.copyright_storage_path = copyrightPath;
    articleUpdate.copyright_file_name = copyrightFile.name;
    articleUpdate.copyright_file_size = copyrightFile.size;
    articleUpdate.copyright_uploaded_at = new Date().toISOString();
  }

  const { error: updatePaperError } = await db
    .from("articles")
    .update(articleUpdate)
    .eq("id", paperId);

  if (updatePaperError) {
    await supabase.from("article_versions").delete().eq("id", version.id);
    try {
      await removeArticleFiles([originalPath, blindPath, copyrightPath]);
    } catch {
      // Best-effort rollback.
    }

    if (!adminClient && paper.author_id !== user.id) {
      return {
        error:
          "Failed to finalize the new version for a coauthor because this server is missing SUPABASE_SERVICE_ROLE_KEY.",
      };
    }
    return { error: "Failed to finalize the new version." };
  }

  if (
    copyrightFile &&
    paper.copyright_storage_path &&
    paper.copyright_storage_path !== copyrightPath
  ) {
    try {
      await removeArticleFiles([paper.copyright_storage_path]);
    } catch {
      // Keep the article updated even if old storage cleanup fails.
    }
  }

  return redirect(`/papers/${paperId}`);
}

export default function NewVersion() {
  const {
    paper,
    nextVersionNumber,
    user,
    profile,
    hasCopyrightConsent,
    copyrightFileName,
  } = useLoaderData<typeof loader>();
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
              <label className="label">Original File</label>
              <input
                type="file"
                name="originalFile"
                accept={ARTICLE_FILE_ACCEPT}
                required
                className="input"
              />
            </div>

            <div>
              <label className="label">Blinded Review File</label>
              <input
                type="file"
                name="blindFile"
                accept={ARTICLE_FILE_ACCEPT}
                required
                className="input"
              />
            </div>

            <div>
              <label className="label">Copyright Consent (optional replacement)</label>
              <input
                type="file"
                name="copyrightFile"
                accept={ARTICLE_FILE_ACCEPT}
                className="input"
              />
              <p className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                {hasCopyrightConsent
                  ? `Current file: ${copyrightFileName || "uploaded"}`
                  : "No copyright consent uploaded yet. Add one now or before review/publish."}
              </p>
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

import { useEffect, useMemo, useState } from "react";
import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  Link,
  useFetcher,
} from "react-router";
import type { Route } from "./+types/$paperId.edit";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import {
  ARTICLE_FILE_ACCEPT,
  getOptionalFormFile,
  validateArticleUpload,
} from "~/lib/article-files";
import {
  buildCopyrightArticlePath,
  createSignedArticleUrl,
  removeArticleFiles,
  uploadArticleFile,
} from "~/lib/article-files.server";
import { Nav } from "~/components/nav";

type SearchProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type PaperAuthor = {
  profile_id: string;
  position?: number | null;
  profile?: SearchProfile | null;
};

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { paperId } = params;

  const { data: paper, error } = await supabase
    .from("articles")
    .select(
      `
        id,
        title,
        description,
        author_id,
        status,
        copyright_file_name,
        copyright_storage_path,
        authors:article_authors(
          profile_id,
          position,
          profile:profiles!article_authors_profile_id_fkey(
            id,
            email,
            full_name
          )
        )
      `
    )
    .eq("id", paperId)
    .single();

  if (error || !paper) throw new Response("Paper not found", { status: 404 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, role_type")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role_type === "admin";
  const authors = ((paper as { authors?: PaperAuthor[] }).authors || [])
    .slice()
    .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER));
  const isAuthor =
    paper.author_id === user.id ||
    authors.some((a) => a.profile_id === user.id);
  if (!isAuthor && !isAdmin) {
    throw new Response("Unauthorized", { status: 403 });
  }

  const canManagePaper = paper.author_id === user.id || isAdmin;
  if (!canManagePaper) {
    throw new Response("Only the submitter or an admin can edit this paper", { status: 403 });
  }

  return {
    paper: {
      ...paper,
      authors,
    },
    user,
    profile,
    copyrightDownloadUrl:
      paper.copyright_storage_path && paper.copyright_file_name
        ? await createSignedArticleUrl(paper.copyright_storage_path, {
            download: paper.copyright_file_name,
          })
        : null,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { paperId } = params;

  const formData = await request.formData();
  const title = ((formData.get("title") as string) || "").trim();
  const rawDescription = (formData.get("description") as string) || "";
  const description = rawDescription.trim() || null;
  const copyrightFile = getOptionalFormFile(formData, "copyrightFile");
  const coauthorIds = Array.from(
    new Set(
      formData
        .getAll("coauthorIds")
        .map((v) => String(v).trim())
        .filter(Boolean)
    )
  );

  if (!title.trim()) {
    return { error: "Title is required" };
  }

  const copyrightValidation = validateArticleUpload(
    copyrightFile,
    "Copyright consent",
    { required: false },
  );
  if (copyrightValidation) {
    return { error: copyrightValidation };
  }

  const { data: paper } = await supabase
    .from("articles")
    .select(
      "id, author_id, copyright_storage_path, authors:article_authors(profile_id, position)",
    )
    .eq("id", paperId)
    .single();
  if (!paper) throw new Response("Paper not found", { status: 404 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_type")
    .eq("id", user.id)
    .single();
  const isAdmin = profile?.role_type === "admin";
  const isAuthor =
    paper.author_id === user.id ||
    paper.authors?.some((a: { profile_id: string }) => a.profile_id === user.id);
  if (!isAuthor && !isAdmin) {
    throw new Response("Unauthorized", { status: 403 });
  }

  const canManagePaper = paper.author_id === user.id || isAdmin;
  if (!canManagePaper) {
    throw new Response("Only the submitter or an admin can edit this paper", { status: 403 });
  }

  const normalizedCoauthorIds = coauthorIds.filter((id) => id !== paper.author_id);
  if (normalizedCoauthorIds.length > 0) {
    const { data: existingProfiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id")
      .in("id", normalizedCoauthorIds);
    if (profilesError) {
      return { error: "Failed to validate coauthors." };
    }
    if ((existingProfiles?.length ?? 0) !== normalizedCoauthorIds.length) {
      return {
        error:
          "Some selected coauthors no longer exist. Refresh and select again.",
      };
    }
  }

  const desiredAuthorIds = [paper.author_id, ...normalizedCoauthorIds];
  const desiredAuthorSet = new Set(desiredAuthorIds);
  const existingAuthors = (paper.authors || []) as { profile_id: string }[];
  const existingAuthorSet = new Set(existingAuthors.map((a) => a.profile_id));

  const toDeleteIds = existingAuthors
    .map((a) => a.profile_id)
    .filter((id) => !desiredAuthorSet.has(id) && id !== paper.author_id);

  const toInsertIds = desiredAuthorIds.filter((id) => !existingAuthorSet.has(id));

  if (toInsertIds.length > 0) {
    const rows = toInsertIds.map((profile_id) => ({
      article_id: paperId,
      profile_id,
      is_corresponding: profile_id === paper.author_id,
      position: desiredAuthorIds.indexOf(profile_id),
    }));
    const { error: insertAuthorsError } = await supabase
      .from("article_authors")
      .insert(rows);
    if (insertAuthorsError) {
      return { error: `Failed to add coauthors: ${insertAuthorsError.message}` };
    }
  }

  if (toDeleteIds.length > 0) {
    const { error: deleteAuthorsError } = await supabase
      .from("article_authors")
      .delete()
      .eq("article_id", paperId)
      .in("profile_id", toDeleteIds);
    if (deleteAuthorsError) {
      return { error: `Failed to remove coauthors: ${deleteAuthorsError.message}` };
    }
  }

  for (let idx = 0; idx < desiredAuthorIds.length; idx += 1) {
    const profileId = desiredAuthorIds[idx];
    const { error: reorderError } = await supabase
      .from("article_authors")
      .update({
        position: idx,
        is_corresponding: profileId === paper.author_id,
      })
      .eq("article_id", paperId)
      .eq("profile_id", profileId);
    if (reorderError) {
      return { error: `Failed to reorder authors: ${reorderError.message}` };
    }
  }

  const newCopyrightPath =
    copyrightFile && buildCopyrightArticlePath(paperId, copyrightFile.name);
  if (copyrightFile && newCopyrightPath) {
    try {
      await uploadArticleFile(newCopyrightPath, copyrightFile);
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : "Failed to upload copyright consent",
      };
    }
  }

  const articleUpdate: Record<string, string | number | null> = {
    title,
    description,
    updated_at: new Date().toISOString(),
  };
  if (copyrightFile && newCopyrightPath) {
    articleUpdate.copyright_storage_path = newCopyrightPath;
    articleUpdate.copyright_file_name = copyrightFile.name;
    articleUpdate.copyright_file_size = copyrightFile.size;
    articleUpdate.copyright_uploaded_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("articles")
    .update(articleUpdate)
    .eq("id", paperId);

  if (error) {
    if (newCopyrightPath) {
      try {
        await removeArticleFiles([newCopyrightPath]);
      } catch {
        // Best-effort cleanup.
      }
    }
    return { error: "Failed to update paper" };
  }

  if (
    newCopyrightPath &&
    paper.copyright_storage_path &&
    paper.copyright_storage_path !== newCopyrightPath
  ) {
    try {
      await removeArticleFiles([paper.copyright_storage_path]);
    } catch {
      // Keep the paper updated even if old storage cleanup fails.
    }
  }

  return redirect(`/papers/${paperId}`);
}

export default function EditPaper() {
  const { paper, user, profile, copyrightDownloadUrl } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const searchFetcher = useFetcher<{ results: SearchProfile[] }>();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, SearchProfile>>(() => {
    const initial: Record<string, SearchProfile> = {};
    (paper.authors as PaperAuthor[] | undefined)?.forEach((a) => {
      const id = a.profile?.id || a.profile_id;
      if (!id) return;
      initial[id] = {
        id,
        full_name: a.profile?.full_name || null,
        email: a.profile?.email || null,
      };
    });
    if (!initial[paper.author_id]) {
      initial[paper.author_id] = {
        id: paper.author_id,
        full_name: null,
        email: null,
      };
    }
    return initial;
  });

  useEffect(() => {
    if (query.trim().length < 2) return;
    const timeout = setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim() });
      searchFetcher.load(`/api/search-profiles?${params.toString()}`);
    }, 500);
    return () => clearTimeout(timeout);
  }, [query, searchFetcher]);

  const toggleSelect = (entry: SearchProfile) => {
    if (entry.id === paper.author_id) return;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[entry.id]) {
        delete next[entry.id];
      } else {
        next[entry.id] = entry;
      }
      if (!next[paper.author_id]) {
        next[paper.author_id] = {
          id: paper.author_id,
          full_name: null,
          email: null,
        };
      }
      return next;
    });
  };

  const selectedList = useMemo(() => {
    const list = Object.values(selected);
    list.sort((a, b) => {
      if (a.id === paper.author_id) return -1;
      if (b.id === paper.author_id) return 1;
      return 0;
    });
    return list;
  }, [selected, paper.author_id]);
  const results = searchFetcher.data?.results || [];

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="page-body" style={{ maxWidth: 720 }}>
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Edit Paper</h1>
              <p className="muted" style={{ margin: 0 }}>
                Update title, description, and coauthors. This works even when published.
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

          <Form method="post" encType="multipart/form-data" className="list">
            <div>
              <label className="label">Title</label>
              <input
                type="text"
                name="title"
                defaultValue={paper.title}
                required
                className="input"
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                name="description"
                defaultValue={paper.description || ""}
                rows={4}
                className="textarea"
                placeholder="Short description for the published paper"
              />
            </div>

            <div className="section-compact subtle" style={{ gap: 8 }}>
              <div>
                <label className="label" style={{ marginBottom: 4 }}>
                  Copyright Consent
                </label>
                <p className="muted text-sm" style={{ margin: 0 }}>
                  {paper.copyright_file_name
                    ? `Current file: ${paper.copyright_file_name}`
                    : "No copyright consent uploaded yet."}
                </p>
              </div>
              {copyrightDownloadUrl && paper.copyright_file_name && (
                <a
                  href={copyrightDownloadUrl}
                  className="btn btn-ghost"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download Current Consent
                </a>
              )}
              <div>
                <label className="label">Replace Copyright Consent</label>
                <input
                  type="file"
                  name="copyrightFile"
                  accept={ARTICLE_FILE_ACCEPT}
                  className="input"
                />
              </div>
            </div>

            <div className="section-compact" style={{ gap: 10 }}>
              <div>
                <label className="label" style={{ marginBottom: 4 }}>
                  Authors & Coauthors
                </label>
                <p className="muted text-sm" style={{ margin: 0 }}>
                  The submitter stays as first author. You can add or remove coauthors.
                </p>
              </div>

              <div className="row" style={{ gap: 8 }}>
                <input
                  type="search"
                  className="input"
                  placeholder="Search by full name or email"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ flex: 1 }}
                />
                <span className="muted text-sm" style={{ alignSelf: "center" }}>
                  {selectedList.length} selected
                </span>
              </div>

              {query && (
                <div className="section-compact" style={{ maxHeight: 220, overflow: "auto" }}>
                  {results.length === 0 ? (
                    <p className="muted text-sm" style={{ margin: 0 }}>
                      No people found.
                    </p>
                  ) : (
                    results.map((p) => (
                      <label
                        key={p.id}
                        className="row"
                        style={{
                          justifyContent: "space-between",
                          padding: "6px 4px",
                          cursor: "pointer",
                        }}
                      >
                        <div className="column" style={{ gap: 2 }}>
                          <span style={{ fontWeight: 600 }}>
                            {p.full_name || "Unnamed"}
                            {p.email ? ` (${p.email})` : ""}
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={Boolean(selected[p.id])}
                          onChange={() => toggleSelect(p)}
                          disabled={p.id === paper.author_id}
                        />
                      </label>
                    ))
                  )}
                </div>
              )}

              <div className="section-compact subtle">
                {selectedList.map((p) => (
                  <div
                    key={p.id}
                    className="row"
                    style={{ justifyContent: "space-between", alignItems: "center" }}
                  >
                    <div className="column" style={{ gap: 2 }}>
                      <span style={{ fontWeight: 600 }}>
                        {p.full_name || "Unnamed"}
                        {p.email ? ` (${p.email})` : ""}
                        {p.id === paper.author_id ? " - Submitter" : ""}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked
                      readOnly
                      disabled={p.id === paper.author_id}
                      onClick={() => {
                        if (p.id === paper.author_id) return;
                        toggleSelect(p);
                      }}
                    />
                  </div>
                ))}
              </div>

              {selectedList
                .filter((p) => p.id !== paper.author_id)
                .map((p) => (
                  <input key={p.id} type="hidden" name="coauthorIds" value={p.id} />
                ))}
            </div>
            <div className="row">
              <button type="submit" className="btn btn-accent">
                Save Changes
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

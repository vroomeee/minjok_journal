import {
  Form,
  redirect,
  useActionData,
  Link,
  useFetcher,
  useLoaderData,
} from "react-router";
import type { Route } from "./+types/new";
import { requireUser, createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { useEffect, useMemo, useState } from "react";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", user.id)
    .single();

  return { user, profile };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const notes = formData.get("notes") as string;
  const file = formData.get("file") as File;
  const coauthorIds = formData.getAll("coauthorIds").map(String);

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
      error:
        "You can only upload an article every 5 seconds. Please wait a moment.",
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

  // Insert author relationships (submitter + coauthors) before creating versions
  const uniqueAuthorIds = Array.from(new Set([user.id, ...coauthorIds]));
  const authorRows = uniqueAuthorIds.map((profile_id, idx) => ({
    article_id: article.id,
    profile_id,
    position: idx,
    is_corresponding: profile_id === user.id,
  }));
  if (authorRows.length) {
    const { error: authorsError } = await supabase
      .from("article_authors")
      .insert(authorRows);
    if (authorsError) {
      return { error: "Failed to add authors: " + authorsError.message };
    }
  }

  const filePath = `${user.id}/${article.id}/v1/${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("articles")
    .upload(filePath, file);
  if (uploadError)
    return { error: "Failed to upload file: " + uploadError.message };

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

  if (versionError || !version)
    return {
      error: `Failed to create version record: ${versionError?.message || "unknown error"}`,
    };

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
  const { user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const searchFetcher = useFetcher<{
    results: { id: string; full_name: string | null; email: string | null }[];
  }>();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<
    Record<
      string,
      { id: string; full_name: string | null; email: string | null }
    >
  >(() =>
    user
      ? {
          [user.id]: {
            id: user.id,
            full_name: profile?.full_name || "You",
            email: profile?.email || user.email || "",
          },
        }
      : {}
  );

  useEffect(() => {
    if (query.trim().length < 2) return;
    const timeout = setTimeout(() => {
      const params = new URLSearchParams({
        q: query.trim(),
      });
      if (user?.id) params.set("userId", user.id);
      searchFetcher.load(`/api/search-profiles?${params.toString()}`);
    }, 500);
    return () => clearTimeout(timeout);
  }, [query, searchFetcher]);

  const results = searchFetcher.data?.results || [];
  const selectedList = useMemo(() => Object.values(selected), [selected]);

  const toggleSelect = (
    profileId: string,
    entry: { id: string; full_name: string | null; email: string | null }
  ) => {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[profileId]) {
        delete next[profileId];
      } else {
        next[profileId] = entry;
      }
      // Always keep submitter checked
      if (user && !next[user.id]) {
        next[user.id] = {
          id: user.id,
          full_name: profile?.full_name || "You",
          email: profile?.email || user.email || "",
        };
      }
      return next;
    });
  };

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />
      <div className="page-body" style={{ maxWidth: 720 }}>
        <div className="section">
          <div
            className="row"
            style={{ justifyContent: "space-between", marginBottom: 10 }}
          >
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
            <div
              className="section-compact subtle"
              style={{ marginBottom: 10 }}
            >
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
              <input
                type="file"
                name="file"
                accept=".pdf,.doc,.docx"
                required
                className="input"
              />
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

            <div className="section-compact" style={{ gap: 10 }}>
              <div
                className="row"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <label className="label" style={{ marginBottom: 4 }}>
                    Authors & Coauthors
                  </label>
                  <p className="muted text-sm" style={{ margin: 0 }}>
                    You are added automatically. Search to add others before
                    submitting.
                  </p>
                </div>
              </div>

              <div className="section-compact" style={{ gap: 6 }}>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    type="search"
                    className="input"
                    placeholder="Search by full name or email"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <span
                    className="muted text-sm"
                    style={{ alignSelf: "center" }}
                  >
                    {selectedList.length} selected
                  </span>
                </div>
                {query && (
                  <div
                    className="section-compact"
                    style={{ maxHeight: 220, overflow: "auto" }}
                  >
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
                            onChange={() =>
                              toggleSelect(p.id, {
                                id: p.id,
                                full_name: p.full_name,
                                email: p.email,
                              })
                            }
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
                      style={{
                        justifyContent: "space-between",
                        alignItems: "center",
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
                        checked
                        readOnly
                        disabled={p.id === user.id}
                        onClick={() => {
                          if (p.id === user.id) return;
                          toggleSelect(p.id, p);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {selectedList
                .filter((p) => p.id !== user.id)
                .map((p) => (
                  <input
                    key={p.id}
                    type="hidden"
                    name="coauthorIds"
                    value={p.id}
                  />
                ))}
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

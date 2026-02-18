import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import type { Route } from "./+types/issues";
import {
  createSupabaseServerClient,
  requireUser,
} from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { useEffect, useRef, useState } from "react";
import { AuthorList } from "~/components/author-list";
import { useRootLoaderData } from "~/lib/root-data";
import { cleanupIssuesAndVolumes } from "~/lib/issues";

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "n/a";
  return dateFmt.format(new Date(dateStr));
}

type IssueRecord = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  created_at: string | null;
  release_date: string | null;
  cover_url: string | null;
};

type PaperAuthor = {
  profile_id?: string;
  profile?: {
    id: string;
    full_name: string | null;
    role_type: string | null;
    email?: string | null;
  } | null;
};

type AvailablePaper = {
  id: string;
  title: string;
  description: string | null;
  created_at: string | null;
  authors?: PaperAuthor[] | null;
};

type IssueArticle = {
  id: string;
  title: string;
  created_at: string | null;
  authors?: PaperAuthor[] | null;
};

type IssueArticleJoin = {
  issue_id: string;
  position: number | null;
  article: IssueArticle | null;
};

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const url = new URL(request.url);
  const availablePage = parseInt(
    url.searchParams.get("availablePage") || "1",
    10,
  );
  const availablePerPage = 50;

  const { data: attachedArticleRows } = await supabase
    .from("issue_articles")
    .select("article_id");
  const safeAttachedArticleRows = attachedArticleRows ?? [];

  const attachedArticleIds = new Set(
    safeAttachedArticleRows.map((row) => row.article_id).filter(Boolean),
  );

  const excludedList =
    attachedArticleIds.size > 0
      ? Array.from(attachedArticleIds)
          .map((id) => `"${id}"`)
          .join(",")
      : null;

  let countQuery = supabase
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("status", "published");

  if (excludedList) {
    countQuery = countQuery.not("id", "in", `(${excludedList})`);
  }

  const { count: availableCount } = await countQuery;

  let dataQuery = supabase
    .from("articles")
    .select(
      `
        id,
        title,
        description,
        created_at,
        authors:article_authors(
          profile_id,
          profile:profiles!article_authors_profile_id_fkey(
            id,
            full_name,
            role_type
          )
        ),
        issue_articles:issue_articles!left(article_id)(
          issue_id
        )
      `,
    )
    .eq("status", "published");

  if (excludedList) {
    dataQuery = dataQuery.not("id", "in", `(${excludedList})`);
  }

  const { data: availablePapersRaw } = await dataQuery
    .order("created_at", { ascending: false })
    .range(
      (availablePage - 1) * availablePerPage,
      availablePage * availablePerPage - 1,
    );
  const availablePapers = (availablePapersRaw ?? []) as unknown as AvailablePaper[];

  const { data: issuesRaw, error: issuesError } = await supabase
    .from("issues")
    .select("*")
    .order("created_at", { ascending: false });
  const issues = (issuesRaw ?? []) as unknown as IssueRecord[];

  let issueArticles: IssueArticleJoin[] = [];

  const issueIds = issues.map((i) => i.id);
  if (issueIds.length) {
    const { data: issueArticlesRaw } = await supabase
      .from("issue_articles")
      .select(
        `
          issue_id,
          position,
          article:articles(
            id,
            title,
            created_at,
            authors:article_authors(
              profile_id,
              profile:profiles!article_authors_profile_id_fkey(
                id,
                full_name,
                role_type
              )
            )
          )
        `,
      )
      .in("issue_id", issueIds)
      .order("position", { ascending: true });

    issueArticles = (issueArticlesRaw ?? []) as unknown as IssueArticleJoin[];
  }

  const issuesWithArticles = issues.map((issue) => ({
    ...issue,
    formattedDate: formatDate(issue.release_date ?? issue.created_at),
    articles: issueArticles
      .filter((ia) => ia.issue_id === issue.id)
      .map((ia) => ia.article)
      .filter((article): article is IssueArticle => Boolean(article)),
  }));

  const formattedPapers = availablePapers.map((paper) => ({
    ...paper,
    formattedDate: formatDate(paper.created_at),
  }));

  const schemaMissing = Boolean(issuesError);

  return {
    publishedPapers: formattedPapers,
    issues: issuesWithArticles,
    availablePage,
    availableTotalPages: Math.max(
      1,
      Math.ceil((availableCount || 0) / availablePerPage),
    ),
    schemaMissing,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const issueId = formData.get("issueId") as string | null;
  const MAX_COVER_SIZE = 10 * 1024 * 1024; // 10 MB

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_type")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role_type === "admin";

  if (!isAdmin) {
    return { error: "Only admins can manage issues." };
  }

  if (intent === "delete-issue") {
    if (!issueId) return { error: "Missing issue" };
    await cleanupIssuesAndVolumes(supabase, [issueId], { force: true });
    return { success: "deleted" as const };
  }

  if (intent === "create-issue") {
    const title = ((formData.get("title") as string) || "").trim();
    const description =
      ((formData.get("description") as string) || "").trim() || null;
    const status =
      formData.get("status") === "draft"
        ? ("draft" as const)
        : ("released" as const);
    const coverFile = formData.get("cover") as File | null;
    const articleIds = Array.from(
      new Set(
        formData
      .getAll("paperIds")
      .map((id: FormDataEntryValue) => (id ? String(id) : ""))
      .filter(Boolean),
      ),
    );

    if (!title) return { error: "Title is required." };
    if (!articleIds.length) {
      return { error: "Select at least one published paper." };
    }
    if (!coverFile || typeof coverFile === "string" || coverFile.size === 0) {
      return { error: "Cover image is required." };
    }
    if (coverFile.size > MAX_COVER_SIZE) {
      return { error: "Cover image is too large. Maximum size is 10 MB." };
    }
    if (coverFile.type && !coverFile.type.startsWith("image/")) {
      return { error: "Cover must be an image file." };
    }

    const { data: selectedArticles, error: selectedArticlesError } =
      await supabase
        .from("articles")
        .select("id,status")
        .in("id", articleIds);

    if (selectedArticlesError) {
      return { error: "Failed to validate selected papers." };
    }

    if ((selectedArticles?.length ?? 0) !== articleIds.length) {
      return {
        error:
          "Some selected papers no longer exist. Refresh and select again.",
      };
    }

    const hasNonPublished = (selectedArticles ?? []).some(
      (article) => article.status !== "published",
    );
    if (hasNonPublished) {
      return {
        error:
          "Only published papers can be attached to an issue. Refresh and try again.",
      };
    }

    const { data: existingLinks, error: existingLinksError } = await supabase
      .from("issue_articles")
      .select("article_id")
      .in("article_id", articleIds);

    if (existingLinksError) {
      return { error: "Failed to verify duplicate paper assignments." };
    }

    if ((existingLinks ?? []).length > 0) {
      return {
        error:
          "Some selected papers are already attached to another issue. Refresh and try again.",
      };
    }

    const release_date =
      status === "released" ? new Date().toISOString() : null;

    const { data: issue, error } = await supabase
      .from("issues")
      .insert({ title, description, status, release_date })
      .select("id")
      .single();

    if (error || !issue) {
      return { error: "Failed to create issue." };
    }

    const rollbackIssue = async () => {
      await supabase.from("issue_articles").delete().eq("issue_id", issue.id);
      await supabase.from("issues").delete().eq("id", issue.id);
    };

    const mappings = articleIds.map((articleId: string, idx: number) => ({
      issue_id: issue.id,
      article_id: articleId,
      position: idx,
    }));

    const { error: mappingError } = await supabase
      .from("issue_articles")
      .insert(mappings);

    if (mappingError) {
      await rollbackIssue();
      if (mappingError.code === "23505") {
        return {
          error:
            "Some selected papers were assigned to another issue just now. Refresh and try again.",
        };
      }
      return { error: "Issue created, but failed to attach papers." };
    }

    const path = `${user.id}/issues/${issue.id}/${Date.now()}-${coverFile.name}`;
    const { error: uploadError } = await supabase.storage
      .from("covers")
      .upload(path, coverFile, { contentType: coverFile.type || undefined });
    if (uploadError) {
      await rollbackIssue();
      return { error: "Issue created, but failed to upload cover." };
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from("covers").getPublicUrl(path);
    const { error: updateCoverError } = await supabase
      .from("issues")
      .update({ cover_url: publicUrl })
      .eq("id", issue.id);
    if (updateCoverError) {
      await supabase.storage.from("covers").remove([path]);
      await rollbackIssue();
      return { error: "Issue created, but failed to save cover URL." };
    }

    return { success: "created" as const };
  }

  return { error: "Unknown action." };
}

export default function IssuesPage() {
  const {
    publishedPapers,
    issues,
    availablePage,
    availableTotalPages,
    schemaMissing,
  } = useLoaderData<typeof loader>();
  const rootData = useRootLoaderData();
  const user = rootData?.user;
  const profile = rootData?.profile;
  const isAdmin = profile?.role_type === "admin";
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const createFormRef = useRef<HTMLFormElement>(null);
  const [coverName, setCoverName] = useState<string | null>(null);
  const isCreatingIssue =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "create-issue";

  useEffect(() => {
    if (actionData?.success === "created") {
      createFormRef.current?.reset();
      setCoverName(null);
    }
  }, [actionData?.success]);

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="page-body">
        <div className="section">
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Issues</h1>
              <p className="muted" style={{ margin: 0 }}>
                Group published papers into issues. Released issues can be
                bundled into volumes.
              </p>
            </div>
            <Link to="/volumes" className="btn btn-ghost">
              View Volumes
            </Link>
          </div>
        </div>

        {schemaMissing && (
          <div className="section-compact subtle" style={{ marginBottom: 10 }}>
            <p className="text-sm" style={{ margin: 0 }}>
              Issues tables are missing in Supabase. Run the migration before
              using this page.
            </p>
          </div>
        )}

        {isAdmin && (
          <div className="section">
            <div
              className="row"
              style={{ justifyContent: "space-between", marginBottom: 12 }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Create Issue</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Pick published papers and release immediately or save as
                  draft.
                </p>
              </div>
              <span className="pill">Admin only</span>
            </div>

            {actionData?.error && (
              <div
                className="section-compact subtle"
                style={{ marginBottom: 10 }}
              >
                <p className="text-sm" style={{ color: "#f6b8bd", margin: 0 }}>
                  {actionData.error}
                </p>
              </div>
            )}
            {actionData?.success && (
              <div
                className="section-compact subtle"
                style={{ marginBottom: 10 }}
              >
                <p
                  className="text-sm"
                  style={{ color: "var(--accent)", margin: 0 }}
                >
                  {actionData.success === "deleted"
                    ? "Issue deleted."
                    : "Issue created."}
                </p>
              </div>
            )}

            <Form
              method="post"
              encType="multipart/form-data"
              className="list"
              style={{ gap: 12 }}
              ref={createFormRef}
            >
              <input type="hidden" name="intent" value="create-issue" />
              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 2 }}>
                  <label className="label">Issue title</label>
                  <input
                    name="title"
                    type="text"
                    className="input"
                    placeholder="e.g., Winter 2025 Issue"
                    required
                  />
                </div>
                <div style={{ width: 200 }}>
                  <label className="label">Status</label>
                  <select
                    name="status"
                    className="input"
                    defaultValue="released"
                  >
                    <option value="released">release now</option>
                    <option value="draft">draft</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Description (optional)</label>
                <textarea
                  name="description"
                  className="textarea"
                  rows={3}
                  placeholder="Short blurb for this issue"
                />
              </div>

              <div>
                <label className="label">Cover image (required)</label>
                <input
                  type="file"
                  name="cover"
                  accept="image/*"
                  className="input"
                  required
                  onChange={(e) =>
                    setCoverName(e.target.files?.[0]?.name || null)
                  }
                />
                {coverName && (
                  <span className="muted text-sm">Selected: {coverName}</span>
                )}
              </div>

              <div>
                <label className="label">Pick published papers</label>
                {publishedPapers.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    No published papers yet.
                  </p>
                ) : (
                  <div
                    className="section-compact"
                    style={{ maxHeight: 320, overflow: "auto" }}
                  >
                    <div
                      className="section-compact"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "30px 1fr 200px 120px",
                        gap: 8,
                        padding: "8px 10px",
                        borderBottom: `1px solid var(--border)`,
                        background: "var(--surface-2)",
                      }}
                    >
                      <span />
                      <span className="muted" style={{ fontWeight: 600 }}>
                        Paper
                      </span>
                      <span className="muted" style={{ fontWeight: 600 }}>
                        Author
                      </span>
                      <span
                        className="muted"
                        style={{ fontWeight: 600, textAlign: "right" }}
                      >
                        Date
                      </span>
                    </div>
                    {publishedPapers.map((paper) => (
                      <label
                        key={paper.id}
                        className="section-compact"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "30px 1fr 200px 120px",
                          gap: 8,
                          alignItems: "center",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          name="paperIds"
                          value={paper.id}
                        />
                        <div
                          className="row"
                          style={{ gap: 6, alignItems: "center" }}
                        >
                          <span style={{ fontWeight: 600 }}>{paper.title}</span>
                          <span
                            className="pill"
                            style={{ background: "#103c2d" }}
                          >
                            Published
                          </span>
                        </div>
                        <div className="muted text-sm">
                          <AuthorList authors={paper.authors ?? undefined} />
                        </div>
                        <div
                          className="muted text-sm"
                          style={{ textAlign: "right" }}
                        >
                          {paper.formattedDate}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                {availableTotalPages > 1 && (
                  <div className="row" style={{ gap: 6, marginTop: 8 }}>
                    <Link
                      to={`/issues?availablePage=${Math.max(1, availablePage - 1)}`}
                      className="btn btn-ghost"
                      aria-disabled={availablePage <= 1}
                      style={{
                        pointerEvents: availablePage <= 1 ? "none" : "auto",
                        opacity: availablePage <= 1 ? 0.5 : 1,
                      }}
                    >
                      Prev
                    </Link>
                    <span className="muted text-sm">
                      Page {availablePage} of {availableTotalPages}
                    </span>
                    <Link
                      to={`/issues?availablePage=${Math.min(availableTotalPages, availablePage + 1)}`}
                      className="btn btn-ghost"
                      aria-disabled={availablePage >= availableTotalPages}
                      style={{
                        pointerEvents:
                          availablePage >= availableTotalPages
                            ? "none"
                            : "auto",
                        opacity: availablePage >= availableTotalPages ? 0.5 : 1,
                      }}
                    >
                      Next
                    </Link>
                  </div>
                )}
              </div>

              <div
                className="row"
                style={{ justifyContent: "flex-end", gap: 8 }}
              >
                <button
                  type="submit"
                  className="btn btn-accent"
                  disabled={isCreatingIssue}
                >
                  {isCreatingIssue ? "Creating..." : "Create issue"}
                </button>
              </div>
            </Form>
          </div>
        )}

        <div className="section">
          <div
            className="row"
            style={{ justifyContent: "space-between", marginBottom: 10 }}
          >
            <h2 style={{ margin: 0, fontSize: 18 }}>Released & draft issues</h2>
            <span className="muted text-sm">
              {issues.length} {issues.length === 1 ? "issue" : "issues"}
            </span>
          </div>

          {issues.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No issues yet. Create one from the published papers above.
            </p>
          ) : (
            <div className="column" style={{ gap: 10 }}>
              {issues.map((issue) => (
                <div
                  key={issue.id}
                  className="section-compact"
                  style={{ gap: 6 }}
                >
                  <div
                    className="row"
                    style={{
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div
                      className="row"
                      style={{ gap: 8, alignItems: "center" }}
                    >
                      {issue.cover_url && (
                        <img
                          src={issue.cover_url}
                          alt={`${issue.title} cover`}
                          style={{
                            width: 48,
                            height: 48,
                            objectFit: "cover",
                            borderRadius: 6,
                          }}
                        />
                      )}
                      <Link
                        to={`/issues/${issue.id}`}
                        className="nav-link"
                        style={{ padding: 0 }}
                      >
                        <h3 style={{ margin: 0 }}>{issue.title}</h3>
                      </Link>
                      <span
                        className="pill"
                        style={{
                          background:
                            issue.status === "released"
                              ? "var(--accent-muted)"
                              : "var(--surface-2)",
                          color:
                            issue.status === "released"
                              ? "var(--accent-strong)"
                              : "var(--text)",
                        }}
                      >
                        {issue.status}
                      </span>
                    </div>
                    <div
                      className="row"
                      style={{ gap: 8, alignItems: "center" }}
                    >
                      <span className="muted text-sm">
                        {issue.formattedDate}
                      </span>
                      {isAdmin && (
                        <Form
                          method="post"
                          onSubmit={(e) => {
                            if (
                              !confirm(
                                "Delete this issue? Papers will simply become available again.",
                              )
                            ) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <input
                            type="hidden"
                            name="intent"
                            value="delete-issue"
                          />
                          <input
                            type="hidden"
                            name="issueId"
                            value={issue.id}
                          />
                          <button
                            type="submit"
                            className="btn btn-ghost"
                            style={{ color: "#f6b8bd" }}
                          >
                            Delete
                          </button>
                        </Form>
                      )}
                    </div>
                  </div>
                  {issue.description && (
                    <p className="muted text-sm" style={{ margin: 0 }}>
                      {issue.description}
                    </p>
                  )}
                  <div className="column" style={{ gap: 6 }}>
                    {(issue.articles || []).length === 0 ? (
                      <p className="muted text-sm" style={{ margin: 0 }}>
                        No papers attached yet.
                      </p>
                    ) : (
                      issue.articles.map((article) =>
                        article ? (
                          <div
                            key={article.id}
                            className="row"
                            style={{
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div
                              className="row"
                              style={{ gap: 8, alignItems: "center" }}
                            >
                              <Link
                                to={`/papers/${article.id}`}
                                className="nav-link"
                                style={{ padding: 0 }}
                              >
                                {article.title}
                              </Link>
                              {article.authors?.[0]?.profile?.role_type && (
                                <RoleBadge
                                  role={article.authors[0].profile.role_type}
                                />
                              )}
                            </div>
                            <div
                              className="muted text-sm"
                              style={{ textAlign: "right" }}
                            >
                              <AuthorList authors={article.authors ?? undefined} />
                            </div>
                          </div>
                        ) : null,
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

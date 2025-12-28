import { Form, Link, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/issues";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { UserLink } from "~/components/user-link";
import { RoleBadge } from "~/components/role-badge";

type IssueRecord = {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "released";
  created_at: string;
  release_date: string | null;
};

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, role_type, admin_type")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  const isAdmin =
    profile?.role_type === "admin" || profile?.admin_type === "admin";

  const { data: publishedPapers = [] } = await supabase
    .from("articles")
    .select(
      `
        id,
        title,
        description,
        created_at,
        author:profiles!author_id (
          id,
          full_name,
          role_type
        )
      `
    )
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const {
    data: issues = [],
    error: issuesError,
  } = await supabase
    .from("issues")
    .select("*")
    .order("created_at", { ascending: false });

  let issueArticles: {
    issue_id: string;
    position: number | null;
    article: {
      id: string;
      title: string;
      created_at: string;
      author?: { id: string; full_name: string | null; role_type: string | null };
    } | null;
  }[] = [];

  const issueIds = (issues || []).map((i) => i.id);
  if (issueIds.length) {
    const { data } = await supabase
      .from("issue_articles")
      .select(
        `
          issue_id,
          position,
          article:articles(
            id,
            title,
            created_at,
            author:profiles!author_id(
              id,
              full_name,
              role_type
            )
          )
        `
      )
      .in("issue_id", issueIds)
      .order("position", { ascending: true });

    if (data) {
      issueArticles = data;
    }
  }

  const issuesWithArticles = (issues || []).map((issue: IssueRecord) => ({
    ...issue,
    articles: issueArticles
      .filter((ia) => ia.issue_id === issue.id)
      .map((ia) => ia.article)
      .filter(Boolean),
  }));

  const schemaMissing = Boolean(issuesError);

  return {
    user,
    profile,
    isAdmin,
    publishedPapers,
    issues: issuesWithArticles,
    schemaMissing,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_type, admin_type")
    .eq("id", user.id)
    .single();

  const isAdmin =
    profile?.role_type === "admin" || profile?.admin_type === "admin";

  if (!isAdmin) {
    return { error: "Only admins can manage issues." };
  }

  if (intent === "create-issue") {
    const title = ((formData.get("title") as string) || "").trim();
    const description =
      ((formData.get("description") as string) || "").trim() || null;
    const status =
      formData.get("status") === "draft" ? ("draft" as const) : ("released" as const);
    const articleIds = formData
      .getAll("paperIds")
      .map((id) => (id ? String(id) : ""))
      .filter(Boolean);

    if (!title) return { error: "Title is required." };
    if (!articleIds.length) {
      return { error: "Select at least one published paper." };
    }

    const release_date = status === "released" ? new Date().toISOString() : null;

    const { data: issue, error } = await supabase
      .from("issues")
      .insert({ title, description, status, release_date })
      .select("id")
      .single();

    if (error || !issue) {
      return { error: "Failed to create issue." };
    }

    const mappings = articleIds.map((articleId, idx) => ({
      issue_id: issue.id,
      article_id: articleId,
      position: idx,
    }));

    const { error: mappingError } = await supabase
      .from("issue_articles")
      .insert(mappings);

    if (mappingError) {
      return { error: "Issue created, but failed to attach papers." };
    }

    return { success: true };
  }

  return { error: "Unknown action." };
}

export default function IssuesPage() {
  const { user, profile, isAdmin, publishedPapers, issues, schemaMissing } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="page-body">
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Issues</h1>
              <p className="muted" style={{ margin: 0 }}>
                Group published papers into issues. Released issues can be bundled into volumes.
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
              Issues tables are missing in Supabase. Run the migration before using this page.
            </p>
          </div>
        )}

        {isAdmin && (
          <div className="section">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Create Issue</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Pick published papers and release immediately or save as draft.
                </p>
              </div>
              <span className="pill">Admin only</span>
            </div>

            {actionData?.error && (
              <div className="section-compact subtle" style={{ marginBottom: 10 }}>
                <p className="text-sm" style={{ color: "#f6b8bd", margin: 0 }}>
                  {actionData.error}
                </p>
              </div>
            )}
            {actionData?.success && (
              <div className="section-compact subtle" style={{ marginBottom: 10 }}>
                <p className="text-sm" style={{ color: "var(--accent)", margin: 0 }}>
                  Issue created.
                </p>
              </div>
            )}

            <Form method="post" className="list" style={{ gap: 12 }}>
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
                  <select name="status" className="input" defaultValue="released">
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
                <label className="label">Pick published papers</label>
                {publishedPapers.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    No published papers yet.
                  </p>
                ) : (
                  <div className="section-compact" style={{ maxHeight: 320, overflow: "auto" }}>
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
                      <span className="muted" style={{ fontWeight: 600, textAlign: "right" }}>
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
                        <input type="checkbox" name="paperIds" value={paper.id} />
                        <div className="row" style={{ gap: 6, alignItems: "center" }}>
                          <span style={{ fontWeight: 600 }}>{paper.title}</span>
                          <span className="pill" style={{ background: "#103c2d" }}>
                            Published
                          </span>
                        </div>
                        <div className="muted text-sm">
                          <UserLink user={paper.author} fallback="Unknown" />
                        </div>
                        <div className="muted text-sm" style={{ textAlign: "right" }}>
                          {new Date(paper.created_at).toLocaleDateString()}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button type="submit" className="btn btn-accent">
                  Create issue
                </button>
              </div>
            </Form>
          </div>
        )}

        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
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
                <div key={issue.id} className="section-compact" style={{ gap: 6 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div className="row" style={{ gap: 8, alignItems: "center" }}>
                      <h3 style={{ margin: 0 }}>{issue.title}</h3>
                      <span
                        className="pill"
                        style={{
                          background: issue.status === "released" ? "var(--accent-muted)" : "var(--surface-2)",
                          color: issue.status === "released" ? "var(--accent-strong)" : "var(--text)",
                        }}
                      >
                        {issue.status}
                      </span>
                    </div>
                    <span className="muted text-sm">
                      {issue.release_date
                        ? new Date(issue.release_date).toLocaleDateString()
                        : new Date(issue.created_at).toLocaleDateString()}
                    </span>
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
                            style={{ justifyContent: "space-between", alignItems: "center" }}
                          >
                            <div className="row" style={{ gap: 8, alignItems: "center" }}>
                              <Link to={`/papers/${article.id}`} className="nav-link" style={{ padding: 0 }}>
                                {article.title}
                              </Link>
                              <RoleBadge role={article.author?.role_type || "mentee"} />
                            </div>
                            <div className="muted text-sm" style={{ textAlign: "right" }}>
                              <UserLink user={article.author} fallback="Unknown" />
                            </div>
                          </div>
                        ) : null
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

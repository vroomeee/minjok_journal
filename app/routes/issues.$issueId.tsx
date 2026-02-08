import { Link, useLoaderData, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/issues.$issueId";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { AuthorList } from "~/components/author-list";
import { RoleBadge } from "~/components/role-badge";

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

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { issueId } = params;

  const { data: issue, error } = await supabase
    .from("issues")
    .select("*")
    .eq("id", issueId)
    .single();

  if (error || !issue) {
    throw new Response("Issue not found", { status: 404 });
  }

  // Get articles in this issue
  const { data: issueArticles } = await supabase
    .from("issue_articles")
    .select(`
      position,
      article:articles (
        id,
        title,
        description,
        status,
        created_at,
        authors:article_authors (
          profile_id,
          profile:profiles!article_authors_profile_id_fkey (
            id,
            full_name,
            role_type
          )
        )
      )
    `)
    .eq("issue_id", issueId)
    .order("position", { ascending: true });

  const articles = (issueArticles || [])
    .map((ia) => ia.article)
    .filter(Boolean)
    .map((article) => ({
      ...article,
      formattedDate: formatDate(article.created_at),
    }));

  // Check if this issue belongs to a volume
  const { data: volumeIssue } = await supabase
    .from("volume_issues")
    .select(`
      volume:volumes (
        id,
        title,
        status
      )
    `)
    .eq("issue_id", issueId)
    .single();

  const parentVolume = volumeIssue?.volume || null;

  return {
    issue: {
      ...issue,
      formattedDate: formatDate(issue.release_date ?? issue.created_at),
    },
    articles,
    parentVolume,
  };
}

export default function IssueDetail() {
  const { issue, articles, parentVolume } = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData("root") as
    | { user?: { id: string }; profile?: { role_type?: string | null } }
    | null;
  const user = rootData?.user;
  const profile = rootData?.profile;
  const isAdmin = profile?.role_type === "admin";

  // Non-admins can only see released issues
  if (issue.status !== "released" && !isAdmin) {
    throw new Response("Issue not found", { status: 404 });
  }

  // Filter articles - only show published ones to non-admins
  const visibleArticles = articles.filter(
    (article) => article.status === "published" || isAdmin
  );

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="page-body">
        <div className="section">
          <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
            {issue.cover_url && (
              <img
                src={issue.cover_url}
                alt={`${issue.title} cover`}
                style={{
                  width: 120,
                  height: 160,
                  objectFit: "cover",
                  borderRadius: 8,
                }}
              />
            )}
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                <Link to="/issues" className="muted text-sm" style={{ textDecoration: "none" }}>
                  Issues
                </Link>
                {parentVolume && parentVolume.status === "released" && (
                  <>
                    <span className="muted text-sm">·</span>
                    <Link
                      to={`/volumes/${parentVolume.id}`}
                      className="muted text-sm"
                      style={{ textDecoration: "none" }}
                    >
                      {parentVolume.title}
                    </Link>
                  </>
                )}
              </div>
              <h1 style={{ fontSize: 24, margin: 0 }}>{issue.title}</h1>
              <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center" }}>
                <span
                  className="pill"
                  style={{
                    background: issue.status === "released" ? "var(--accent-muted)" : "var(--surface-2)",
                    color: issue.status === "released" ? "var(--accent-strong)" : "var(--text)",
                  }}
                >
                  {issue.status}
                </span>
                <span className="muted text-sm">{issue.formattedDate}</span>
              </div>
              {issue.description && (
                <p className="muted" style={{ marginTop: 12 }}>
                  {issue.description}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Articles</h2>
            <span className="muted text-sm">
              {visibleArticles.length} {visibleArticles.length === 1 ? "article" : "articles"}
            </span>
          </div>

          {visibleArticles.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No articles in this issue yet.
            </p>
          ) : (
            <div className="column" style={{ gap: 12 }}>
              {visibleArticles.map((article, index) => (
                <Link
                  key={article.id}
                  to={`/papers/${article.id}`}
                  className="section-compact"
                  style={{
                    gap: 8,
                    textDecoration: "none",
                    color: "inherit",
                    transition: "background 0.15s",
                  }}
                >
                  <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                    <span
                      className="muted"
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        minWidth: 24,
                        textAlign: "right",
                      }}
                    >
                      {index + 1}.
                    </span>
                    <div style={{ flex: 1 }}>
                      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <h3 style={{ margin: 0, fontSize: 16 }}>{article.title}</h3>
                        {isAdmin && article.status !== "published" && (
                          <span className="pill subtle">{article.status}</span>
                        )}
                      </div>
                      <div className="row" style={{ gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <AuthorList authors={article.authors} />
                        {article.authors?.[0]?.profile?.role_type && (
                          <RoleBadge role={article.authors[0].profile.role_type} />
                        )}
                      </div>
                      {article.description && (
                        <p className="muted text-sm" style={{ margin: "6px 0 0" }}>
                          {article.description}
                        </p>
                      )}
                    </div>
                    <span className="muted text-sm" style={{ whiteSpace: "nowrap" }}>
                      {article.formattedDate}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

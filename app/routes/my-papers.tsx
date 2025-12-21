import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/my-papers";
import { requireUser, createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: papers } = await supabase
    .from("articles")
    .select(
      `
      *,
      versions:article_versions!article_versions_article_id_fkey (
        id,
        version_number,
        created_at
      )
    `
    )
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });

  return { papers: papers || [], user, profile };
}

export default function MyPapers() {
  const { papers, user, profile } = useLoaderData<typeof loader>();

  return (
    <div className="page">
      <Nav user={user} profile={profile || undefined} />

      <div className="page-body">
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>My Papers</h1>
              <p className="muted" style={{ margin: 0 }}>
                Manage your submissions.
              </p>
            </div>
            <Link to="/papers/new" className="btn btn-accent">
              New Paper
            </Link>
          </div>
        </div>

        {papers.length === 0 ? (
          <div className="section">
            <p className="muted" style={{ margin: 0 }}>
              No papers yet.
            </p>
          </div>
        ) : (
          <div className="card-grid">
            {papers.map((paper) => (
              <div key={paper.id} className="section-compact">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <Link to={`/papers/${paper.id}`} className="nav-link" style={{ padding: 0 }}>
                      <h3 style={{ margin: 0, fontSize: 16, color: "var(--text)" }}>
                        {paper.title}
                      </h3>
                    </Link>
                    <div className="row" style={{ gap: 8, marginTop: 4 }}>
                      <span className="muted" style={{ fontSize: 13 }}>
                        Status: {paper.status}
                      </span>
                      {profile && <RoleBadge role={profile.role_type} />}
                      <span className="muted" style={{ fontSize: 13 }}>
                        {new Date(paper.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <span className="pill">{paper.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

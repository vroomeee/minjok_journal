import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/review";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  const { data: papers } = await supabase
    .from("articles")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        username,
        full_name,
        role_type
      ),
      current_version:article_versions!current_version_id (
        id,
        version_number,
        created_at
      )
    `
    )
    .eq("status", "in_review")
    .order("updated_at", { ascending: false });

  return { papers: papers || [], user, profile };
}

export default function ReviewQueue() {
  const { papers, user, profile } = useLoaderData<typeof loader>();

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />
      <div className="page-body">
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Review Queue</h1>
              <p className="muted" style={{ margin: 0 }}>
                Papers awaiting review.
              </p>
            </div>
          </div>
        </div>

        {papers.length === 0 ? (
          <div className="section">
            <p className="muted" style={{ margin: 0 }}>
              No papers in review.
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
                        by {paper.author?.username || paper.author?.full_name}
                      </span>
                      {paper.author && <RoleBadge role={paper.author.role_type} />}
                      <span className="muted" style={{ fontSize: 13 }}>
                        Submitted: {new Date(paper.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    {paper.current_version && (
                      <div style={{ marginTop: 6 }}>
                        <Link
                          to={`/papers/${paper.id}/versions/${paper.current_version.id}`}
                          className="btn btn-ghost"
                        >
                          Review Version {paper.current_version.version_number}
                        </Link>
                      </div>
                    )}
                  </div>
                  <span className="pill" style={{ background: "#2f2a17" }}>
                    In Review
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

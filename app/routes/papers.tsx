import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/papers";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";

// Server-side loader to fetch all published papers
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

  const { data: papers, error } = await supabase
    .from("articles")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        username,
        full_name,
        role_type
      )
    `
    )
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Response("Failed to load papers", { status: 500 });
  }

  return { papers: papers || [], user, profile };
}

export default function Papers() {
  const { papers, user, profile } = useLoaderData<typeof loader>();

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="page-body">
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Published Papers</h1>
              <p className="muted" style={{ margin: 0 }}>
                Explore all published submissions.
              </p>
            </div>
            {user && (
              <Link to="/papers/new" className="btn btn-accent">
                Submit New Paper
              </Link>
            )}
          </div>
        </div>

        {papers.length === 0 ? (
          <div className="section">
            <p className="muted" style={{ margin: 0 }}>
              No papers submitted yet.
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
                        {new Date(paper.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <span className="pill">Published</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

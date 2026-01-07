import { useLoaderData, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/$userId";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { Link } from "react-router";

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { userId } = params;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !profile) throw new Response("Profile not found", { status: 404 });

  const { data: papers } = await supabase
    .from("articles")
    .select("*")
    .eq("author_id", userId)
    .order("created_at", { ascending: false });

  return { profile, papers: papers || [] };
}

export default function ProfilePage() {
  const { profile, papers } = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData("root") as
    | { user?: { id: string }; profile?: { role_type?: string | null; email?: string | null; full_name?: string | null; intro?: string | null } }
    | null;
  const user = rootData?.user;
  const currentUserProfile = rootData?.profile;
  const isOwnProfile = user?.id === profile.id;

  return (
    <div className="page">
      <Nav user={user || undefined} profile={currentUserProfile || undefined} />

      <div className="page-body">
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>
                {profile.full_name || profile.email || "Unnamed User"}
              </h1>
              <div className="row" style={{ gap: 8, marginTop: 4 }}>
                <span className="muted">{profile.email || profile.id}</span>
                {profile.role_type && <RoleBadge role={profile.role_type} />}
              </div>
            </div>
            {isOwnProfile && (
              <Link to={`/profile/${profile.id}/edit`} className="btn btn-ghost">
                Edit Profile
              </Link>
            )}
          </div>

          {profile.intro && (
            <p className="muted" style={{ marginTop: 8 }}>
              {profile.intro}
            </p>
          )}

        </div>

        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>Papers</h2>
            {isOwnProfile && (
              <Link to="/papers/new" className="btn btn-ghost">
                New Paper
              </Link>
            )}
          </div>
          {papers.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No papers yet.
            </p>
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
                      <p className="muted" style={{ margin: "2px 0" }}>
                        {new Date(paper.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="pill">{paper.status}</span>
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

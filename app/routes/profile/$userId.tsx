import { useLoaderData, Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/$userId";
import { createSupabaseServerClient, getUserProfile } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { Link } from "react-router";

export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { userId } = params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let currentUserProfile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    currentUserProfile = data;
  }

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

  return { user, currentUserProfile, profile, papers: papers || [] };
}

export async function action({ request, params }: Route.ActionArgs) {
  const { user } = await getUserProfile(request);
  const { supabase } = createSupabaseServerClient(request);
  const { userId } = params;

  if (user.id !== userId) {
    throw new Response("Unauthorized", { status: 403 });
  }

  const formData = await request.formData();
  const fullName = formData.get("full_name") as string;
  const intro = formData.get("intro") as string;

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName, intro })
    .eq("id", userId);

  if (error) return { error: "Failed to update profile" };
  return redirect(`/profile/${userId}`);
}

export default function ProfilePage() {
  const { user, currentUserProfile, profile, papers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
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
          </div>

          {profile.intro && (
            <p className="muted" style={{ marginTop: 8 }}>
              {profile.intro}
            </p>
          )}

          {actionData?.error && (
            <div className="section-compact subtle" style={{ marginTop: 10 }}>
              <p className="text-sm" style={{ color: "#f6b8bd" }}>
                {actionData.error}
              </p>
            </div>
          )}

          {isOwnProfile && (
            <div className="section-compact" style={{ marginTop: 10 }}>
              <h3 style={{ fontSize: 16, margin: "0 0 6px" }}>Edit Profile</h3>
              <Form method="post" className="list">
                <div>
                  <label className="label">Full Name</label>
                  <input
                    type="text"
                    name="full_name"
                    defaultValue={profile.full_name || ""}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Intro</label>
                  <textarea
                    name="intro"
                    rows={3}
                    className="textarea"
                    defaultValue={profile.intro || ""}
                  />
                </div>
                <div className="row">
                  <button type="submit" className="btn btn-accent">
                    Save
                  </button>
                </div>
              </Form>
            </div>
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

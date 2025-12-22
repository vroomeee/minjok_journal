import { Form, redirect, useActionData, useLoaderData, Link } from "react-router";
import type { Route } from "./+types/$userId.edit";
import { createSupabaseServerClient, getUserProfile } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

export async function loader({ request, params }: Route.LoaderArgs) {
  const { user } = await getUserProfile(request);
  const { supabase } = createSupabaseServerClient(request);
  const { userId } = params;

  if (user.id !== userId) {
    throw new Response("Unauthorized", { status: 403 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !profile) throw new Response("Profile not found", { status: 404 });

  return { user, profile };
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

export default function EditProfilePage() {
  const { user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />
      <div className="page-body" style={{ maxWidth: 720 }}>
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Edit Profile</h1>
              <p className="muted" style={{ margin: 0 }}>
                Update your name and intro.
              </p>
            </div>
            <Link to={`/profile/${profile.id}`} className="btn btn-ghost">
              Back to profile
            </Link>
          </div>

          {actionData?.error && (
            <div className="section-compact subtle" style={{ marginBottom: 10 }}>
              <p className="text-sm" style={{ color: "#f6b8bd" }}>
                {actionData.error}
              </p>
            </div>
          )}

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
              <Link to={`/profile/${profile.id}`} className="btn btn-ghost">
                Cancel
              </Link>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}

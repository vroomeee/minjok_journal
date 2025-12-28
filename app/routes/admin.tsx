import { Link, useLoaderData, useFetcher, useRevalidator } from "react-router";
import type { Route } from "./+types/admin";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { useEffect } from "react";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role_type: "mentor" | "mentee" | "admin" | "prof" | null;
  admin_type?: "admin" | "user" | null;
  created_at?: string;
};

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const user = await requireUser(request);

  const { data: me } = await supabase
    .from("profiles")
    .select("id, admin_type, full_name, email, role_type")
    .eq("id", user.id)
    .single();

  const isAdmin = me?.role_type === "admin" || me?.admin_type === "admin";

  if (!isAdmin) {
    throw new Response("Forbidden", { status: 403 });
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, email, full_name, role_type, admin_type, created_at")
    .order("created_at", { ascending: true });

  return { profiles: profiles || [], me, user };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  const { data: me } = await supabase
    .from("profiles")
    .select("admin_type, role_type")
    .eq("id", user.id)
    .single();

  const isAdmin = me?.role_type === "admin" || me?.admin_type === "admin";

  if (!isAdmin) {
    return { error: "Only admins can update roles" };
  }

  if (intent === "update") {
    const targetId = formData.get("userId") as string;
    const admin_type = formData.get("admin_type") as "admin" | "user" | null;
    const role_type = formData.get("role_type") as "mentor" | "mentee" | "admin" | "prof" | null;

    if (!targetId) return { error: "Missing user" };
    if (admin_type && !["admin", "user"].includes(admin_type)) {
      return { error: "Invalid admin status" };
    }
    if (role_type && !["mentor", "mentee", "admin", "prof"].includes(role_type)) {
      return { error: "Invalid role type" };
    }

    const { error } = await supabase
      .from("profiles")
      .update({ admin_type, role_type })
      .eq("id", targetId);
    if (error) return { error: "Failed to update user" };

    return { success: true };
  }

  return { error: "Unknown action" };
}

export default function AdminPage() {
  const { profiles, me, user } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();

  useEffect(() => {
    if (fetcher.data?.success) {
      revalidator.revalidate();
    }
  }, [fetcher.data, revalidator]);

  return (
    <div className="page">
      <Nav user={user || undefined} profile={me || undefined} />

      <div className="page-body">
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Admin Panel</h1>
              <p className="muted" style={{ margin: 0 }}>
                Manage user roles and admin access.
              </p>
            </div>
            <Link to="/" className="btn btn-ghost">
              Back Home
            </Link>
          </div>
        </div>

        <div className="section-compact" style={{ marginBottom: 10 }}>
          {fetcher.data?.error && (
            <p className="text-sm" style={{ color: "#f6b8bd", margin: 0 }}>
              {fetcher.data.error}
            </p>
          )}
          {fetcher.data?.success && (
            <p className="text-sm" style={{ color: "var(--accent)", margin: 0 }}>
              Changes saved.
            </p>
          )}
        </div>

        <div className="section">
          <div className="row" style={{ fontWeight: 600, marginBottom: 8 }}>
            <div style={{ flex: 2 }}>Name</div>
            <div style={{ flex: 2 }}>Email</div>
            <div style={{ flex: 1 }}>Role</div>
            <div style={{ flex: 1 }}>Admin</div>
            <div style={{ width: 120 }}>Actions</div>
          </div>

          <div className="column" style={{ gap: 6 }}>
            {profiles.map((p: ProfileRow) => {
              const isSelf = p.id === me?.id;
              return (
              <fetcher.Form
                key={p.id}
                method="post"
                className="section-compact"
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <input type="hidden" name="intent" value="update" />
                <input type="hidden" name="userId" value={p.id} />
                <div style={{ flex: 2 }}>
                  <div style={{ fontWeight: 600 }}>{p.full_name || "Unknown"}</div>
                  <div className="muted text-sm">ID: {p.id}</div>
                  {isSelf && (
                    <span className="pill" style={{ marginTop: 4, display: "inline-block" }}>
                      You
                    </span>
                  )}
                </div>
                <div style={{ flex: 2 }}>
                  <span className="muted">{p.email || "No email"}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <select
                    name="role_type"
                    defaultValue={p.role_type || "mentee"}
                    className="input"
                    style={{ width: "100%" }}
                  >
                    <option value="mentee">mentee</option>
                    <option value="mentor">mentor</option>
                    <option value="prof">prof</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <select
                    name="admin_type"
                    defaultValue={p.admin_type || "user"}
                    className="input"
                    style={{ width: "100%" }}
                    disabled={isSelf}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
                <div style={{ width: 120, display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button
                    type="submit"
                    className="btn btn-accent"
                    disabled={fetcher.state === "submitting" || isSelf}
                  >
                    {fetcher.state === "submitting" ? "Saving..." : "Save"}
                  </button>
                </div>
              </fetcher.Form>
            );
            })}

            {profiles.length === 0 && (
              <p className="muted">No users found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

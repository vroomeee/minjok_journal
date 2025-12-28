import { Form, Link, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/volumes";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

type VolumeRecord = {
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
      .select("id, email, role_type")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  const isAdmin = profile?.role_type === "admin";

  const {
    data: releasedIssues = [],
    error: issuesError,
  } = await supabase
    .from("issues")
    .select(
      `
        id,
        title,
        description,
        status,
        release_date,
        created_at,
        articles:issue_articles(
          article:articles(
            id,
            title,
            authors:article_authors(
              profile_id,
              profile:profiles!article_authors_profile_id_fkey(
                id,
                full_name,
                role_type
              )
            )
          )
        )
      `
    )
    .eq("status", "released")
    .order("release_date", { ascending: false });

  const {
    data: volumes = [],
    error: volumesError,
  } = await supabase
    .from("volumes")
    .select("*")
    .order("created_at", { ascending: false });

  let volumeIssues: {
    volume_id: string;
    position: number | null;
    issue: {
      id: string;
      title: string;
      release_date: string | null;
      status: string;
    } | null;
  }[] = [];

  const volumeIds = (volumes || []).map((v) => v.id);
  if (volumeIds.length) {
    const { data } = await supabase
      .from("volume_issues")
      .select(
        `
          volume_id,
          position,
          issue:issues(
            id,
            title,
            release_date,
            status
          )
        `
      )
      .in("volume_id", volumeIds)
      .order("position", { ascending: true });

    if (data) volumeIssues = data;
  }

  const volumesWithIssues = (volumes || []).map((volume: VolumeRecord) => ({
    ...volume,
    issues: volumeIssues
      .filter((vi) => vi.volume_id === volume.id)
      .map((vi) => vi.issue)
      .filter(Boolean),
  }));

  const schemaMissing = Boolean(volumesError || issuesError);

  return {
    user,
    profile,
    isAdmin,
    releasedIssues,
    volumes: volumesWithIssues,
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
    .select("role_type")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role_type === "admin";

  if (!isAdmin) {
    return { error: "Only admins can manage volumes." };
  }

  if (intent === "create-volume") {
    const title = ((formData.get("title") as string) || "").trim();
    const description =
      ((formData.get("description") as string) || "").trim() || null;
    const status =
      formData.get("status") === "draft" ? ("draft" as const) : ("released" as const);
    const issueIds = formData
      .getAll("issueIds")
      .map((id) => (id ? String(id) : ""))
      .filter(Boolean);

    if (!title) return { error: "Title is required." };
    if (!issueIds.length) {
      return { error: "Select at least one released issue." };
    }

    const release_date = status === "released" ? new Date().toISOString() : null;

    const { data: volume, error } = await supabase
      .from("volumes")
      .insert({ title, description, status, release_date })
      .select("id")
      .single();

    if (error || !volume) {
      return { error: "Failed to create volume." };
    }

    const mappings = issueIds.map((issueId, idx) => ({
      volume_id: volume.id,
      issue_id: issueId,
      position: idx,
    }));

    const { error: mappingError } = await supabase
      .from("volume_issues")
      .insert(mappings);

    if (mappingError) {
      return { error: "Volume created, but failed to attach issues." };
    }

    return { success: true };
  }

  return { error: "Unknown action." };
}

export default function VolumesPage() {
  const { user, profile, isAdmin, releasedIssues, volumes, schemaMissing } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="page-body">
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Volumes</h1>
              <p className="muted" style={{ margin: 0 }}>
                Bundle released issues into volumes for the journal archive.
              </p>
            </div>
            <Link to="/issues" className="btn btn-ghost">
              View Issues
            </Link>
          </div>
        </div>

        {schemaMissing && (
          <div className="section-compact subtle" style={{ marginBottom: 10 }}>
            <p className="text-sm" style={{ margin: 0 }}>
              Volume tables are missing in Supabase. Run the migration before using this page.
            </p>
          </div>
        )}

        {isAdmin && (
          <div className="section">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>Create Volume</h2>
                <p className="muted" style={{ margin: 0 }}>
                  Select released issues to bundle. Volumes can be drafted or released now.
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
                  Volume created.
                </p>
              </div>
            )}

            <Form method="post" className="list" style={{ gap: 12 }}>
              <input type="hidden" name="intent" value="create-volume" />
              <div className="row" style={{ gap: 12 }}>
                <div style={{ flex: 2 }}>
                  <label className="label">Volume title</label>
                  <input
                    name="title"
                    type="text"
                    className="input"
                    placeholder="e.g., 2025 Annual Volume"
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
                  placeholder="Summary of the volume"
                />
              </div>

              <div>
                <label className="label">Select released issues</label>
                {releasedIssues.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    No released issues yet. Release an issue before creating a volume.
                  </p>
                ) : (
                  <div className="section-compact" style={{ maxHeight: 320, overflow: "auto" }}>
                    <div
                      className="section-compact"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "30px 1fr 160px",
                        gap: 8,
                        padding: "8px 10px",
                        borderBottom: `1px solid var(--border)`,
                        background: "var(--surface-2)",
                      }}
                    >
                      <span />
                      <span className="muted" style={{ fontWeight: 600 }}>
                        Issue
                      </span>
                      <span className="muted" style={{ fontWeight: 600, textAlign: "right" }}>
                        Release date
                      </span>
                    </div>
                    {releasedIssues.map((issue) => (
                      <label
                        key={issue.id}
                        className="section-compact"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "30px 1fr 160px",
                          gap: 8,
                          alignItems: "center",
                          cursor: "pointer",
                        }}
                      >
                        <input type="checkbox" name="issueIds" value={issue.id} />
                        <div className="column" style={{ gap: 4 }}>
                          <div className="row" style={{ gap: 8, alignItems: "center" }}>
                            <span style={{ fontWeight: 600 }}>{issue.title}</span>
                            <span className="pill" style={{ background: "#103c2d" }}>
                              Released
                            </span>
                          </div>
                          {issue.description && (
                            <span className="muted text-sm">{issue.description}</span>
                          )}
                          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                            {(issue.articles || []).slice(0, 3).map((entry: any) => (
                              <span key={entry.article?.id || Math.random()} className="pill subtle">
                                {entry.article?.title || "Untitled"}
                              </span>
                            ))}
                            {issue.articles && issue.articles.length > 3 && (
                              <span className="pill subtle">+{issue.articles.length - 3} more</span>
                            )}
                          </div>
                        </div>
                        <div className="muted text-sm" style={{ textAlign: "right" }}>
                          {issue.release_date
                            ? new Date(issue.release_date).toLocaleDateString()
                            : "n/a"}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button type="submit" className="btn btn-accent">
                  Create volume
                </button>
              </div>
            </Form>
          </div>
        )}

        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Released & draft volumes</h2>
            <span className="muted text-sm">
              {volumes.length} {volumes.length === 1 ? "volume" : "volumes"}
            </span>
          </div>

          {volumes.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No volumes yet. Create one from released issues above.
            </p>
          ) : (
            <div className="column" style={{ gap: 10 }}>
              {volumes.map((volume) => (
                <div key={volume.id} className="section-compact" style={{ gap: 6 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <div className="row" style={{ gap: 8, alignItems: "center" }}>
                      <h3 style={{ margin: 0 }}>{volume.title}</h3>
                      <span
                        className="pill"
                        style={{
                          background: volume.status === "released" ? "var(--accent-muted)" : "var(--surface-2)",
                          color: volume.status === "released" ? "var(--accent-strong)" : "var(--text)",
                        }}
                      >
                        {volume.status}
                      </span>
                    </div>
                    <span className="muted text-sm">
                      {volume.release_date
                        ? new Date(volume.release_date).toLocaleDateString()
                        : new Date(volume.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {volume.description && (
                    <p className="muted text-sm" style={{ margin: 0 }}>
                      {volume.description}
                    </p>
                  )}
                  <div className="column" style={{ gap: 6 }}>
                    {(volume.issues || []).length === 0 ? (
                      <p className="muted text-sm" style={{ margin: 0 }}>
                        No issues attached yet.
                      </p>
                    ) : (
                      volume.issues.map((issue) =>
                        issue ? (
                          <div
                            key={issue.id}
                            className="row"
                            style={{ justifyContent: "space-between", alignItems: "center" }}
                          >
                            <div className="row" style={{ gap: 8, alignItems: "center" }}>
                              <span style={{ fontWeight: 600 }}>{issue.title}</span>
                              <span className="pill subtle">{issue.status}</span>
                            </div>
                            <span className="muted text-sm" style={{ textAlign: "right" }}>
                              {issue.release_date
                                ? new Date(issue.release_date).toLocaleDateString()
                                : "n/a"}
                            </span>
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

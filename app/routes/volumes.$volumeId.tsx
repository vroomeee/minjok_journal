import { Link, useLoaderData, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/volumes.$volumeId";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

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
  const { volumeId } = params;

  const { data: volume, error } = await supabase
    .from("volumes")
    .select("*")
    .eq("id", volumeId)
    .single();

  if (error || !volume) {
    throw new Response("Volume not found", { status: 404 });
  }

  // Only show released volumes to non-admins (we'll check in component)
  const { data: volumeIssues } = await supabase
    .from("volume_issues")
    .select(`
      position,
      issue:issues (
        id,
        title,
        description,
        status,
        release_date,
        created_at,
        cover_url
      )
    `)
    .eq("volume_id", volumeId)
    .order("position", { ascending: true });

  const issues = (volumeIssues || [])
    .map((vi) => vi.issue)
    .filter(Boolean)
    .map((issue) => ({
      ...issue,
      formattedDate: formatDate(issue.release_date ?? issue.created_at),
    }));

  return {
    volume: {
      ...volume,
      formattedDate: formatDate(volume.release_date ?? volume.created_at),
    },
    issues,
  };
}

export default function VolumeDetail() {
  const { volume, issues } = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData("root") as
    | { user?: { id: string }; profile?: { role_type?: string | null } }
    | null;
  const user = rootData?.user;
  const profile = rootData?.profile;
  const isAdmin = profile?.role_type === "admin";

  // Non-admins can only see released volumes
  if (volume.status !== "released" && !isAdmin) {
    throw new Response("Volume not found", { status: 404 });
  }

  const releasedIssues = issues.filter(
    (issue) => issue.status === "released" || isAdmin
  );

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="page-body">
        <div className="section">
          <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
            {volume.cover_url && (
              <img
                src={volume.cover_url}
                alt={`${volume.title} cover`}
                style={{
                  width: 120,
                  height: 160,
                  objectFit: "cover",
                  borderRadius: 8,
                }}
              />
            )}
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 8 }}>
                <Link to="/volumes" className="muted text-sm" style={{ textDecoration: "none" }}>
                  Volumes
                </Link>
                <span className="muted text-sm">/</span>
              </div>
              <h1 style={{ fontSize: 24, margin: 0 }}>{volume.title}</h1>
              <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center" }}>
                <span
                  className="pill"
                  style={{
                    background: volume.status === "released" ? "var(--accent-muted)" : "var(--surface-2)",
                    color: volume.status === "released" ? "var(--accent-strong)" : "var(--text)",
                  }}
                >
                  {volume.status}
                </span>
                <span className="muted text-sm">{volume.formattedDate}</span>
              </div>
              {volume.description && (
                <p className="muted" style={{ marginTop: 12 }}>
                  {volume.description}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Issues in this Volume</h2>
            <span className="muted text-sm">
              {releasedIssues.length} {releasedIssues.length === 1 ? "issue" : "issues"}
            </span>
          </div>

          {releasedIssues.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No issues in this volume yet.
            </p>
          ) : (
            <div className="column" style={{ gap: 12 }}>
              {releasedIssues.map((issue) => (
                <div key={issue.id} className="section-compact" style={{ gap: 8 }}>
                  <div className="row" style={{ gap: 12, alignItems: "center" }}>
                    {issue.cover_url && (
                      <img
                        src={issue.cover_url}
                        alt={`${issue.title} cover`}
                        style={{
                          width: 48,
                          height: 48,
                          objectFit: "cover",
                          borderRadius: 6,
                        }}
                      />
                    )}
                    <div style={{ flex: 1 }}>
                      <div className="row" style={{ gap: 8, alignItems: "center" }}>
                        <Link
                          to={`/issues/${issue.id}`}
                          className="nav-link"
                          style={{ padding: 0 }}
                        >
                          <h3 style={{ margin: 0, fontSize: 16 }}>{issue.title}</h3>
                        </Link>
                        {isAdmin && issue.status !== "released" && (
                          <span className="pill subtle">{issue.status}</span>
                        )}
                      </div>
                      {issue.description && (
                        <p className="muted text-sm" style={{ margin: "4px 0 0" }}>
                          {issue.description}
                        </p>
                      )}
                    </div>
                    <span className="muted text-sm">{issue.formattedDate}</span>
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

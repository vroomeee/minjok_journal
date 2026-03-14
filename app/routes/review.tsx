import { Link, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/review";
import { createSupabaseServerClient, getUserAndProfile } from "~/lib/supabase.server";
import { createSignedArticleUrl } from "~/lib/article-files.server";
import { isReviewRole } from "~/lib/roles";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { AuthorList } from "~/components/author-list";

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

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);

  const { user, profile } = await getUserAndProfile(request);

  if (!user || !profile || !isReviewRole(profile.role_type)) {
    return redirect("/");
  }

  const { data: papers } = await supabase
    .from("articles")
    .select(
      `
      *,
      authors:article_authors(
        profile_id,
        profile:profiles!profile_id(
          id,
          email,
          full_name,
          role_type
        )
      ),
      current_version:article_versions!current_version_id (
        id,
        version_number,
        created_at,
        file_name,
        storage_path,
        blind_file_name,
        blind_storage_path
      )
    `
    )
    .eq("status", "in_review")
    .order("updated_at", { ascending: false });

  const formattedPapers = await Promise.all(
    (papers || []).map(async (paper) => {
      const copyrightDownloadUrl =
        paper.copyright_storage_path && paper.copyright_file_name
          ? await createSignedArticleUrl(paper.copyright_storage_path, {
              download: paper.copyright_file_name,
            })
          : null;
      const reviewLabel =
        profile.role_type === "prof"
          ? "Review Blinded File"
          : "Review Original File";
      const hasReviewFile =
        profile.role_type === "prof"
          ? Boolean(
              paper.current_version?.blind_storage_path ||
                paper.current_version?.storage_path,
            )
          : Boolean(paper.current_version?.storage_path);

      return {
        ...paper,
        formattedDate: formatDate(paper.updated_at),
        reviewLabel,
        hasReviewFile,
        hasCopyrightConsent: Boolean(paper.copyright_storage_path),
        copyrightDownloadUrl,
      };
    }),
  );

  return { papers: formattedPapers, user, profile };
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
                <div
                  className="row"
                  style={{ justifyContent: "space-between" }}
                >
                  <div>
                    <Link
                      to={`/papers/${paper.id}`}
                      className="nav-link"
                      style={{ padding: 0 }}
                    >
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 16,
                          color: "var(--text)",
                        }}
                      >
                        {paper.title}
                      </h3>
                    </Link>
                    <div className="row" style={{ gap: 8, marginTop: 4 }}>
                      <AuthorList authors={paper.authors} />
                      {paper.authors?.[0]?.profile?.role_type && (
                        <RoleBadge role={paper.authors[0].profile.role_type} />
                      )}
                      <span className="muted" style={{ fontSize: 13 }}>
                        Submitted: {paper.formattedDate}
                      </span>
                    </div>
                    {paper.current_version && (
                      <div className="row" style={{ gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                        {paper.hasReviewFile ? (
                          <Link
                            to={`/papers/${paper.id}/versions/${paper.current_version.id}`}
                            className="btn btn-ghost"
                          >
                            {paper.reviewLabel}
                          </Link>
                        ) : (
                          <span className="muted" style={{ fontSize: 13 }}>
                            Review file missing
                          </span>
                        )}
                        {paper.copyrightDownloadUrl ? (
                          <a
                            href={paper.copyrightDownloadUrl}
                            className="btn btn-ghost"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Copyright Consent
                          </a>
                        ) : (
                          <span className="muted" style={{ fontSize: 13 }}>
                            Copyright consent missing
                          </span>
                        )}
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

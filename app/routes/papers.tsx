import { Link, useLoaderData, Form } from "react-router";
import type { Route } from "./+types/papers";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { UserLink } from "~/components/user-link";

// Server-side loader to fetch all published papers
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const search = url.searchParams.get("search") || "";
  const perPage = 6;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    throw authError;
  }

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  let query = supabase
    .from("articles")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        email,
        full_name,
        role_type
      )
    `,
      { count: "exact" }
    )
    .eq("status", "published");

  if (search) {
    query = query.or(
      `title.ilike.%${search.replace(/,/g, "")}%,description.ilike.%${search.replace(/,/g, "")}%`
    );
  }

  const {
    data: papers,
    count,
    error,
  } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (error) {
    throw new Response("Failed to load papers", { status: 500 });
  }

  const totalPages = Math.ceil((count || 0) / perPage);

  return {
    papers: papers || [],
    user,
    profile,
    currentPage: page,
    totalPages,
    search,
  };
}

export default function Papers() {
  const { papers, user, profile, currentPage, totalPages, search } =
    useLoaderData<typeof loader>();
  const perPage = 6;

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      pages.push(1, 2, 3, "...", totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1, "...", totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(
        1,
        "...",
        currentPage - 1,
        currentPage,
        currentPage + 1,
        "...",
        totalPages
      );
    }
    return pages;
  };

  return (
    <div className="page">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="page-body">
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Published Papers</h1>
              <p className="muted" style={{ margin: 0 }}>
                Browse published submissions. Showing up to {perPage} per page.
              </p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Form method="get" className="row" style={{ gap: 8 }}>
                <input
                  type="text"
                  name="search"
                  defaultValue={search}
                  placeholder="Search papers"
                  className="input"
                  style={{ width: 200 }}
                />
                <button type="submit" className="btn btn-ghost">
                  Search
                </button>
              </Form>
            </div>
          </div>
        </div>

        {papers.length === 0 ? (
          <div className="section">
            <p className="muted" style={{ margin: 0 }}>
              No papers submitted yet.
            </p>
          </div>
        ) : (
          <>
            <div className="section-compact" style={{ padding: 0 }}>
              <div
                className="section-compact"
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr 200px 120px",
                  gap: 8,
                  padding: "10px 12px",
                  borderBottom: `1px solid var(--border)`,
                  background: "var(--surface-2)",
                }}
              >
                <span className="muted" style={{ fontWeight: 600 }}>
                  No.
                </span>
                <span className="muted" style={{ fontWeight: 600 }}>
                  Title
                </span>
                <span className="muted" style={{ fontWeight: 600 }}>
                  Author
                </span>
                <span
                  className="muted"
                  style={{ fontWeight: 600, textAlign: "right" }}
                >
                  Date
                </span>
              </div>
              {papers.map((paper, idx) => (
                <div
                  key={paper.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px 1fr 200px 120px",
                    gap: 8,
                    alignItems: "center",
                    padding: "10px 12px",
                    borderBottom: `1px solid var(--border)`,
                  }}
                >
                  <span className="muted" style={{ fontSize: 13 }}>
                    {(currentPage - 1) * perPage + idx + 1}
                  </span>
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <Link
                      to={`/papers/${paper.id}`}
                      className="nav-link"
                      style={{ padding: 0, fontSize: 15 }}
                    >
                      {paper.title}
                    </Link>
                    <span className="pill" style={{ background: "#103c2d" }}>
                      Published
                    </span>
                    {paper.author && (
                      <RoleBadge role={paper.author.role_type} />
                    )}
                  </div>
                  <span className="muted" style={{ fontSize: 13 }}>
                    <UserLink user={paper.author} fallback="Unknown" />
                  </span>
                  <span
                    className="muted"
                    style={{ fontSize: 13, textAlign: "right" }}
                  >
                    {new Date(paper.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div
                className="row"
                style={{ justifyContent: "center", gap: 6, marginTop: 12 }}
              >
                {getPageNumbers().map((pageNum, idx) =>
                  pageNum === "..." ? (
                    <span key={`ellipsis-${idx}`} className="muted">
                      ...
                    </span>
                  ) : (
                    <Link
                      key={pageNum}
                      to={`/papers?page=${pageNum}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                      className="btn btn-ghost"
                      style={{
                        background:
                          pageNum === currentPage
                            ? "var(--surface-2)"
                            : "transparent",
                        borderColor:
                          pageNum === currentPage
                            ? "var(--accent)"
                            : "var(--border)",
                      }}
                    >
                      {pageNum}
                    </Link>
                  )
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

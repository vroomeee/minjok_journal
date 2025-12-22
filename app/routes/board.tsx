import { useLoaderData, Form, Link } from "react-router";
import type { Route } from "./+types/board";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { useRef } from "react";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const search = url.searchParams.get("search") || "";
  const perPage = 6;

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

  let query = supabase
    .from("board_posts")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        email,
        full_name,
        role_type,
        admin_type
      )
    `,
      { count: "exact" }
    );

  if (search) {
    query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
  }

  const { data: posts, count } = await query
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  const totalPages = Math.ceil((count || 0) / perPage);

  return {
    posts: posts || [],
    user,
    profile,
    currentPage: page,
    totalPages,
    search,
  };
}

export default function Board() {
  const searchFormRef = useRef<HTMLFormElement>(null);
  const { posts, user, profile, currentPage, totalPages, search } =
    useLoaderData<typeof loader>();
  const perPage = 6;

  const isAdmin = profile?.admin_type === "admin";

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      pages.push(1, 2, 3, "...", totalPages);
    } else if (currentPage >= totalPages - 2) {
      pages.push(1, "...", totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
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
              <h1 style={{ fontSize: 22, margin: 0 }}>Board</h1>
              <p className="muted" style={{ margin: 0 }}>
                Announcements and community posts.
              </p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {isAdmin && (
                <Link to="/board/new" className="btn btn-accent">
                  New Post
                </Link>
              )}
              <Form method="get" ref={searchFormRef} className="row" style={{ gap: 8 }}>
                <input
                  type="text"
                  name="search"
                  defaultValue={search}
                  placeholder="Search"
                  className="input"
                  style={{ width: 180 }}
                />
                <button type="submit" className="btn btn-ghost">
                  Search
                </button>
              </Form>
            </div>
          </div>
        </div>

        {posts.length === 0 ? (
          <div className="section">
            <p className="muted" style={{ margin: 0 }}>
              No posts yet.
            </p>
          </div>
        ) : (
          <>
            <div className="section-compact" style={{ padding: 0 }}>
              <div
                className="section-compact"
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr 180px 120px",
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
                <span className="muted" style={{ fontWeight: 600, textAlign: "right" }}>
                  Date
                </span>
              </div>
              {posts.map((post, index) => (
                <div
                  key={post.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px 1fr 180px 120px",
                    gap: 8,
                    alignItems: "center",
                    padding: "10px 12px",
                    borderBottom: `1px solid var(--border)`,
                  }}
                >
                  <span className="muted" style={{ fontSize: 13 }}>
                    {(currentPage - 1) * perPage + index + 1}
                  </span>
                  <div>
                    <Link to={`/board/${post.id}`} className="nav-link" style={{ padding: 0 }}>
                      <h3 style={{ margin: 0, fontSize: 15, color: "var(--text)" }}>{post.title}</h3>
                    </Link>
                    <div className="row" style={{ gap: 6, marginTop: 2 }}>
                      <span className="pill">{post.author?.admin_type === "admin" ? "중요" : "일반"}</span>
                    </div>
                  </div>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {post.author?.email || post.author?.full_name || "Unknown"}
                  </span>
                  <span className="muted" style={{ fontSize: 13, textAlign: "right" }}>
                    {new Date(post.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="row" style={{ justifyContent: "center", gap: 6 }}>
                {getPageNumbers().map((pageNum, idx) =>
                  pageNum === "..." ? (
                    <span key={`ellipsis-${idx}`} className="muted">
                      ...
                    </span>
                  ) : (
                    <Link
                      key={pageNum}
                      to={`/board?page=${pageNum}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
                      className="btn btn-ghost"
                      style={{
                        background: pageNum === currentPage ? "var(--surface-2)" : "transparent",
                        borderColor: pageNum === currentPage ? "var(--accent)" : "var(--border)",
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

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
  const perPage = 10;

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
          <div className="card-grid">
            {posts.map((post, index) => (
              <div key={post.id} className="section-compact">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <Link to={`/board/${post.id}`} className="nav-link" style={{ padding: 0 }}>
                      <h3 style={{ margin: 0, fontSize: 16, color: "var(--text)" }}>
                        {post.title}
                      </h3>
                    </Link>
                    <div className="row" style={{ gap: 8, marginTop: 4 }}>
                      {post.author?.admin_type === "admin" && <span className="pill">Admin</span>}
                      <span className="muted" style={{ fontSize: 13 }}>
                        by {post.author?.email || post.author?.full_name}
                      </span>
                      <span className="muted" style={{ fontSize: 13 }}>
                        {new Date(post.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <span className="muted" style={{ fontSize: 12 }}>
                    #{(currentPage - 1) * 10 + index + 1}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

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
                  to={`/board?page=${pageNum}${search ? `&search=${search}` : ""}`}
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
      </div>
    </div>
  );
}

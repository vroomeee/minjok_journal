import { useLoaderData, Form, Link } from "react-router";
import type { Route } from "./+types/board";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { useRef } from "react";

// Server-side loader to fetch board posts
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const search = url.searchParams.get("search") || "";
  const perPage = 10;

  // Get current user (optional)
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

  // Build query
  let query = supabase
    .from("board_posts")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        username,
        full_name,
        role_type,
        admin_type
      )
    `,
      { count: "exact" }
    );

  // Apply search filter
  if (search) {
    query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
  }

  // Fetch posts with pagination
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

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];

    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, "...", totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, "...", totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages);
      }
    }

    return pages;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="container mx-auto px-4 py-8">
        {/* Header with search and create button */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">공지사항</h1>
          <div className="flex gap-3">
            {isAdmin && (
              <Link
                to="/board/new"
                className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 font-medium"
              >
                공지사항 작성
              </Link>
            )}
            <Form method="get" ref={searchFormRef} className="flex gap-2">
              <input
                type="text"
                name="search"
                defaultValue={search}
                placeholder="검색"
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                type="submit"
                className="px-6 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 font-medium"
              >
                검색
              </button>
            </Form>
          </div>
        </div>

        {/* Posts table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 w-20">
                  번호
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  제목
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900 w-32">
                  등록일
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {posts.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                    게시물이 없습니다.
                  </td>
                </tr>
              ) : (
                posts.map((post, index) => (
                  <tr key={post.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                      {(currentPage - 1) * 10 + index + 1}
                    </td>
                    <td className="px-6 py-3 text-sm">
                      <Link
                        to={`/board/${post.id}`}
                        className="flex items-center gap-2 text-gray-900 hover:text-blue-600"
                      >
                        {post.author?.admin_type === "admin" && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-500 text-white">
                            중요
                          </span>
                        )}
                        <span className="truncate">{post.title}</span>
                      </Link>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-500 text-right">
                      {new Date(post.created_at).toLocaleDateString("ko-KR")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex justify-center items-center gap-2">
            {getPageNumbers().map((pageNum, idx) => {
              if (pageNum === "...") {
                return (
                  <span key={`ellipsis-${idx}`} className="px-3 py-2 text-gray-500">
                    ...
                  </span>
                );
              }

              const isActive = pageNum === currentPage;
              return (
                <Link
                  key={pageNum}
                  to={`/board?page=${pageNum}${search ? `&search=${search}` : ""}`}
                  className={`px-4 py-2 rounded-md ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                  }`}
                >
                  {pageNum}
                </Link>
              );
            })}

            {currentPage < totalPages && (
              <Link
                to={`/board?page=${currentPage + 1}${search ? `&search=${search}` : ""}`}
                className="px-4 py-2 rounded-md bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
              >
                Next
              </Link>
            )}

            {currentPage < totalPages && (
              <Link
                to={`/board?page=${totalPages}${search ? `&search=${search}` : ""}`}
                className="px-4 py-2 rounded-md bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
              >
                Last
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

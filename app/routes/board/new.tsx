import {
  Form,
  redirect,
  useActionData,
  useNavigation,
  Link,
} from "react-router";
import type { Route } from "./+types/new";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { useEffect, useRef } from "react";

// Server-side loader - require admin
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  // Check if user is admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("admin_type")
    .eq("id", user.id)
    .single();

  if (!profile || profile.admin_type !== "admin") {
    throw new Response("Unauthorized: Admin access required", { status: 403 });
  }

  return { user, profile };
}

// Server-side action - create board post
export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  // Check if user is admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("admin_type")
    .eq("id", user.id)
    .single();

  if (!profile || profile.admin_type !== "admin") {
    throw new Response("Unauthorized: Admin access required", { status: 403 });
  }

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;

  if (!title || !content) {
    return { error: "Title and content are required" };
  }

  const { error } = await supabase.from("board_posts").insert({
    title,
    content,
    author_id: user.id,
  });

  if (error) {
    return { error: "Failed to create post" };
  }

  return redirect("/board");
}

export default function NewBoardPost() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav user={undefined} profile={undefined} />

      <div className="container mx-auto px-4 py-8">
        {/* Back button */}
        <Link
          to="/board"
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 mb-4"
        >
          <svg
            className="h-4 w-4 mr-1"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          공지사항 목록
        </Link>

        {/* Create post form */}
        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            새 공지사항 작성
          </h1>

          {actionData?.error && (
            <div className="mb-4 rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{actionData.error}</p>
            </div>
          )}

          <Form method="post" className="space-y-6">
            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                제목
              </label>
              <input
                type="text"
                id="title"
                name="title"
                required
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 px-4 py-2 border"
                placeholder="공지사항 제목을 입력하세요"
              />
            </div>

            <div>
              <label
                htmlFor="content"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                내용
              </label>
              <textarea
                id="content"
                name="content"
                rows={12}
                required
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 px-4 py-2 border"
                placeholder="공지사항 내용을 입력하세요"
              />
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                className="px-6 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 font-medium"
              >
                게시
              </button>
              <Link
                to="/board"
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
              >
                취소
              </Link>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}

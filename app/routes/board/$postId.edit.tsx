import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  Link,
} from "react-router";
import type { Route } from "./+types/$postId.edit";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

// Server-side loader
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { postId } = params;

  // Get profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.admin_type === "admin";

  // Fetch board post
  const { data: post, error } = await supabase
    .from("board_posts")
    .select("*")
    .eq("id", postId)
    .single();

  if (error || !post) {
    throw new Response("Post not found", { status: 404 });
  }

  // Check permission
  if (post.author_id !== user.id && !isAdmin) {
    throw new Response("Unauthorized", { status: 403 });
  }

  return { post, user, profile };
}

// Server-side action
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { postId } = params;

  // Check if user is admin or author
  const { data: profile } = await supabase
    .from("profiles")
    .select("admin_type")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.admin_type === "admin";

  const { data: post } = await supabase
    .from("board_posts")
    .select("author_id")
    .eq("id", postId)
    .single();

  if (!post || (post.author_id !== user.id && !isAdmin)) {
    return { error: "Unauthorized" };
  }

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;

  if (!title || !content) {
    return { error: "Title and content are required" };
  }

  const { error } = await supabase
    .from("board_posts")
    .update({ title, content })
    .eq("id", postId);

  if (error) {
    return { error: "Failed to update post" };
  }

  return redirect(`/board/${postId}`);
}

export default function EditBoardPost() {
  const { post, user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav user={user} profile={profile || undefined} />

      <div className="container mx-auto px-4 py-8">
        {/* Back button */}
        <Link
          to={`/board/${post.id}`}
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
          돌아가기
        </Link>

        {/* Edit form */}
        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            공지사항 수정
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
                defaultValue={post.title}
                required
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 px-4 py-2 border"
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
                defaultValue={post.content}
                required
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-orange-500 focus:ring-orange-500 px-4 py-2 border"
              />
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                className="px-6 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 font-medium"
              >
                저장
              </button>
              <Link
                to={`/board/${post.id}`}
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

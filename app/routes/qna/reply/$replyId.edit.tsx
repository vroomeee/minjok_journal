import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  Link,
} from "react-router";
import type { Route } from "./+types/$replyId.edit";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

// Server-side loader
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { replyId } = params;

  // Get profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.admin_type === "admin";

  // Fetch reply
  const { data: reply, error } = await supabase
    .from("qna_replies")
    .select("*")
    .eq("id", replyId)
    .single();

  if (error || !reply) {
    throw new Response("Reply not found", { status: 404 });
  }

  // Check permission
  if (reply.author_id !== user.id && !isAdmin) {
    throw new Response("Unauthorized", { status: 403 });
  }

  return { reply, user, profile };
}

// Server-side action
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { replyId } = params;

  // Check if user is admin or author
  const { data: profile } = await supabase
    .from("profiles")
    .select("admin_type")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.admin_type === "admin";

  const { data: reply } = await supabase
    .from("qna_replies")
    .select("author_id")
    .eq("id", replyId)
    .single();

  if (!reply || (reply.author_id !== user.id && !isAdmin)) {
    return { error: "Unauthorized" };
  }

  const formData = await request.formData();
  const content = formData.get("content") as string;

  if (!content) {
    return { error: "Content is required" };
  }

  const { error } = await supabase
    .from("qna_replies")
    .update({ content })
    .eq("id", replyId);

  if (error) {
    return { error: "Failed to update reply" };
  }

  return redirect("/qna");
}

export default function EditQnaReply() {
  const { reply, user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav user={user} profile={profile || undefined} />

      <div className="container mx-auto px-4 py-8">
        {/* Back button */}
        <Link
          to="/qna"
          className="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 mb-4"
        >
          <svg
            className="h-4 w-4 mr-1"
            fill="none"
            viewBox="0 24 24"
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
            답변 수정
          </h1>

          {actionData?.error && (
            <div className="mb-4 rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{actionData.error}</p>
            </div>
          )}

          <Form method="post" className="space-y-6">
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
                rows={8}
                defaultValue={reply.content}
                required
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-2 border"
              />
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                저장
              </button>
              <Link
                to="/qna"
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

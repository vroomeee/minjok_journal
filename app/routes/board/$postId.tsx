import {
  useLoaderData,
  Form,
  useActionData,
  useNavigation,
  useRevalidator,
  Link,
} from "react-router";
import type { Route } from "./+types/$postId";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { useEffect, useRef } from "react";

// Server-side loader to fetch board post and comments
export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { postId } = params;

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

  // Fetch board post with author
  const { data: post, error } = await supabase
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
    `
    )
    .eq("id", postId)
    .single();

  if (error || !post) {
    throw new Response("Post not found", { status: 404 });
  }

  // Fetch comments for this post
  const { data: comments } = await supabase
    .from("comments")
    .select(
      `
      *,
      author:profiles!author_id (
        id,
        username,
        full_name,
        role_type
      )
    `
    )
    .eq("article_id", postId)
    .is("parent_id", null)
    .order("created_at", { ascending: true });

  return {
    post,
    comments: comments || [],
    user,
    profile,
  };
}

// Server-side action to add comment
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { postId } = params;

  const formData = await request.formData();
  const body = formData.get("body") as string;

  if (!body) {
    return { error: "Comment is required" };
  }

  const { error } = await supabase.from("comments").insert({
    article_id: postId,
    version_id: postId, // Using postId as placeholder
    author_id: user.id,
    body,
    parent_id: null,
  });

  if (error) {
    return { error: "Failed to post comment" };
  }

  return { success: true };
}

export default function BoardPost() {
  const commentFormRef = useRef<HTMLFormElement>(null);
  const navigation = useNavigation();
  const revalidator = useRevalidator();

  const { post, comments, user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  // Reset form and revalidate data when action succeeds
  useEffect(() => {
    if (actionData?.success && navigation.state === "idle") {
      commentFormRef.current?.reset();
      revalidator.revalidate();
    }
  }, [actionData, navigation.state, revalidator]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav user={user || undefined} profile={profile || undefined} />

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
          Back to Board
        </Link>

        {/* Post content */}
        <div className="bg-white rounded-lg shadow p-8 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            {post.title}
          </h1>
          <div className="flex items-center space-x-3 mb-6 text-sm text-gray-600">
            <span>
              Posted by {post.author?.username || post.author?.full_name}
            </span>
            {post.author && <RoleBadge role={post.author.role_type} />}
            {post.author?.admin_type === "admin" && (
              <span className="px-2 py-1 rounded text-xs font-semibold bg-red-500 text-white">
                Admin
              </span>
            )}
            <span>•</span>
            <span>{new Date(post.created_at).toLocaleDateString()}</span>
          </div>
          <div className="prose max-w-none">
            <p className="text-gray-700 whitespace-pre-wrap">{post.content}</p>
          </div>
        </div>

        {/* Comments section */}
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Comments</h2>

          {actionData?.error && (
            <div className="mb-4 rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{actionData.error}</p>
            </div>
          )}

          {/* Comment form */}
          {user ? (
            <Form method="post" className="mb-6" ref={commentFormRef}>
              <textarea
                name="body"
                rows={3}
                required
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                placeholder="Write a comment..."
              />
              <button
                type="submit"
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Post Comment
              </button>
            </Form>
          ) : (
            <p className="text-sm text-gray-500 mb-6">
              Please log in to leave a comment.
            </p>
          )}

          {/* Comments list */}
          <div className="space-y-4">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="border-l-2 border-gray-200 pl-4"
              >
                <div className="flex items-center space-x-2 mb-1">
                  <span className="font-semibold text-sm text-gray-900">
                    {comment.author?.username || comment.author?.full_name}
                  </span>
                  {comment.author && (
                    <RoleBadge
                      role={comment.author.role_type}
                      className="text-xs py-0 px-1"
                    />
                  )}
                  <span className="text-xs text-gray-500">
                    {new Date(comment.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-gray-700">{comment.body}</p>
              </div>
            ))}

            {comments.length === 0 && (
              <p className="text-gray-500 text-sm">
                No comments yet. Be the first to comment!
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

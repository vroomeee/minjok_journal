import {
  useLoaderData,
  Form,
  redirect,
  useActionData,
  useNavigation,
} from "react-router";
import type { Route } from "./+types/$paperId.versions.$versionId";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import { RoleBadge } from "~/components/role-badge";
import { useEffect, useRef } from "react";

// Server-side loader to fetch version and comments
export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request);
  const { paperId, versionId } = params;

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

  // Fetch paper
  const { data: paper } = await supabase
    .from("articles")
    .select("*")
    .eq("id", paperId)
    .single();

  // Fetch version with file URL
  const { data: version, error: versionError } = await supabase
    .from("article_versions")
    .select("*")
    .eq("id", versionId)
    .single();

  if (versionError || !version) {
    throw new Response("Version not found", { status: 404 });
  }

  // Get public URL for the file
  const { data: urlData } = supabase.storage
    .from("articles")
    .getPublicUrl(version.storage_path);

  const fileUrl = urlData.publicUrl;

  // Fetch comments for this version
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
    .eq("version_id", versionId)
    .is("parent_id", null)
    .order("created_at", { ascending: true });

  // Fetch replies for all comments
  const commentIds = comments?.map((c) => c.id) || [];
  let replies: any[] = [];
  if (commentIds.length > 0) {
    const { data: repliesData } = await supabase
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
      .in("parent_id", commentIds)
      .order("created_at", { ascending: true });

    replies = repliesData || [];
  }

  return {
    paper,
    version,
    fileUrl,
    comments: comments || [],
    replies,
    user,
    profile,
  };
}

// Server-side action to add comment
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { paperId, versionId } = params;

  const formData = await request.formData();
  const body = formData.get("body") as string;
  const parentId = formData.get("parentId") as string | null;

  if (!body) {
    return { error: "Comment body is required" };
  }

  const { error } = await supabase.from("comments").insert({
    article_id: paperId,
    version_id: versionId,
    author_id: user.id,
    body,
    parent_id: parentId || null,
  });

  if (error) {
    return { error: "Failed to post comment" };
  }

  return redirect(`/papers/${paperId}/versions/${versionId}`);
}

export default function VersionReview() {
  const formRef = useRef<HTMLFormElement>(null);
  const navigation = useNavigation();
  useEffect(() => {
    if (navigation.state === "idle") {
      formRef.current?.reset();
    }
  }, [navigation.state]);
  const { paper, version, fileUrl, comments, replies, user, profile } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left: File viewer */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {paper?.title} - Version {version.version_number}
            </h2>

            <div className="mb-4">
              <p className="text-sm text-gray-600">File: {version.file_name}</p>
              <p className="text-sm text-gray-500">
                Uploaded: {new Date(version.created_at).toLocaleDateString()}
              </p>
              {version.notes && (
                <p className="text-sm text-gray-600 mt-2 italic">
                  Notes: {version.notes}
                </p>
              )}
            </div>

            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Download / View File
            </a>

            {/* Embedded PDF viewer (if PDF) */}
            {version.file_name.toLowerCase().endsWith(".pdf") && (
              <div className="mt-6">
                <iframe
                  src={fileUrl}
                  className="w-full h-[600px] border rounded"
                  title="PDF Viewer"
                />
              </div>
            )}
          </div>

          {/* Right: Comments */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">
              Reviews & Comments
            </h3>

            {actionData?.error && (
              <div className="mb-4 rounded-md bg-red-50 p-4">
                <p className="text-sm text-red-800">{actionData.error}</p>
              </div>
            )}

            {/* Comment form */}
            {user ? (
              <Form method="post" className="mb-6" ref={formRef}>
                <textarea
                  name="body"
                  rows={3}
                  required
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
                  placeholder="Write your review or comment..."
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
              {comments.map((comment) => {
                const commentReplies = replies.filter(
                  (r) => r.parent_id === comment.id
                );

                return (
                  <div
                    key={comment.id}
                    className="border-l-2 border-gray-200 pl-2"
                  >
                    <div className="flex items-start space-x-2">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-sm text-gray-900">
                            {comment.author?.username ||
                              comment.author?.full_name}
                          </span>
                          {comment.author && (
                            <RoleBadge
                              role={comment.author.role_type}
                              className="text-xs py-0 px-1"
                            />
                          )}
                          <span className="text-[8px] text-gray-500">
                            {new Date(comment.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] text-gray-700" text-sm>
                          {comment.body}
                        </p>

                        {/* Replies */}
                        {commentReplies.length > 0 && (
                          <div className="mt-3 space-y-3 pl-4 border-l border-gray-200">
                            {commentReplies.map((reply) => (
                              <div key={reply.id}>
                                <div className="flex items-center space-x-2">
                                  <span className="font-semibold text-sm text-gray-900">
                                    {reply.author?.username ||
                                      reply.author?.full_name}
                                  </span>
                                  {reply.author && (
                                    <RoleBadge
                                      role={reply.author.role_type}
                                      className="text-xs px-1 py-0"
                                    />
                                  )}
                                  <span className="text-xs text-gray-500">
                                    {new Date(
                                      reply.created_at
                                    ).toLocaleDateString()}
                                  </span>
                                </div>
                                <p className="mt-1 text-[12px] text-gray-700">
                                  {reply.body}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Reply form */}
                        {user && (
                          <details className="mt-2">
                            <summary className="text-sm text-blue-600 cursor-pointer hover:text-blue-700">
                              Reply
                            </summary>
                            <Form method="post" className="mt-2">
                              <input
                                type="hidden"
                                name="parentId"
                                value={comment.id}
                              />
                              <textarea
                                name="body"
                                rows={2}
                                required
                                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2 border"
                                placeholder="Write a reply..."
                              />
                              <button
                                type="submit"
                                className="mt-1 px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                              >
                                Reply
                              </button>
                            </Form>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {comments.length === 0 && (
                <p className="text-gray-500 text-sm">
                  No comments yet. Be the first to review!
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

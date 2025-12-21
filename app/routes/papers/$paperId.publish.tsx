import { Form, redirect, useActionData, useLoaderData, Link } from "react-router";
import type { Route } from "./+types/$paperId.publish";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { paperId } = params;

  const { data: paper, error } = await supabase
    .from("articles")
    .select("id, title, description, author_id, status")
    .eq("id", paperId)
    .single();

  if (error || !paper) {
    throw new Response("Paper not found", { status: 404 });
  }

  // Only author or admin can publish/unpublish
  const { data: profile } = await supabase
    .from("profiles")
    .select("admin_type")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.admin_type === "admin";
  if (paper.author_id !== user.id && !isAdmin) {
    throw new Response("Unauthorized", { status: 403 });
  }

  if (paper.status === "published") {
    return redirect(`/papers/${paperId}`);
  }

  return { paper, user, profile };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { paperId } = params;

  const formData = await request.formData();
  const title = (formData.get("title") as string) || "";
  const description = (formData.get("description") as string) || null;

  if (!title.trim()) {
    return { error: "Title is required" };
  }

  const { data: paper } = await supabase
    .from("articles")
    .select("author_id, status")
    .eq("id", paperId)
    .single();

  if (!paper) {
    throw new Response("Paper not found", { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("admin_type")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.admin_type === "admin";
  if (paper.author_id !== user.id && !isAdmin) {
    throw new Response("Unauthorized", { status: 403 });
  }

  const { error } = await supabase
    .from("articles")
    .update({ status: "published", title, description })
    .eq("id", paperId);

  if (error) {
    return { error: "Failed to publish paper" };
  }

  return redirect(`/papers/${paperId}`);
}

export default function PublishPaper() {
  const { paper, user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-gray-50">
      <Nav user={user || undefined} profile={profile || undefined} />

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Publish Paper</h1>
          <Link
            to={`/papers/${paper.id}`}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Back to paper
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <Form method="post" className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Publish Title
              </label>
              <input
                type="text"
                name="title"
                defaultValue={paper.title}
                required
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <textarea
                name="description"
                defaultValue={paper.description || ""}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Short description to display when published"
              />
            </div>

            {actionData?.error && (
              <div className="rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-800">{actionData.error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Publish
              </button>
              <Link
                to={`/papers/${paper.id}`}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancel
              </Link>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}

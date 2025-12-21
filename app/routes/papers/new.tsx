import { Form, redirect, useActionData } from "react-router";
import type { Route } from "./+types/new";
import { requireUser, createSupabaseServerClient } from "~/lib/supabase.server";

// Server-side loader - require authentication
export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  return {};
}

// Server-side action to create new paper and upload file
export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const notes = formData.get("notes") as string;
  const file = formData.get("file") as File;

  if (!title || !file) {
    return { error: "Title and file are required" };
  }

  // Create article record
  const { data: article, error: articleError } = await supabase
    .from("articles")
    .insert({
      title,
      author_id: user.id,
      status: "draft",
    })
    .select()
    .single();

  if (articleError || !article) {
    return { error: "Failed to create article" };
  }

  // Upload file to Supabase Storage
  const filePath = `${user.id}/${article.id}/v1/${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("articles")
    .upload(filePath, file);

  if (uploadError) {
    // Rollback article creation
    await supabase.from("articles").delete().eq("id", article.id);
    return { error: "Failed to upload file: " + uploadError.message };
  }

  // Create version record
  const { data: version, error: versionError } = await supabase
    .from("article_versions")
    .insert({
      article_id: article.id,
      version_number: 1,
      storage_path: filePath,
      file_name: file.name,
      file_size: file.size,
      notes: notes || null,
    })
    .select()
    .single();

  if (versionError || !version) {
    return { error: "Failed to create version record" };
  }

  // Update article with current version
  await supabase
    .from("articles")
    .update({ current_version_id: version.id })
    .eq("id", article.id);

  return redirect(`/papers/${article.id}`);
}

export default function NewPaper() {
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Submit New Paper
        </h1>

        <Form
          method="post"
          encType="multipart/form-data"
          className="bg-white shadow rounded-lg p-6 space-y-6"
        >
          {actionData?.error && (
            <div className="rounded-md bg-red-50 p-4">
              <p className="text-sm text-red-800">{actionData.error}</p>
            </div>
          )}

          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-gray-700"
            >
              Paper Title
            </label>
            <input
              type="text"
              name="title"
              id="title"
              required
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
            />
          </div>

          <div>
            <label
              htmlFor="file"
              className="block text-sm font-medium text-gray-700"
            >
              Upload Paper (PDF)
            </label>
            <input
              type="file"
              name="file"
              id="file"
              accept=".pdf,.doc,.docx"
              required
              className="mt-1 block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
          </div>

          <div>
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-gray-700"
            >
              Version Notes (Optional)
            </label>
            <textarea
              name="notes"
              id="notes"
              rows={3}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
              placeholder="Describe this version..."
            />
          </div>

          <div className="flex justify-end space-x-4">
            <a
              href="/papers"
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </a>
            <button
              type="submit"
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              Submit Paper
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}

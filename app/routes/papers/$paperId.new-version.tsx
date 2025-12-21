import { Form, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/$paperId.new-version";
import { requireUser, createSupabaseServerClient } from "~/lib/supabase.server";

// Server-side loader - require authentication and paper ownership
export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { paperId } = params;

  // Fetch the paper and verify ownership
  const { data: paper, error } = await supabase
    .from("articles")
    .select("*, author:profiles!author_id(id)")
    .eq("id", paperId)
    .single();

  if (error || !paper) {
    throw new Response("Paper not found", { status: 404 });
  }

  if (paper.author_id !== user.id) {
    throw new Response("Unauthorized: You can only upload versions for your own papers", {
      status: 403,
    });
  }

  // Get current highest version number
  const { data: versions } = await supabase
    .from("article_versions")
    .select("version_number")
    .eq("article_id", paperId)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersionNumber = versions && versions.length > 0 ? versions[0].version_number + 1 : 1;

  return { paper, nextVersionNumber };
}

// Server-side action to upload new version
export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { paperId } = params;

  const formData = await request.formData();
  const notes = formData.get("notes") as string;
  const file = formData.get("file") as File;

  if (!file) {
    return { error: "File is required" };
  }

  // Verify ownership
  const { data: paper } = await supabase
    .from("articles")
    .select("author_id")
    .eq("id", paperId)
    .single();

  if (!paper || paper.author_id !== user.id) {
    throw new Response("Unauthorized", { status: 403 });
  }

  // Get next version number
  const { data: versions } = await supabase
    .from("article_versions")
    .select("version_number")
    .eq("article_id", paperId)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextVersionNumber = versions && versions.length > 0 ? versions[0].version_number + 1 : 1;

  // Upload file to Supabase Storage
  const filePath = `${user.id}/${paperId}/v${nextVersionNumber}/${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("articles")
    .upload(filePath, file);

  if (uploadError) {
    return { error: "Failed to upload file: " + uploadError.message };
  }

  // Create version record
  const { data: version, error: versionError } = await supabase
    .from("article_versions")
    .insert({
      article_id: paperId,
      version_number: nextVersionNumber,
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

  // Update article with new current version
  await supabase
    .from("articles")
    .update({
      current_version_id: version.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paperId);

  return redirect(`/papers/${paperId}`);
}

export default function NewVersion() {
  const { paper, nextVersionNumber } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Upload New Version
        </h1>
        <p className="text-gray-600 mb-8">
          Paper: {paper.title} (Version {nextVersionNumber})
        </p>

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
              htmlFor="file"
              className="block text-sm font-medium text-gray-700"
            >
              Upload New Version (PDF)
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
              Version Notes
            </label>
            <textarea
              name="notes"
              id="notes"
              rows={4}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border"
              placeholder="Describe the changes in this version..."
            />
            <p className="mt-1 text-sm text-gray-500">
              Explain what was changed or improved in this version.
            </p>
          </div>

          <div className="flex justify-end space-x-4">
            <a
              href={`/papers/${paper.id}`}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancel
            </a>
            <button
              type="submit"
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              Upload Version {nextVersionNumber}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}

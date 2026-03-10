import { Form, redirect, useActionData, useLoaderData, Link } from "react-router";
import type { Route } from "./+types/new";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import {
  BOARD_ATTACHMENTS_BUCKET,
  buildBoardAttachmentPath,
  normalizeBoardAttachmentFiles,
  validateBoardAttachmentFiles,
} from "~/lib/board-attachments";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_type")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role_type !== "admin") {
    throw new Response("Unauthorized: Admin access required", { status: 403 });
  }

  return { user, profile };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_type")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role_type !== "admin") {
    throw new Response("Unauthorized: Admin access required", { status: 403 });
  }

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const content = formData.get("content") as string;
  const attachmentFiles = normalizeBoardAttachmentFiles(formData.getAll("attachments"));

  if (!title || !content) return { error: "Title and content are required" };
  const attachmentValidationError = validateBoardAttachmentFiles(attachmentFiles);
  if (attachmentValidationError) return { error: attachmentValidationError };

  const { data: post, error } = await supabase
    .from("board_posts")
    .insert({
      title,
      content,
      author_id: user.id,
    })
    .select("id")
    .single();

  if (error || !post) return { error: "Failed to create post" };

  const uploadedPaths: string[] = [];
  const attachmentRows: {
    board_post_id: string;
    file_name: string;
    file_size: number;
    content_type: string | null;
    storage_path: string;
  }[] = [];

  for (let idx = 0; idx < attachmentFiles.length; idx += 1) {
    const file = attachmentFiles[idx];
    const path = buildBoardAttachmentPath(user.id, post.id, file.name, idx);

    const { error: uploadError } = await supabase.storage
      .from(BOARD_ATTACHMENTS_BUCKET)
      .upload(path, file, { contentType: file.type || undefined });

    if (uploadError) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(BOARD_ATTACHMENTS_BUCKET).remove(uploadedPaths);
      }
      await supabase.from("board_posts").delete().eq("id", post.id);
      return { error: `Failed to upload attachment "${file.name}".` };
    }

    uploadedPaths.push(path);
    attachmentRows.push({
      board_post_id: post.id,
      file_name: file.name,
      file_size: file.size,
      content_type: file.type || null,
      storage_path: path,
    });
  }

  if (attachmentRows.length > 0) {
    const { error: attachmentInsertError } = await supabase
      .from("board_post_attachments")
      .insert(attachmentRows);

    if (attachmentInsertError) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(BOARD_ATTACHMENTS_BUCKET).remove(uploadedPaths);
      }
      await supabase.from("board_posts").delete().eq("id", post.id);
      return { error: "Post created, but failed to save attachment metadata." };
    }
  }

  return redirect("/board");
}

export default function NewBoardPost() {
  const { user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="page">
      <Nav user={user} profile={profile || undefined} />

      <div className="page-body" style={{ maxWidth: 800 }}>
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>New Board Post</h1>
              <p className="muted" style={{ margin: 0 }}>
                Admins only.
              </p>
            </div>
            <Link to="/board" className="btn btn-ghost">
              Back to Board
            </Link>
          </div>

          {actionData?.error && (
            <div className="section-compact subtle" style={{ marginBottom: 10 }}>
              <p className="text-sm" style={{ color: "#f6b8bd" }}>
                {actionData.error}
              </p>
            </div>
          )}

          <Form method="post" encType="multipart/form-data" className="list">
            <div>
              <label className="label">Title</label>
              <input
                type="text"
                name="title"
                required
                className="input"
                placeholder="Board post title"
              />
            </div>

            <div>
              <label className="label">Content</label>
              <textarea
                name="content"
                rows={10}
                required
                className="textarea"
                placeholder="Write the post content"
              />
            </div>

            <div>
              <label className="label" htmlFor="attachments">
                Attachments (optional)
              </label>
              <input id="attachments" type="file" name="attachments" multiple className="input" />
              <p className="muted text-sm" style={{ marginTop: 6 }}>
                Up to 10 files, max 50 MB per file.
              </p>
            </div>

            <div className="row">
              <button type="submit" className="btn btn-accent">
                Create Post
              </button>
              <Link to="/board" className="btn btn-ghost">
                Cancel
              </Link>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}

import { Form, redirect, useActionData, useLoaderData, Link } from "react-router";
import type { Route } from "./+types/$postId.edit";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { Nav } from "~/components/nav";
import {
  BOARD_ATTACHMENTS_BUCKET,
  MAX_BOARD_ATTACHMENTS,
  buildBoardAttachmentPath,
  normalizeBoardAttachmentFiles,
  validateBoardAttachmentFiles,
} from "~/lib/board-attachments";

function formatFileSize(sizeInBytes: number | null) {
  if (!sizeInBytes || sizeInBytes <= 0) return "Unknown size";
  if (sizeInBytes < 1024) return `${sizeInBytes} B`;
  if (sizeInBytes < 1024 * 1024) return `${(sizeInBytes / 1024).toFixed(1)} KB`;
  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { postId } = params;
  if (!postId) {
    throw new Response("Post not found", { status: 404 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role_type === "admin";

  const [{ data: post, error }, { data: attachments, error: attachmentsError }] = await Promise.all([
    supabase
      .from("board_posts")
      .select("*")
      .eq("id", postId)
      .single(),
    supabase
      .from("board_post_attachments")
      .select("*")
      .eq("board_post_id", postId)
      .order("created_at", { ascending: true }),
  ]);

  if (error || !post) {
    throw new Response("Post not found", { status: 404 });
  }
  if (attachmentsError) {
    throw new Response("Failed to load attachments", { status: 500 });
  }

  if (post.author_id !== user.id && !isAdmin) {
    throw new Response("Unauthorized", { status: 403 });
  }

  return { post, user, profile, attachments: attachments || [] };
}

export async function action({ request, params }: Route.ActionArgs) {
  const user = await requireUser(request);
  const { supabase } = createSupabaseServerClient(request);
  const { postId } = params;
  if (!postId) {
    return { error: "Post not found" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role_type")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role_type === "admin";

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
  const removeAttachmentIds = Array.from(
    new Set(
      formData
        .getAll("removeAttachmentIds")
        .map((value) => String(value))
        .filter(Boolean),
    ),
  );
  const newAttachmentFiles = normalizeBoardAttachmentFiles(formData.getAll("attachments"));

  if (!title || !content) {
    return { error: "Title and content are required" };
  }
  const newAttachmentValidationError = validateBoardAttachmentFiles(newAttachmentFiles);
  if (newAttachmentValidationError) {
    return { error: newAttachmentValidationError };
  }

  const { data: existingAttachments, error: existingAttachmentsError } = await supabase
    .from("board_post_attachments")
    .select("id, storage_path")
    .eq("board_post_id", postId);

  if (existingAttachmentsError) {
    return { error: "Failed to load existing attachments." };
  }

  const existingById = new Map((existingAttachments || []).map((attachment) => [attachment.id, attachment]));
  const removableAttachments = removeAttachmentIds
    .map((attachmentId) => existingById.get(attachmentId))
    .filter((attachment): attachment is { id: string; storage_path: string } => Boolean(attachment));

  if (removeAttachmentIds.length !== removableAttachments.length) {
    return { error: "Some selected attachments could not be found. Refresh and try again." };
  }

  const projectedAttachmentCount =
    (existingAttachments || []).length - removableAttachments.length + newAttachmentFiles.length;
  if (projectedAttachmentCount > MAX_BOARD_ATTACHMENTS) {
    return { error: `A post can have at most ${MAX_BOARD_ATTACHMENTS} attachments.` };
  }

  const { error } = await supabase.from("board_posts").update({ title, content }).eq("id", postId);
  if (error) return { error: "Failed to update post" };

  if (removableAttachments.length > 0) {
    const removablePaths = Array.from(
      new Set(removableAttachments.map((attachment) => attachment.storage_path).filter(Boolean)),
    );

    if (removablePaths.length > 0) {
      const { error: removeStorageError } = await supabase.storage
        .from(BOARD_ATTACHMENTS_BUCKET)
        .remove(removablePaths);
      if (removeStorageError) {
        return { error: "Post updated, but failed to remove one or more attachment files." };
      }
    }

    const { error: removeAttachmentRowsError } = await supabase
      .from("board_post_attachments")
      .delete()
      .in("id", removableAttachments.map((attachment) => attachment.id));

    if (removeAttachmentRowsError) {
      return { error: "Post updated, but failed to remove attachment records." };
    }
  }

  if (newAttachmentFiles.length > 0) {
    const uploadedPaths: string[] = [];
    const newAttachmentRows: {
      board_post_id: string;
      file_name: string;
      file_size: number;
      content_type: string | null;
      storage_path: string;
    }[] = [];

    for (let idx = 0; idx < newAttachmentFiles.length; idx += 1) {
      const file = newAttachmentFiles[idx];
      const path = buildBoardAttachmentPath(user.id, postId, file.name, idx);

      const { error: uploadError } = await supabase.storage
        .from(BOARD_ATTACHMENTS_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });

      if (uploadError) {
        if (uploadedPaths.length > 0) {
          await supabase.storage.from(BOARD_ATTACHMENTS_BUCKET).remove(uploadedPaths);
        }
        return { error: `Post updated, but failed to upload attachment "${file.name}".` };
      }

      uploadedPaths.push(path);
      newAttachmentRows.push({
        board_post_id: postId,
        file_name: file.name,
        file_size: file.size,
        content_type: file.type || null,
        storage_path: path,
      });
    }

    const { error: insertAttachmentError } = await supabase
      .from("board_post_attachments")
      .insert(newAttachmentRows);

    if (insertAttachmentError) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(BOARD_ATTACHMENTS_BUCKET).remove(uploadedPaths);
      }
      return { error: "Post updated, but failed to save attachment metadata." };
    }
  }

  return redirect(`/board/${postId}`);
}

export default function EditBoardPost() {
  const { post, user, profile, attachments } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="page">
      <Nav user={user} profile={profile || undefined} />

      <div className="page-body" style={{ maxWidth: 800 }}>
        <div className="section">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <h1 style={{ fontSize: 22, margin: 0 }}>Edit Board Post</h1>
              <p className="muted" style={{ margin: 0 }}>
                Update the title and content.
              </p>
            </div>
            <Link to={`/board/${post.id}`} className="btn btn-ghost">
              Back to Post
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
                defaultValue={post.title}
                required
                className="input"
              />
            </div>
            <div>
              <label className="label">Content</label>
              <textarea
                name="content"
                rows={10}
                defaultValue={post.content}
                required
                className="textarea"
              />
            </div>

            <div className="section-compact" style={{ gap: 8 }}>
              <label className="label" style={{ margin: 0 }}>
                Existing Attachments
              </label>
              {attachments.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  No attachments yet.
                </p>
              ) : (
                <div className="list" style={{ gap: 6 }}>
                  {attachments.map((attachment) => (
                    <label
                      key={attachment.id}
                      className="row"
                      style={{ justifyContent: "space-between", gap: 8, alignItems: "center" }}
                    >
                      <span className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <input type="checkbox" name="removeAttachmentIds" value={attachment.id} />
                        <span>{attachment.file_name}</span>
                        <span className="meta">({formatFileSize(attachment.file_size)})</span>
                      </span>
                      <span className="muted text-sm">Remove</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="label" htmlFor="attachments">
                Add Attachments
              </label>
              <input id="attachments" type="file" name="attachments" multiple className="input" />
              <p className="muted text-sm" style={{ marginTop: 6 }}>
                Up to 10 files total per post, max 50 MB per file.
              </p>
            </div>

            <div className="row">
              <button type="submit" className="btn btn-accent">
                Save
              </button>
              <Link to={`/board/${post.id}`} className="btn btn-ghost">
                Cancel
              </Link>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
}

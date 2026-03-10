import { Form, redirect, useActionData, useLoaderData, Link, useNavigation } from "react-router";
import { useRef, useState, type FormEvent } from "react";
import type { Route } from "./+types/new";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { createSupabaseBrowserClient } from "~/lib/supabase.client";
import { Nav } from "~/components/nav";
import {
  BOARD_ATTACHMENTS_BUCKET,
  BOARD_PREUPLOADED_ATTACHMENTS_FIELD,
  type BoardAttachmentPayload,
  buildBoardAttachmentPendingPath,
  buildBoardAttachmentPath,
  normalizeBoardAttachmentFiles,
  parseBoardAttachmentPayload,
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
  const parsedAttachmentPayload = parseBoardAttachmentPayload(
    formData.get(BOARD_PREUPLOADED_ATTACHMENTS_FIELD),
  );
  if (parsedAttachmentPayload.error) {
    return { error: parsedAttachmentPayload.error };
  }
  const preuploadedAttachments = parsedAttachmentPayload.payloads;
  const hasInvalidAttachmentPath = preuploadedAttachments.some(
    (attachment) => !attachment.storage_path.startsWith(`${user.id}/board/`),
  );
  if (hasInvalidAttachmentPath) {
    return { error: "Invalid attachment path." };
  }

  const attachmentFiles =
    preuploadedAttachments.length > 0 ? [] : normalizeBoardAttachmentFiles(formData.getAll("attachments"));

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

  if (error || !post) {
    if (preuploadedAttachments.length > 0) {
      const paths = Array.from(
        new Set(preuploadedAttachments.map((attachment) => attachment.storage_path).filter(Boolean)),
      );
      if (paths.length > 0) {
        await supabase.storage.from(BOARD_ATTACHMENTS_BUCKET).remove(paths);
      }
    }
    return { error: "Failed to create post" };
  }

  const uploadedPaths: string[] = [];
  const attachmentRows: {
    board_post_id: string;
    file_name: string;
    file_size: number;
    content_type: string | null;
    storage_path: string;
  }[] = [];

  if (preuploadedAttachments.length > 0) {
    uploadedPaths.push(
      ...Array.from(
        new Set(preuploadedAttachments.map((attachment) => attachment.storage_path).filter(Boolean)),
      ),
    );
    attachmentRows.push(
      ...preuploadedAttachments.map((attachment) => ({
        board_post_id: post.id,
        file_name: attachment.file_name,
        file_size: attachment.file_size,
        content_type: attachment.content_type,
        storage_path: attachment.storage_path,
      })),
    );
  }

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
      return { error: `Failed to upload attachment "${file.name}": ${uploadError.message}` };
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
      return {
        error: `Post created, but failed to save attachment metadata: ${attachmentInsertError.message}`,
      };
    }
  }

  return redirect("/board");
}

export default function NewBoardPost() {
  const { user, profile } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const formRef = useRef<HTMLFormElement>(null);
  const attachmentsInputRef = useRef<HTMLInputElement>(null);
  const preuploadedAttachmentsInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [clientUploadError, setClientUploadError] = useState<string | null>(null);
  const isSubmitting = navigation.state === "submitting";
  const submitError = clientUploadError || actionData?.error;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const attachmentsInput = attachmentsInputRef.current;
    const files = attachmentsInput?.files ? Array.from(attachmentsInput.files) : [];

    if (files.length === 0) {
      setClientUploadError(null);
      if (preuploadedAttachmentsInputRef.current) {
        preuploadedAttachmentsInputRef.current.value = "";
      }
      return;
    }

    event.preventDefault();
    setClientUploadError(null);

    const validationError = validateBoardAttachmentFiles(files);
    if (validationError) {
      setClientUploadError(validationError);
      return;
    }

    setIsUploadingAttachments(true);

    const supabase = createSupabaseBrowserClient();
    const uploadedPaths: string[] = [];
    const payloads: BoardAttachmentPayload[] = [];

    for (let idx = 0; idx < files.length; idx += 1) {
      const file = files[idx];
      const path = buildBoardAttachmentPendingPath(user.id, file.name, idx);

      const { error: uploadError } = await supabase.storage
        .from(BOARD_ATTACHMENTS_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });

      if (uploadError) {
        if (uploadedPaths.length > 0) {
          await supabase.storage.from(BOARD_ATTACHMENTS_BUCKET).remove(uploadedPaths);
        }
        setClientUploadError(`Failed to upload attachment "${file.name}": ${uploadError.message}`);
        setIsUploadingAttachments(false);
        return;
      }

      uploadedPaths.push(path);
      payloads.push({
        file_name: file.name,
        file_size: file.size,
        content_type: file.type || null,
        storage_path: path,
      });
    }

    if (preuploadedAttachmentsInputRef.current) {
      preuploadedAttachmentsInputRef.current.value = JSON.stringify(payloads);
    }
    if (attachmentsInput) {
      attachmentsInput.value = "";
    }
    setIsUploadingAttachments(false);
    formRef.current?.requestSubmit();
  }

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

          {submitError && (
            <div className="section-compact subtle" style={{ marginBottom: 10 }}>
              <p className="text-sm" style={{ color: "#f6b8bd" }}>
                {submitError}
              </p>
            </div>
          )}

          <Form
            method="post"
            encType="multipart/form-data"
            className="list"
            ref={formRef}
            onSubmit={handleSubmit}
          >
            <input
              type="hidden"
              name={BOARD_PREUPLOADED_ATTACHMENTS_FIELD}
              ref={preuploadedAttachmentsInputRef}
            />
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
              <input
                id="attachments"
                type="file"
                name="attachments"
                multiple
                className="input"
                ref={attachmentsInputRef}
                disabled={isUploadingAttachments || isSubmitting}
              />
              <p className="muted text-sm" style={{ marginTop: 6 }}>
                Up to 10 files, max 50 MB per file.
              </p>
            </div>

            <div className="row">
              <button
                type="submit"
                className="btn btn-accent"
                disabled={isUploadingAttachments || isSubmitting}
              >
                {isUploadingAttachments
                  ? "Uploading attachments..."
                  : isSubmitting
                    ? "Creating..."
                    : "Create Post"}
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

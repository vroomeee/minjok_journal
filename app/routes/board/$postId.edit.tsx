import { Form, redirect, useActionData, useLoaderData, Link, useNavigation } from "react-router";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { Route } from "./+types/$postId.edit";
import { createSupabaseServerClient, requireUser } from "~/lib/supabase.server";
import { createSupabaseBrowserClient } from "~/lib/supabase.client";
import { Nav } from "~/components/nav";
import {
  BOARD_ATTACHMENTS_BUCKET,
  BOARD_PREUPLOADED_ATTACHMENTS_FIELD,
  MAX_BOARD_ATTACHMENTS,
  type BoardAttachmentPayload,
  buildBoardAttachmentPath,
  normalizeBoardAttachmentFiles,
  parseBoardAttachmentPayload,
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
    (existingAttachments || []).length -
    removableAttachments.length +
    newAttachmentFiles.length +
    preuploadedAttachments.length;
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

  if (newAttachmentFiles.length > 0 || preuploadedAttachments.length > 0) {
    const uploadedPaths = Array.from(
      new Set(preuploadedAttachments.map((attachment) => attachment.storage_path).filter(Boolean)),
    );
    const newAttachmentRows: {
      board_post_id: string;
      file_name: string;
      file_size: number;
      content_type: string | null;
      storage_path: string;
    }[] = preuploadedAttachments.map((attachment) => ({
      board_post_id: postId,
      file_name: attachment.file_name,
      file_size: attachment.file_size,
      content_type: attachment.content_type,
      storage_path: attachment.storage_path,
    }));

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
        return { error: `Post updated, but failed to upload attachment "${file.name}": ${uploadError.message}` };
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
      return {
        error: `Post updated, but failed to save attachment metadata: ${insertAttachmentError.message}`,
      };
    }
  }

  return redirect(`/board/${postId}`);
}

export default function EditBoardPost() {
  const { post, user, profile, attachments } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const formRef = useRef<HTMLFormElement>(null);
  const attachmentsInputRef = useRef<HTMLInputElement>(null);
  const preuploadedAttachmentsInputRef = useRef<HTMLInputElement>(null);
  const isForwardedSubmitRef = useRef(false);
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false);
  const [clientUploadError, setClientUploadError] = useState<string | null>(null);
  const isSubmitting = navigation.state === "submitting";
  const submitError = clientUploadError || actionData?.error;

  function syncAttachmentsInput(files: File[]) {
    const input = attachmentsInputRef.current;
    if (!input || typeof DataTransfer === "undefined") return;

    const dataTransfer = new DataTransfer();
    files.forEach((file) => dataTransfer.items.add(file));
    input.files = dataTransfer.files;
  }

  function getRemovalCountFromForm() {
    const form = formRef.current;
    if (!form) return 0;
    return form.querySelectorAll<HTMLInputElement>("input[name='removeAttachmentIds']:checked").length;
  }

  function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = event.currentTarget.files ? Array.from(event.currentTarget.files) : [];
    event.currentTarget.value = "";
    if (selectedFiles.length === 0) return;

    const nextAttachments = [...pendingAttachments, ...selectedFiles].filter(
      (file, index, allFiles) =>
        allFiles.findIndex(
          (candidate) =>
            candidate.name === file.name &&
            candidate.size === file.size &&
            candidate.lastModified === file.lastModified,
        ) === index,
    );
    const validationError = validateBoardAttachmentFiles(nextAttachments);
    if (validationError) {
      setClientUploadError(validationError);
      syncAttachmentsInput(pendingAttachments);
      return;
    }

    const projectedAttachmentCount =
      attachments.length - getRemovalCountFromForm() + nextAttachments.length;
    if (projectedAttachmentCount > MAX_BOARD_ATTACHMENTS) {
      setClientUploadError(`A post can have at most ${MAX_BOARD_ATTACHMENTS} attachments.`);
      syncAttachmentsInput(pendingAttachments);
      return;
    }

    setClientUploadError(null);
    setPendingAttachments(nextAttachments);
    syncAttachmentsInput(nextAttachments);
  }

  function handleRemovePendingAttachment(indexToRemove: number) {
    const nextAttachments = pendingAttachments.filter((_, index) => index !== indexToRemove);
    setPendingAttachments(nextAttachments);
    setClientUploadError(null);
    syncAttachmentsInput(nextAttachments);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (isForwardedSubmitRef.current) {
      isForwardedSubmitRef.current = false;
      return;
    }

    const attachmentsInput = attachmentsInputRef.current;
    const files = pendingAttachments;

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
      const path = buildBoardAttachmentPath(user.id, post.id, file.name, idx);

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
    syncAttachmentsInput([]);
    isForwardedSubmitRef.current = true;
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
              <h1 style={{ fontSize: 22, margin: 0 }}>Edit Board Post</h1>
              <p className="muted" style={{ margin: 0 }}>
                Update the title and content.
              </p>
            </div>
            <Link to={`/board/${post.id}`} className="btn btn-ghost">
              Back to Post
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
                        <input
                          type="checkbox"
                          name="removeAttachmentIds"
                          value={attachment.id}
                          onChange={() => setClientUploadError(null)}
                        />
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
              <input
                id="attachments"
                type="file"
                name="attachments"
                multiple
                className="input"
                ref={attachmentsInputRef}
                onChange={handleAttachmentChange}
                disabled={isUploadingAttachments || isSubmitting}
              />
              <p className="muted text-sm" style={{ marginTop: 6 }}>
                {pendingAttachments.length} new files selected. Max {MAX_BOARD_ATTACHMENTS} total, 50 MB per file.
              </p>
              {pendingAttachments.length > 0 && (
                <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
                  {pendingAttachments.map((file, index) => (
                    <span
                      key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "4px 8px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        background: "var(--surface-2)",
                        maxWidth: 320,
                      }}
                    >
                      <span
                        className="text-sm"
                        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={file.name}
                      >
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemovePendingAttachment(index)}
                        aria-label={`Remove ${file.name}`}
                        disabled={isUploadingAttachments || isSubmitting}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "var(--muted)",
                          padding: 0,
                          cursor: "pointer",
                          fontSize: 14,
                          lineHeight: 1,
                        }}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              )}
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
                    ? "Saving..."
                    : "Save"}
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

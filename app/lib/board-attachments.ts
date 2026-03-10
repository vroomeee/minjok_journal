export const BOARD_ATTACHMENTS_BUCKET = "board-attachments";
export const MAX_BOARD_ATTACHMENTS = 10;
export const MAX_BOARD_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50 MB
export const BOARD_PREUPLOADED_ATTACHMENTS_FIELD = "preuploadedAttachments";

export type BoardAttachmentPayload = {
  file_name: string;
  file_size: number;
  content_type: string | null;
  storage_path: string;
};

function formatMB(sizeInBytes: number) {
  return (sizeInBytes / (1024 * 1024)).toFixed(0);
}

export function normalizeBoardAttachmentFiles(entries: FormDataEntryValue[]) {
  return entries.filter((entry): entry is File => entry instanceof File && entry.size > 0);
}

export function validateBoardAttachmentFiles(files: File[]) {
  if (files.length > MAX_BOARD_ATTACHMENTS) {
    return `You can upload up to ${MAX_BOARD_ATTACHMENTS} attachments per post.`;
  }

  for (const file of files) {
    if (file.size > MAX_BOARD_ATTACHMENT_SIZE) {
      return `"${file.name}" is too large. Maximum size is ${formatMB(MAX_BOARD_ATTACHMENT_SIZE)} MB per file.`;
    }
  }

  return null;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/]/g, "_");
}

function createAttachmentToken() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildBoardAttachmentPath(userId: string, postId: string, fileName: string, index: number) {
  return `${userId}/board/${postId}/${Date.now()}-${index}-${sanitizeFileName(fileName)}`;
}

export function buildBoardAttachmentPendingPath(userId: string, fileName: string, index: number) {
  return `${userId}/board/pending/${Date.now()}-${index}-${createAttachmentToken()}-${sanitizeFileName(fileName)}`;
}

function isBoardAttachmentPayload(value: unknown): value is BoardAttachmentPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BoardAttachmentPayload>;
  const hasValidName = typeof candidate.file_name === "string" && candidate.file_name.trim().length > 0;
  const hasValidSize =
    typeof candidate.file_size === "number" &&
    Number.isFinite(candidate.file_size) &&
    candidate.file_size > 0;
  const hasValidContentType =
    candidate.content_type === null || typeof candidate.content_type === "string";
  const hasValidPath =
    typeof candidate.storage_path === "string" && candidate.storage_path.trim().length > 0;

  return hasValidName && hasValidSize && hasValidContentType && hasValidPath;
}

export function parseBoardAttachmentPayload(rawValue: FormDataEntryValue | null) {
  if (!rawValue) {
    return { payloads: [] as BoardAttachmentPayload[] };
  }
  if (typeof rawValue !== "string") {
    return { payloads: [] as BoardAttachmentPayload[], error: "Invalid attachment payload." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawValue);
  } catch {
    return { payloads: [] as BoardAttachmentPayload[], error: "Invalid attachment payload." };
  }

  if (!Array.isArray(parsed)) {
    return { payloads: [] as BoardAttachmentPayload[], error: "Invalid attachment payload." };
  }

  if (parsed.length > MAX_BOARD_ATTACHMENTS) {
    return {
      payloads: [] as BoardAttachmentPayload[],
      error: `You can upload up to ${MAX_BOARD_ATTACHMENTS} attachments per post.`,
    };
  }

  const payloads: BoardAttachmentPayload[] = [];
  for (const item of parsed) {
    if (!isBoardAttachmentPayload(item)) {
      return { payloads: [] as BoardAttachmentPayload[], error: "Invalid attachment payload." };
    }
    if (item.file_size > MAX_BOARD_ATTACHMENT_SIZE) {
      return {
        payloads: [] as BoardAttachmentPayload[],
        error: `"${item.file_name}" is too large. Maximum size is ${formatMB(MAX_BOARD_ATTACHMENT_SIZE)} MB per file.`,
      };
    }
    payloads.push(item);
  }

  return { payloads };
}

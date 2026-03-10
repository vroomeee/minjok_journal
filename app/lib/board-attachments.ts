export const BOARD_ATTACHMENTS_BUCKET = "board-attachments";
export const MAX_BOARD_ATTACHMENTS = 10;
export const MAX_BOARD_ATTACHMENT_SIZE = 50 * 1024 * 1024; // 50 MB

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

export function buildBoardAttachmentPath(userId: string, postId: string, fileName: string, index: number) {
  return `${userId}/board/${postId}/${Date.now()}-${index}-${sanitizeFileName(fileName)}`;
}

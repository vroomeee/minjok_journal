import { isEnglishFileName } from "./file-names";

export const ARTICLE_FILE_ACCEPT = ".pdf,.doc,.docx";
export const MAX_ARTICLE_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export function getOptionalFormFile(formData: FormData, fieldName: string) {
  const value = formData.get(fieldName);
  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  return value;
}

export function validateArticleUpload(
  file: File | null,
  label: string,
  options?: { required?: boolean },
) {
  const required = options?.required ?? true;

  if (!file) {
    return required ? `${label} is required` : null;
  }

  if (!isEnglishFileName(file.name)) {
    return `${label} name must only use English letters, numbers, dots, hyphens, or underscores (spaces are not allowed).`;
  }

  if (file.size > MAX_ARTICLE_FILE_SIZE) {
    return `${label} is too large. Maximum size is 100 MB.`;
  }

  return null;
}

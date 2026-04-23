import {
  getLowerCaseFileExtension,
  isEnglishFileName,
  isSafeDocumentFileName,
} from "./file-names";

export const ARTICLE_FILE_ACCEPT = ".pdf,.doc,.docx";
export const ARTICLE_FILE_EXTENSIONS = ARTICLE_FILE_ACCEPT.split(",");
export const MAX_ARTICLE_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
export type ArticleFileNamePolicy = "english" | "multilingual";

function hasAllowedArticleFileExtension(fileName: string) {
  return ARTICLE_FILE_EXTENSIONS.includes(getLowerCaseFileExtension(fileName));
}

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
  options?: { required?: boolean; namePolicy?: ArticleFileNamePolicy },
) {
  const required = options?.required ?? true;
  const namePolicy = options?.namePolicy ?? "english";

  if (!file) {
    return required ? `${label} is required` : null;
  }

  if (!hasAllowedArticleFileExtension(file.name)) {
    return `${label} must be a PDF, DOC, or DOCX file.`;
  }

  const hasValidFileName =
    namePolicy === "multilingual"
      ? isSafeDocumentFileName(file.name)
      : isEnglishFileName(file.name);

  if (!hasValidFileName) {
    if (namePolicy === "multilingual") {
      return `${label} name can use Korean, English letters, numbers, spaces, dots, parentheses, brackets, hyphens, and underscores.`;
    }

    return `${label} name must only use English letters, numbers, dots, hyphens, or underscores (spaces are not allowed).`;
  }

  if (file.size > MAX_ARTICLE_FILE_SIZE) {
    return `${label} is too large. Maximum size is 100 MB.`;
  }

  return null;
}

const ENGLISH_FILE_NAME_REGEX = /^[A-Za-z0-9._-]+$/;
const MULTILINGUAL_DOCUMENT_FILE_NAME_REGEX = /^[\p{L}\p{N} ._()\[\]-]+$/u;
const FILE_NAME_CONTROL_OR_PATH_SEPARATOR_REGEX = /[\\/\u0000-\u001f\u007f]/;

export function isEnglishFileName(name: string) {
  return ENGLISH_FILE_NAME_REGEX.test(name);
}

export function isSafeDocumentFileName(name: string) {
  if (!name || name !== name.trim()) {
    return false;
  }

  if (FILE_NAME_CONTROL_OR_PATH_SEPARATOR_REGEX.test(name)) {
    return false;
  }

  return MULTILINGUAL_DOCUMENT_FILE_NAME_REGEX.test(name);
}

export function getLowerCaseFileExtension(name: string) {
  const trimmedName = name.trim();
  const extensionIndex = trimmedName.lastIndexOf(".");

  if (extensionIndex <= 0 || extensionIndex === trimmedName.length - 1) {
    return "";
  }

  return trimmedName.slice(extensionIndex).toLowerCase();
}

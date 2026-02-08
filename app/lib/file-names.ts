const ENGLISH_FILE_NAME_REGEX = /^[A-Za-z0-9._-]+$/;

export function isEnglishFileName(name: string) {
  return ENGLISH_FILE_NAME_REGEX.test(name);
}

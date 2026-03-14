import { createSupabaseAdminClient } from "./supabase.server";
import { collectStorageObjectPaths } from "./storage";
import { MAX_ARTICLE_FILE_SIZE } from "./article-files";

export const ARTICLE_FILES_BUCKET = "articles";
const ARTICLE_SIGNED_URL_EXPIRES_IN = 60 * 10; // 10 minutes

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/]/g, "_");
}

function requireArticleAdminClient() {
  const adminClient = createSupabaseAdminClient();
  if (!adminClient) {
    throw new Error(
      "Article file operations require SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return adminClient.supabase;
}

export function buildOriginalArticlePath(
  articleId: string,
  versionNumber: number,
  fileName: string,
) {
  return `${articleId}/versions/v${versionNumber}/original/${Date.now()}-${sanitizeFileName(fileName)}`;
}

export function buildBlindArticlePath(
  articleId: string,
  versionNumber: number,
  fileName: string,
) {
  return `${articleId}/versions/v${versionNumber}/blind/${Date.now()}-${sanitizeFileName(fileName)}`;
}

export function buildCopyrightArticlePath(articleId: string, fileName: string) {
  return `${articleId}/article/copyright/${Date.now()}-${sanitizeFileName(fileName)}`;
}

export async function uploadArticleFile(path: string, file: File) {
  const supabase = requireArticleAdminClient();
  const { error } = await supabase.storage
    .from(ARTICLE_FILES_BUCKET)
    .upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload article file: ${error.message}`);
  }
}

export async function removeArticleFiles(
  paths: Array<string | null | undefined>,
) {
  const uniquePaths = collectStorageObjectPaths(paths, ARTICLE_FILES_BUCKET);
  if (uniquePaths.length === 0) {
    return;
  }

  const supabase = requireArticleAdminClient();
  const { error } = await supabase.storage
    .from(ARTICLE_FILES_BUCKET)
    .remove(uniquePaths);

  if (error) {
    throw new Error(`Failed to remove article files: ${error.message}`);
  }
}

export async function createSignedArticleUrl(
  path: string,
  options?: {
    download?: string | boolean;
    expiresIn?: number;
  },
) {
  const supabase = requireArticleAdminClient();
  const signedUrlOptions =
    options?.download === undefined ? undefined : { download: options.download };
  const { data, error } = await supabase.storage
    .from(ARTICLE_FILES_BUCKET)
    .createSignedUrl(
      path,
      options?.expiresIn ?? ARTICLE_SIGNED_URL_EXPIRES_IN,
      signedUrlOptions,
    );

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to create article signed URL: ${error?.message || "unknown error"}`,
    );
  }

  return data.signedUrl;
}

export async function createSignedArticleUrls(path: string, fileName: string) {
  const [viewUrl, downloadUrl] = await Promise.all([
    createSignedArticleUrl(path),
    createSignedArticleUrl(path, { download: fileName }),
  ]);

  return { viewUrl, downloadUrl };
}

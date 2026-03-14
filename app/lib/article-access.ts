import { isReviewRole } from "./roles";

type ArticleAccessShape = {
  author_id: string;
  status?: string | null;
  authors?: Array<{ profile_id: string }> | null;
};

export function isArticleAuthor(
  article: ArticleAccessShape | null | undefined,
  userId: string | null | undefined,
) {
  if (!article || !userId) {
    return false;
  }

  return (
    article.author_id === userId ||
    article.authors?.some((author) => author.profile_id === userId) ||
    false
  );
}

export function canAccessArticle(
  article: ArticleAccessShape | null | undefined,
  userId: string | null | undefined,
  roleType: string | null | undefined,
) {
  if (!article) {
    return false;
  }

  if (article.status === "published") {
    return true;
  }

  return isArticleAuthor(article, userId) || isReviewRole(roleType);
}

export function shouldUseBlindReviewFile(roleType: string | null | undefined) {
  return roleType === "prof";
}

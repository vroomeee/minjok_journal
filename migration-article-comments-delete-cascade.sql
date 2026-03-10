-- Migration: Delete article comments when an article is deleted
-- Also restores comments.version_id FK and cleans existing orphaned article comments.

-- Remove comments pointing at missing articles.
DELETE FROM public.comments c
WHERE c.comment_type = 'article'
  AND NOT EXISTS (
    SELECT 1 FROM public.articles a WHERE a.id = c.article_id
  );

-- Remove comments pointing at missing versions.
DELETE FROM public.comments c
WHERE c.comment_type = 'article'
  AND c.version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.article_versions av WHERE av.id = c.version_id
  );

-- Ensure version-level referential integrity is present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'comments'
      AND con.conname = 'comments_version_id_fkey'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_version_id_fkey
      FOREIGN KEY (version_id)
      REFERENCES public.article_versions(id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

-- Trigger-based cleanup for article deletes.
CREATE OR REPLACE FUNCTION public.delete_article_comments_for_article()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.comments
  WHERE comment_type = 'article'
    AND article_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS delete_article_comments_on_article_delete ON public.articles;
CREATE TRIGGER delete_article_comments_on_article_delete
  AFTER DELETE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.delete_article_comments_for_article();

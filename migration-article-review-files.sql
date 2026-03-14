-- Multi-file article review flow:
-- - per-version original + blinded files
-- - per-article copyright consent file
-- - private articles bucket with signed URL delivery
-- - restrict draft/in_review visibility to authors + review roles

ALTER TABLE public.article_versions
  ADD COLUMN IF NOT EXISTS blind_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS blind_file_name TEXT,
  ADD COLUMN IF NOT EXISTS blind_file_size BIGINT;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS copyright_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS copyright_file_name TEXT,
  ADD COLUMN IF NOT EXISTS copyright_file_size BIGINT,
  ADD COLUMN IF NOT EXISTS copyright_uploaded_at TIMESTAMPTZ;

INSERT INTO storage.buckets (id, name, public)
VALUES ('articles', 'articles', false)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public;

DROP POLICY IF EXISTS "Anyone can view article files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload article files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own article files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own article files" ON storage.objects;
DROP POLICY IF EXISTS "articles_object_select_public" ON storage.objects;
DROP POLICY IF EXISTS "articles_object_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "articles_object_update_owner" ON storage.objects;
DROP POLICY IF EXISTS "articles_object_delete_owner" ON storage.objects;

DROP POLICY IF EXISTS "articles_select_public" ON public.articles;
DROP POLICY IF EXISTS "articles_select_visible" ON public.articles;
CREATE POLICY "articles_select_visible"
  ON public.articles FOR SELECT
  USING (
    status = 'published'
    OR author_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.article_authors aa
      WHERE aa.article_id = articles.id
        AND aa.profile_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role_type IN ('mentor', 'prof', 'admin')
    )
  );

DROP POLICY IF EXISTS "article_versions_select_public" ON public.article_versions;
DROP POLICY IF EXISTS "article_versions_select_visible" ON public.article_versions;
CREATE POLICY "article_versions_select_visible"
  ON public.article_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.articles a
      WHERE a.id = article_versions.article_id
        AND (
          a.status = 'published'
          OR a.author_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.article_authors aa
            WHERE aa.article_id = a.id
              AND aa.profile_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = (SELECT auth.uid())
              AND p.role_type IN ('mentor', 'prof', 'admin')
          )
        )
    )
  );

DROP POLICY IF EXISTS "article_authors_select_public" ON public.article_authors;
DROP POLICY IF EXISTS "article_authors_select_visible" ON public.article_authors;
CREATE POLICY "article_authors_select_visible"
  ON public.article_authors FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.articles a
      WHERE a.id = article_authors.article_id
        AND (
          a.status = 'published'
          OR a.author_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.article_authors aa
            WHERE aa.article_id = a.id
              AND aa.profile_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = (SELECT auth.uid())
              AND p.role_type IN ('mentor', 'prof', 'admin')
          )
        )
    )
  );

DROP POLICY IF EXISTS "comments_select_public" ON public.comments;
DROP POLICY IF EXISTS "comments_select_visible" ON public.comments;
CREATE POLICY "comments_select_visible"
  ON public.comments FOR SELECT
  USING (
    comment_type = 'board'
    OR EXISTS (
      SELECT 1
      FROM public.articles a
      WHERE a.id = comments.article_id
        AND (
          a.status = 'published'
          OR a.author_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.article_authors aa
            WHERE aa.article_id = a.id
              AND aa.profile_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = (SELECT auth.uid())
              AND p.role_type IN ('mentor', 'prof', 'admin')
          )
        )
    )
  );

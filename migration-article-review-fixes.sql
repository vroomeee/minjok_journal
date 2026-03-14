-- Fixes for article review privacy and edit/delete consistency:
-- - avoid recursive RLS on article_authors
-- - make paper edit author updates atomic
-- - allow article deletes to cascade issue_articles before storage cleanup

CREATE OR REPLACE FUNCTION public.can_access_article_for_user(
  p_article_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.articles a
    LEFT JOIN public.profiles p
      ON p.id = p_user_id
    WHERE a.id = p_article_id
      AND (
        a.status = 'published'
        OR (
          p_user_id IS NOT NULL
          AND (
            a.author_id = p_user_id
            OR EXISTS (
              SELECT 1
              FROM public.article_authors aa
              WHERE aa.article_id = a.id
                AND aa.profile_id = p_user_id
            )
            OR COALESCE(p.role_type, '') IN ('mentor', 'prof', 'admin')
          )
        )
      )
  );
$$;

DROP POLICY IF EXISTS "articles_select_visible" ON public.articles;
CREATE POLICY "articles_select_visible"
  ON public.articles FOR SELECT
  USING (public.can_access_article_for_user(id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "article_versions_select_visible" ON public.article_versions;
CREATE POLICY "article_versions_select_visible"
  ON public.article_versions FOR SELECT
  USING (
    public.can_access_article_for_user(article_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "article_authors_select_visible" ON public.article_authors;
CREATE POLICY "article_authors_select_visible"
  ON public.article_authors FOR SELECT
  USING (
    public.can_access_article_for_user(article_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "comments_select_visible" ON public.comments;
CREATE POLICY "comments_select_visible"
  ON public.comments FOR SELECT
  USING (
    comment_type = 'board'
    OR public.can_access_article_for_user(article_id, (SELECT auth.uid()))
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'issue_articles_article_id_fkey'
      AND conrelid = 'public.issue_articles'::regclass
  ) THEN
    ALTER TABLE public.issue_articles
      DROP CONSTRAINT issue_articles_article_id_fkey;
  END IF;
END;
$$;

ALTER TABLE public.issue_articles
  ADD CONSTRAINT issue_articles_article_id_fkey
  FOREIGN KEY (article_id)
  REFERENCES public.articles(id)
  ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.update_article_details_and_authors(
  p_article_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_copyright_storage_path TEXT,
  p_copyright_file_name TEXT,
  p_copyright_file_size BIGINT,
  p_copyright_uploaded_at TIMESTAMPTZ,
  p_coauthor_ids UUID[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_article public.articles%ROWTYPE;
  v_is_admin BOOLEAN := false;
  v_normalized_coauthors UUID[] := ARRAY[]::UUID[];
  v_profile_id UUID;
  v_position INTEGER := 1;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT *
  INTO v_article
  FROM public.articles
  WHERE id = p_article_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Article not found';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_actor_id
      AND p.role_type = 'admin'
  )
  INTO v_is_admin;

  IF v_article.author_id <> v_actor_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(array_agg(profile_id ORDER BY ord), ARRAY[]::UUID[])
  INTO v_normalized_coauthors
  FROM (
    SELECT input.profile_id, MIN(input.ord) AS ord
    FROM unnest(COALESCE(p_coauthor_ids, ARRAY[]::UUID[]))
      WITH ORDINALITY AS input(profile_id, ord)
    WHERE input.profile_id IS NOT NULL
      AND input.profile_id <> v_article.author_id
    GROUP BY input.profile_id
  ) deduped;

  UPDATE public.articles
  SET title = p_title,
      description = p_description,
      updated_at = NOW(),
      copyright_storage_path = COALESCE(
        p_copyright_storage_path,
        copyright_storage_path
      ),
      copyright_file_name = CASE
        WHEN p_copyright_storage_path IS NULL THEN copyright_file_name
        ELSE p_copyright_file_name
      END,
      copyright_file_size = CASE
        WHEN p_copyright_storage_path IS NULL THEN copyright_file_size
        ELSE p_copyright_file_size
      END,
      copyright_uploaded_at = CASE
        WHEN p_copyright_storage_path IS NULL THEN copyright_uploaded_at
        ELSE p_copyright_uploaded_at
      END
  WHERE id = p_article_id;

  INSERT INTO public.article_authors (
    article_id,
    profile_id,
    is_corresponding,
    position
  )
  SELECT p_article_id, v_article.author_id, true, 0
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.article_authors
    WHERE article_id = p_article_id
      AND profile_id = v_article.author_id
  );

  DELETE FROM public.article_authors
  WHERE article_id = p_article_id
    AND profile_id <> v_article.author_id
    AND NOT (profile_id = ANY(v_normalized_coauthors));

  FOREACH v_profile_id IN ARRAY v_normalized_coauthors
  LOOP
    INSERT INTO public.article_authors (
      article_id,
      profile_id,
      is_corresponding,
      position
    )
    SELECT p_article_id, v_profile_id, false, 0
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.article_authors
      WHERE article_id = p_article_id
        AND profile_id = v_profile_id
    );
  END LOOP;

  UPDATE public.article_authors
  SET position = 0,
      is_corresponding = true
  WHERE article_id = p_article_id
    AND profile_id = v_article.author_id;

  FOREACH v_profile_id IN ARRAY v_normalized_coauthors
  LOOP
    UPDATE public.article_authors
    SET position = v_position,
        is_corresponding = false
    WHERE article_id = p_article_id
      AND profile_id = v_profile_id;

    v_position := v_position + 1;
  END LOOP;
END;
$$;

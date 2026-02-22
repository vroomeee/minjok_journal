-- Coauthor guardrails:
-- 1) Keep exactly one author mapping per (article, profile)
-- 2) Normalize corresponding-author flags (submitter only)
-- 3) Prevent deleting the submitter mapping via RLS
-- 4) Tighten INSERT/UPDATE checks on article_authors

DO $$
BEGIN
  IF to_regclass('public.articles') IS NULL
     OR to_regclass('public.article_authors') IS NULL
     OR to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION
      'Required tables are missing (articles, article_authors, profiles).';
  END IF;
END $$;

ALTER TABLE article_authors ENABLE ROW LEVEL SECURITY;

-- Backfill submitter mapping when missing.
INSERT INTO article_authors (article_id, profile_id, position, is_corresponding)
SELECT a.id, a.author_id, 0, true
FROM articles a
WHERE NOT EXISTS (
  SELECT 1
  FROM article_authors aa
  WHERE aa.article_id = a.id
    AND aa.profile_id = a.author_id
);

-- Remove duplicate author mappings, keeping the earliest row.
WITH ranked_article_authors AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY article_id, profile_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM article_authors
)
DELETE FROM article_authors aa
USING ranked_article_authors raa
WHERE aa.id = raa.id
  AND raa.rn > 1;

-- Normalize submitter/coauthor flags.
UPDATE article_authors aa
SET is_corresponding = (aa.profile_id = a.author_id)
FROM articles a
WHERE a.id = aa.article_id
  AND COALESCE(aa.is_corresponding, false) IS DISTINCT FROM (aa.profile_id = a.author_id);

-- Keep the submitter in position 0.
UPDATE article_authors aa
SET position = 0
FROM articles a
WHERE a.id = aa.article_id
  AND aa.profile_id = a.author_id
  AND aa.position IS DISTINCT FROM 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'article_authors_article_profile_unique'
  ) THEN
    ALTER TABLE article_authors
      ADD CONSTRAINT article_authors_article_profile_unique UNIQUE (article_id, profile_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'article_authors_position_non_negative'
  ) THEN
    ALTER TABLE article_authors
      ADD CONSTRAINT article_authors_position_non_negative
      CHECK (position IS NULL OR position >= 0);
  END IF;
END $$;

DROP POLICY IF EXISTS "article_authors_manage_authors" ON article_authors;
CREATE POLICY "article_authors_manage_authors"
  ON article_authors FOR INSERT
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM articles a
        WHERE a.id = article_id AND a.author_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
      )
    )
    AND (
      (
        EXISTS (
          SELECT 1 FROM articles a
          WHERE a.id = article_id AND a.author_id = profile_id
        )
        AND COALESCE(is_corresponding, false) = true
      )
      OR (
        EXISTS (
          SELECT 1 FROM articles a
          WHERE a.id = article_id AND a.author_id <> profile_id
        )
        AND COALESCE(is_corresponding, false) = false
      )
    )
  );

DROP POLICY IF EXISTS "article_authors_update_authors_or_admin" ON article_authors;
CREATE POLICY "article_authors_update_authors_or_admin"
  ON article_authors FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM articles a
      WHERE a.id = article_id AND a.author_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
  )
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM articles a
        WHERE a.id = article_id AND a.author_id = (SELECT auth.uid())
      )
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
      )
    )
    AND (
      (
        EXISTS (
          SELECT 1 FROM articles a
          WHERE a.id = article_id AND a.author_id = profile_id
        )
        AND COALESCE(is_corresponding, false) = true
      )
      OR (
        EXISTS (
          SELECT 1 FROM articles a
          WHERE a.id = article_id AND a.author_id <> profile_id
        )
        AND COALESCE(is_corresponding, false) = false
      )
    )
    AND (
      EXISTS (
        SELECT 1 FROM articles a
        WHERE a.id = article_id AND a.author_id = profile_id
      )
      OR EXISTS (
        SELECT 1
        FROM article_authors aa_primary
        JOIN articles a ON a.id = aa_primary.article_id
        WHERE aa_primary.article_id = article_authors.article_id
          AND aa_primary.profile_id = a.author_id
          AND aa_primary.id <> article_authors.id
      )
    )
  );

DROP POLICY IF EXISTS "article_authors_delete_authors_or_admin" ON article_authors;
CREATE POLICY "article_authors_delete_authors_or_admin"
  ON article_authors FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
    OR (
      EXISTS (
        SELECT 1 FROM articles a
        WHERE a.id = article_id AND a.author_id = (SELECT auth.uid())
      )
      AND EXISTS (
        SELECT 1 FROM articles a
        WHERE a.id = article_id AND a.author_id <> profile_id
      )
    )
  );

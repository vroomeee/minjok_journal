-- Issue/Volume guardrails:
-- 1) Remove duplicate mappings
-- 2) Add DB constraints to block duplicate mappings
-- 3) Tighten RLS checks for insert/update on mapping tables

DO $$
BEGIN
  IF to_regclass('public.issues') IS NULL
     OR to_regclass('public.issue_articles') IS NULL
     OR to_regclass('public.volumes') IS NULL
     OR to_regclass('public.volume_issues') IS NULL
     OR to_regclass('public.articles') IS NULL
     OR to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION
      'Required tables are missing (issues, issue_articles, volumes, volume_issues, articles, profiles).';
  END IF;
END $$;

ALTER TABLE issue_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE volume_issues ENABLE ROW LEVEL SECURITY;

-- 1) Remove duplicate mappings, keeping the earliest row.
WITH ranked_issue_articles AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY article_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM issue_articles
)
DELETE FROM issue_articles ia
USING ranked_issue_articles ria
WHERE ia.id = ria.id
  AND ria.rn > 1;

WITH ranked_volume_issues AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY issue_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM volume_issues
)
DELETE FROM volume_issues vi
USING ranked_volume_issues rvi
WHERE vi.id = rvi.id
  AND rvi.rn > 1;

WITH ranked_issue_positions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY issue_id, position
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM issue_articles
  WHERE position IS NOT NULL
)
DELETE FROM issue_articles ia
USING ranked_issue_positions rip
WHERE ia.id = rip.id
  AND rip.rn > 1;

WITH ranked_volume_positions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY volume_id, position
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM volume_issues
  WHERE position IS NOT NULL
)
DELETE FROM volume_issues vi
USING ranked_volume_positions rvp
WHERE vi.id = rvp.id
  AND rvp.rn > 1;

-- 2) Add uniqueness constraints.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'issue_articles_article_id_unique'
  ) THEN
    ALTER TABLE issue_articles
      ADD CONSTRAINT issue_articles_article_id_unique UNIQUE (article_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'volume_issues_issue_id_unique'
  ) THEN
    ALTER TABLE volume_issues
      ADD CONSTRAINT volume_issues_issue_id_unique UNIQUE (issue_id);
  END IF;
END $$;

-- Optional ordering integrity inside a single parent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'issue_articles_issue_position_unique'
  ) THEN
    ALTER TABLE issue_articles
      ADD CONSTRAINT issue_articles_issue_position_unique UNIQUE (issue_id, position);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'volume_issues_volume_position_unique'
  ) THEN
    ALTER TABLE volume_issues
      ADD CONSTRAINT volume_issues_volume_position_unique UNIQUE (volume_id, position);
  END IF;
END $$;

-- 3) Tighten RLS checks on mapping table writes.
-- Keep admin-only writes, and validate parent status.
DROP POLICY IF EXISTS "issue_articles_insert_admin" ON issue_articles;
CREATE POLICY "issue_articles_insert_admin"
  ON issue_articles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
    AND EXISTS (
      SELECT 1 FROM issues i
      WHERE i.id = issue_id
    )
    AND EXISTS (
      SELECT 1 FROM articles a
      WHERE a.id = article_id AND a.status = 'published'
    )
  );

DROP POLICY IF EXISTS "issue_articles_update_admin" ON issue_articles;
CREATE POLICY "issue_articles_update_admin"
  ON issue_articles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
    AND EXISTS (
      SELECT 1 FROM issues i
      WHERE i.id = issue_id
    )
    AND EXISTS (
      SELECT 1 FROM articles a
      WHERE a.id = article_id AND a.status = 'published'
    )
  );

DROP POLICY IF EXISTS "volume_issues_insert_admin" ON volume_issues;
CREATE POLICY "volume_issues_insert_admin"
  ON volume_issues FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
    AND EXISTS (
      SELECT 1 FROM volumes v
      WHERE v.id = volume_id
    )
    AND EXISTS (
      SELECT 1 FROM issues i
      WHERE i.id = issue_id AND i.status = 'released'
    )
  );

DROP POLICY IF EXISTS "volume_issues_update_admin" ON volume_issues;
CREATE POLICY "volume_issues_update_admin"
  ON volume_issues FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
    AND EXISTS (
      SELECT 1 FROM volumes v
      WHERE v.id = volume_id
    )
    AND EXISTS (
      SELECT 1 FROM issues i
      WHERE i.id = issue_id AND i.status = 'released'
    )
  );

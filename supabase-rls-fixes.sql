-- Supabase RLS policy cleanup + lint fixes
-- Addresses:
-- 1) auth_rls_initplan: wrap auth.<function>() in SELECT to avoid per-row eval
-- 2) multiple_permissive_policies: consolidate to single permissive policy per action
--
-- Run in Supabase SQL editor.

-- =========================
-- Helper: drop known policies
-- =========================
-- Profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_self" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;

-- Articles
DROP POLICY IF EXISTS "Articles are viewable by everyone" ON articles;
DROP POLICY IF EXISTS "Authenticated users can create articles" ON articles;
DROP POLICY IF EXISTS "Authors can update their own articles" ON articles;
DROP POLICY IF EXISTS "Authors and admins can delete articles" ON articles;
DROP POLICY IF EXISTS "articles_insert_self" ON articles;
DROP POLICY IF EXISTS "articles_update_authors_or_admin" ON articles;
DROP POLICY IF EXISTS "articles_delete_authors_or_admin" ON articles;
DROP POLICY IF EXISTS "articles_select" ON articles;
DROP POLICY IF EXISTS "articles_select_public" ON articles;

-- Article versions
DROP POLICY IF EXISTS "Article versions are viewable by everyone" ON article_versions;
DROP POLICY IF EXISTS "Authors can create versions for their articles" ON article_versions;
DROP POLICY IF EXISTS "authors can insert versions" ON article_versions;
DROP POLICY IF EXISTS "article_versions_insert_authors" ON article_versions;
DROP POLICY IF EXISTS "article_versions_update_authors" ON article_versions;
DROP POLICY IF EXISTS "article_versions_delete_authors" ON article_versions;
DROP POLICY IF EXISTS "article_versions_select" ON article_versions;

-- Comments
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON comments;
DROP POLICY IF EXISTS "Authenticated users can create comments" ON comments;
DROP POLICY IF EXISTS "Comment authors can update their own comments" ON comments;
DROP POLICY IF EXISTS "Comment authors can delete their own comments" ON comments;
DROP POLICY IF EXISTS "comments_insert_self" ON comments;
DROP POLICY IF EXISTS "comments_update_author_or_admin" ON comments;
DROP POLICY IF EXISTS "comments_delete_author_or_admin" ON comments;
DROP POLICY IF EXISTS "comments_select" ON comments;
DROP POLICY IF EXISTS "Admins can update comments" ON comments;
DROP POLICY IF EXISTS "Admins can delete comments" ON comments;

-- Board posts
DROP POLICY IF EXISTS "Board posts are viewable by everyone" ON board_posts;
DROP POLICY IF EXISTS "Only admins can create board posts" ON board_posts;
DROP POLICY IF EXISTS "Only admins can update board posts" ON board_posts;
DROP POLICY IF EXISTS "Only admins can delete board posts" ON board_posts;
DROP POLICY IF EXISTS "Authors and admins can update board posts" ON board_posts;
DROP POLICY IF EXISTS "Authors and admins can delete board posts" ON board_posts;
DROP POLICY IF EXISTS "board_posts_insert_admin" ON board_posts;
DROP POLICY IF EXISTS "board_posts_update_admin" ON board_posts;
DROP POLICY IF EXISTS "board_posts_delete_admin" ON board_posts;
DROP POLICY IF EXISTS "board_posts_select" ON board_posts;
DROP POLICY IF EXISTS "board_posts_select_public" ON board_posts;

-- Q&A
DROP POLICY IF EXISTS "Questions are viewable by everyone" ON qna_questions;
DROP POLICY IF EXISTS "Authenticated users can ask questions" ON qna_questions;
DROP POLICY IF EXISTS "Question authors can update their own questions" ON qna_questions;
DROP POLICY IF EXISTS "Question authors can delete their own questions" ON qna_questions;
DROP POLICY IF EXISTS "qna_questions_insert_self" ON qna_questions;
DROP POLICY IF EXISTS "qna_questions_update_author_or_admin" ON qna_questions;
DROP POLICY IF EXISTS "qna_questions_delete_author_or_admin" ON qna_questions;
DROP POLICY IF EXISTS "qna_questions_select_public" ON qna_questions;
DROP POLICY IF EXISTS "qna_questions_select" ON qna_questions;
DROP POLICY IF EXISTS "Admins can update questions" ON qna_questions;
DROP POLICY IF EXISTS "Admins can delete questions" ON qna_questions;

DROP POLICY IF EXISTS "Replies are viewable by everyone" ON qna_replies;
DROP POLICY IF EXISTS "Only mentors can create replies" ON qna_replies;
DROP POLICY IF EXISTS "Reply authors can update their own replies" ON qna_replies;
DROP POLICY IF EXISTS "Reply authors can delete their own replies" ON qna_replies;
DROP POLICY IF EXISTS "qna_replies_insert_privileged" ON qna_replies;
DROP POLICY IF EXISTS "qna_replies_update_author_or_admin" ON qna_replies;
DROP POLICY IF EXISTS "qna_replies_delete_author_or_admin" ON qna_replies;
DROP POLICY IF EXISTS "qna_replies_select_public" ON qna_replies;
DROP POLICY IF EXISTS "qna_replies_select" ON qna_replies;
DROP POLICY IF EXISTS "Admins can create replies" ON qna_replies;
DROP POLICY IF EXISTS "Admins can update replies" ON qna_replies;
DROP POLICY IF EXISTS "Admins can delete replies" ON qna_replies;

-- Article authors
DROP POLICY IF EXISTS "Article authors are viewable by everyone" ON article_authors;
DROP POLICY IF EXISTS "article_authors_select_public" ON article_authors;
DROP POLICY IF EXISTS "article_authors_manage_authors" ON article_authors;
DROP POLICY IF EXISTS "author can manage authors" ON article_authors;
DROP POLICY IF EXISTS "Primary author can manage coauthors" ON article_authors;
DROP POLICY IF EXISTS "Primary author can remove coauthors" ON article_authors;

-- Issues + junctions
DROP POLICY IF EXISTS "issues_select_public" ON issues;
DROP POLICY IF EXISTS "issues_modify_admin" ON issues;
DROP POLICY IF EXISTS "issue_articles_select_public" ON issue_articles;
DROP POLICY IF EXISTS "issue_articles_modify_admin" ON issue_articles;

-- Volumes + junctions
DROP POLICY IF EXISTS "volumes_select_public" ON volumes;
DROP POLICY IF EXISTS "volumes_modify_admin" ON volumes;
DROP POLICY IF EXISTS "volume_issues_select_public" ON volume_issues;
DROP POLICY IF EXISTS "volume_issues_modify_admin" ON volume_issues;

-- =========================
-- Recreate consolidated policies (with initplan-friendly auth calls)
-- =========================

-- =========================
-- Fix lint: function search_path mutable
-- =========================
ALTER FUNCTION public.is_admin() SET search_path = public, pg_catalog;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_catalog;

-- Profiles
CREATE POLICY "profiles_select_public"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "profiles_insert_self"
  ON profiles FOR INSERT
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "profiles_update_self_or_admin"
  ON profiles FOR UPDATE
  USING (
    (select auth.uid()) = id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) = id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

-- Articles
CREATE POLICY "articles_select_public"
  ON articles FOR SELECT
  USING (true);

CREATE POLICY "articles_insert_self"
  ON articles FOR INSERT
  WITH CHECK ((select auth.uid()) = author_id);

CREATE POLICY "articles_update_authors_or_admin"
  ON articles FOR UPDATE
  USING (
    (select auth.uid()) = author_id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

CREATE POLICY "articles_delete_authors_or_admin"
  ON articles FOR DELETE
  USING (
    (select auth.uid()) = author_id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

-- Article versions
CREATE POLICY "article_versions_select_public"
  ON article_versions FOR SELECT
  USING (true);

CREATE POLICY "article_versions_insert_authors"
  ON article_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM articles a
      WHERE a.id = article_id AND a.author_id = (select auth.uid())
    )
  );

CREATE POLICY "article_versions_update_authors_or_admin"
  ON article_versions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM articles a
      WHERE a.id = article_id AND a.author_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

CREATE POLICY "article_versions_delete_authors_or_admin"
  ON article_versions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM articles a
      WHERE a.id = article_id AND a.author_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

-- Comments
CREATE POLICY "comments_select_public"
  ON comments FOR SELECT
  USING (true);

CREATE POLICY "comments_insert_self"
  ON comments FOR INSERT
  WITH CHECK ((select auth.uid()) = author_id);

CREATE POLICY "comments_update_author_or_admin"
  ON comments FOR UPDATE
  USING (
    (select auth.uid()) = author_id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) = author_id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

CREATE POLICY "comments_delete_author_or_admin"
  ON comments FOR DELETE
  USING (
    (select auth.uid()) = author_id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

-- Board posts
CREATE POLICY "board_posts_select_public"
  ON board_posts FOR SELECT
  USING (true);

CREATE POLICY "board_posts_admin_insert"
  ON board_posts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

CREATE POLICY "board_posts_admin_update"
  ON board_posts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

CREATE POLICY "board_posts_admin_delete"
  ON board_posts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

-- Q&A questions
CREATE POLICY "qna_questions_select_public"
  ON qna_questions FOR SELECT
  USING (true);

CREATE POLICY "qna_questions_insert_self"
  ON qna_questions FOR INSERT
  WITH CHECK ((select auth.uid()) = author_id);

CREATE POLICY "qna_questions_update_author_or_admin"
  ON qna_questions FOR UPDATE
  USING (
    (select auth.uid()) = author_id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) = author_id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

CREATE POLICY "qna_questions_delete_author_or_admin"
  ON qna_questions FOR DELETE
  USING (
    (select auth.uid()) = author_id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

-- Q&A replies
CREATE POLICY "qna_replies_select_public"
  ON qna_replies FOR SELECT
  USING (true);

CREATE POLICY "qna_replies_insert_privileged"
  ON qna_replies FOR INSERT
  WITH CHECK (
    (select auth.uid()) = author_id AND
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid())
        AND p.role_type IN ('mentor', 'admin')
    )
  );

CREATE POLICY "qna_replies_update_author_or_admin"
  ON qna_replies FOR UPDATE
  USING (
    (select auth.uid()) = author_id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) = author_id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

CREATE POLICY "qna_replies_delete_author_or_admin"
  ON qna_replies FOR DELETE
  USING (
    (select auth.uid()) = author_id OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

-- Article authors
CREATE POLICY "article_authors_select_public"
  ON article_authors FOR SELECT
  USING (true);

CREATE POLICY "article_authors_manage_authors"
  ON article_authors FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM articles a
      WHERE a.id = article_id AND a.author_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

CREATE POLICY "article_authors_update_authors_or_admin"
  ON article_authors FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM articles a
      WHERE a.id = article_id AND a.author_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM articles a
      WHERE a.id = article_id AND a.author_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

CREATE POLICY "article_authors_delete_authors_or_admin"
  ON article_authors FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM articles a
      WHERE a.id = article_id AND a.author_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

-- Issues + issue_articles
CREATE POLICY "issues_select_public_or_admin"
  ON issues FOR SELECT
  USING (
    status = 'released' OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

CREATE POLICY "issues_modify_admin"
  ON issues FOR INSERT, UPDATE, DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

CREATE POLICY "issue_articles_select_public_or_admin"
  ON issue_articles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM issues i WHERE i.id = issue_id AND i.status = 'released')
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

CREATE POLICY "issue_articles_modify_admin"
  ON issue_articles FOR INSERT, UPDATE, DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

-- Volumes + volume_issues
CREATE POLICY "volumes_select_public_or_admin"
  ON volumes FOR SELECT
  USING (
    status = 'released' OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

CREATE POLICY "volumes_modify_admin"
  ON volumes FOR INSERT, UPDATE, DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

CREATE POLICY "volume_issues_select_public_or_admin"
  ON volume_issues FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM volumes v WHERE v.id = volume_id AND v.status = 'released')
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

CREATE POLICY "volume_issues_modify_admin"
  ON volume_issues FOR INSERT, UPDATE, DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid()) AND p.role_type = 'admin'
    )
  );

-- Migration: Add comment_type column to comments table
-- Run this in the Supabase SQL Editor to migrate an existing database

-- 1. Add comment_type column with default 'article' (so existing comments are article comments)
ALTER TABLE comments ADD COLUMN IF NOT EXISTS comment_type TEXT
  CHECK (comment_type IN ('article', 'board'))
  NOT NULL DEFAULT 'article';

-- 2. Make version_id nullable (board comments don't have a version)
ALTER TABLE comments ALTER COLUMN version_id DROP NOT NULL;

-- 3. Add index for comment_type
CREATE INDEX IF NOT EXISTS idx_comments_type ON comments(comment_type);

-- 4. Update any existing board comments (comments where article_id matches a board_posts.id)
UPDATE comments
SET comment_type = 'board', version_id = NULL
WHERE article_id IN (SELECT id FROM board_posts);

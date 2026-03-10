-- Migration: Delete board comments when a board post is deleted
-- comments.article_id is polymorphic (articles.id OR board_posts.id), so we use a trigger.

CREATE OR REPLACE FUNCTION public.delete_board_post_comments()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.comments
  WHERE comment_type = 'board'
    AND article_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

DROP TRIGGER IF EXISTS delete_board_comments_on_post_delete ON public.board_posts;
CREATE TRIGGER delete_board_comments_on_post_delete
  AFTER DELETE ON public.board_posts
  FOR EACH ROW EXECUTE FUNCTION public.delete_board_post_comments();

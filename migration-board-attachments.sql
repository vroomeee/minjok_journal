-- Board post attachments:
-- 1) Add attachment metadata table
-- 2) Add RLS policies (public read, admin write)
-- 3) Create public storage bucket + storage policies

CREATE TABLE IF NOT EXISTS public.board_post_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  board_post_id UUID NOT NULL REFERENCES public.board_posts(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  content_type TEXT,
  storage_path TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_board_post_attachments_post_id
  ON public.board_post_attachments(board_post_id);

ALTER TABLE public.board_post_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "board_post_attachments_select_public" ON public.board_post_attachments;
CREATE POLICY "board_post_attachments_select_public"
  ON public.board_post_attachments FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "board_post_attachments_admin_insert" ON public.board_post_attachments;
CREATE POLICY "board_post_attachments_admin_insert"
  ON public.board_post_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "board_post_attachments_admin_update" ON public.board_post_attachments;
CREATE POLICY "board_post_attachments_admin_update"
  ON public.board_post_attachments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "board_post_attachments_admin_delete" ON public.board_post_attachments;
CREATE POLICY "board_post_attachments_admin_delete"
  ON public.board_post_attachments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('board-attachments', 'board-attachments', true)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, public = EXCLUDED.public;

DROP POLICY IF EXISTS "board_attachments_select_public" ON storage.objects;
CREATE POLICY "board_attachments_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'board-attachments');

DROP POLICY IF EXISTS "board_attachments_admin_insert" ON storage.objects;
CREATE POLICY "board_attachments_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'board-attachments'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "board_attachments_admin_update" ON storage.objects;
CREATE POLICY "board_attachments_admin_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'board-attachments'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'board-attachments'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "board_attachments_admin_delete" ON storage.objects;
CREATE POLICY "board_attachments_admin_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'board-attachments'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.role_type = 'admin'
    )
  );

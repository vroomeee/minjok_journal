-- Minjok Journal Database Schema for Supabase
-- Execute this in the Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- User roles
  role_type TEXT CHECK (role_type IN ('mentor', 'mentee', 'prof', 'admin')) DEFAULT 'mentee',

  -- Profile info
  email TEXT UNIQUE,
  full_name TEXT,
  intro TEXT,
  avatar_url TEXT
);

-- Articles table
CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  title TEXT NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  status TEXT CHECK (status IN ('draft', 'in_review', 'published')) DEFAULT 'draft',
  current_version_id UUID
);

-- Article versions table
CREATE TABLE IF NOT EXISTS article_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  article_id UUID REFERENCES articles(id) ON DELETE CASCADE NOT NULL,
  version_number INTEGER NOT NULL,
  storage_path TEXT NOT NULL, -- Path in Supabase Storage
  file_name TEXT NOT NULL,
  file_size BIGINT,
  notes TEXT,

  UNIQUE(article_id, version_number)
);

-- Add foreign key for current_version_id after article_versions is created
ALTER TABLE articles
  ADD CONSTRAINT fk_current_version
  FOREIGN KEY (current_version_id)
  REFERENCES article_versions(id) ON DELETE SET NULL;

-- Comments table (for article reviews)
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  article_id UUID REFERENCES articles(id) ON DELETE CASCADE NOT NULL,
  version_id UUID REFERENCES article_versions(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  body TEXT NOT NULL,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE -- For threaded replies
);

-- Board posts table (admin-only posting)
CREATE TABLE IF NOT EXISTS board_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL
);

-- Q&A questions table
CREATE TABLE IF NOT EXISTS qna_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL
);

-- Q&A replies table (mentor-only)
CREATE TABLE IF NOT EXISTS qna_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  question_id UUID REFERENCES qna_questions(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_articles_author ON articles(author_id);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_article_versions_article ON article_versions(article_id);
CREATE INDEX IF NOT EXISTS idx_comments_article ON comments(article_id);
CREATE INDEX IF NOT EXISTS idx_comments_version ON comments(version_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_qna_questions_author ON qna_questions(author_id);
CREATE INDEX IF NOT EXISTS idx_qna_replies_question ON qna_replies(question_id);

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE qna_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE qna_replies ENABLE ROW LEVEL SECURITY;

-- Profiles: Everyone can read, users can update their own
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Articles: Public read, authenticated insert, author/admin can update/delete
CREATE POLICY "Articles are viewable by everyone"
  ON articles FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create articles"
  ON articles FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update their own articles"
  ON articles FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Authors and admins can delete articles"
  ON articles FOR DELETE
  USING (
    auth.uid() = author_id OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );

-- Article versions: Public read, author can insert/update
CREATE POLICY "Article versions are viewable by everyone"
  ON article_versions FOR SELECT
  USING (true);

CREATE POLICY "Authors can create versions for their articles"
  ON article_versions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM articles WHERE id = article_id AND author_id = auth.uid())
  );

-- Comments: Public read, authenticated insert, author can update/delete
CREATE POLICY "Comments are viewable by everyone"
  ON comments FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create comments"
  ON comments FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Comment authors can update their own comments"
  ON comments FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Comment authors can delete their own comments"
  ON comments FOR DELETE
  USING (auth.uid() = author_id);

-- Board posts: Public read, admin-only write
CREATE POLICY "Board posts are viewable by everyone"
  ON board_posts FOR SELECT
  USING (true);

CREATE POLICY "Only admins can create board posts"
  ON board_posts FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );

CREATE POLICY "Only admins can update board posts"
  ON board_posts FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );

CREATE POLICY "Only admins can delete board posts"
  ON board_posts FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'admin')
  );

-- Q&A Questions: Public read, authenticated write
CREATE POLICY "Questions are viewable by everyone"
  ON qna_questions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can ask questions"
  ON qna_questions FOR INSERT
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Question authors can update their own questions"
  ON qna_questions FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Question authors can delete their own questions"
  ON qna_questions FOR DELETE
  USING (auth.uid() = author_id);

-- Q&A Replies: Public read, mentor-only write
CREATE POLICY "Replies are viewable by everyone"
  ON qna_replies FOR SELECT
  USING (true);

CREATE POLICY "Only mentors can create replies"
  ON qna_replies FOR INSERT
  WITH CHECK (
    auth.uid() = author_id AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_type = 'mentor')
  );

CREATE POLICY "Reply authors can update their own replies"
  ON qna_replies FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Reply authors can delete their own replies"
  ON qna_replies FOR DELETE
  USING (auth.uid() = author_id);

-- Function to automatically create a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'email', NEW.email),
      COALESCE(NEW.raw_user_meta_data->>'full_name', '')
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers for tables with updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_board_posts_updated_at BEFORE UPDATE ON board_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qna_questions_updated_at BEFORE UPDATE ON qna_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qna_replies_updated_at BEFORE UPDATE ON qna_replies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Storage bucket for article files
-- Note: Create this in the Supabase Dashboard Storage section or via SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('articles', 'articles', true);

-- Storage policies for articles bucket
-- CREATE POLICY "Anyone can view article files"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'articles');

-- CREATE POLICY "Authenticated users can upload article files"
--   ON storage.objects FOR INSERT
--   WITH CHECK (
--     bucket_id = 'articles' AND
--     auth.role() = 'authenticated'
--   );

-- CREATE POLICY "Users can update their own article files"
--   ON storage.objects FOR UPDATE
--   USING (bucket_id = 'articles' AND auth.uid()::text = (storage.foldername(name))[1]);

-- CREATE POLICY "Users can delete their own article files"
--   ON storage.objects FOR DELETE
--   USING (bucket_id = 'articles' AND auth.uid()::text = (storage.foldername(name))[1]);

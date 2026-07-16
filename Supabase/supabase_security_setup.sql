-- ==========================================

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
-- K. NOTES SECURITY SETUP (HARDENED)
-- Run this in your Supabase SQL Editor
-- ==========================================

-- 1. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- 1b. ENSURE COLUMNS EXIST (Run these to fix "column does not exist" errors)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='is_admin') THEN
    ALTER TABLE public.profiles ADD COLUMN is_admin BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='is_public') THEN
    ALTER TABLE public.profiles ADD COLUMN is_public BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='avatar_url') THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='about') THEN
    ALTER TABLE public.profiles ADD COLUMN about TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='email') THEN
    ALTER TABLE public.profiles ADD COLUMN email TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='created_at') THEN
    ALTER TABLE public.profiles ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='blogs' AND column_name='status') THEN
    ALTER TABLE public.blogs ADD COLUMN status TEXT DEFAULT 'published';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='blogs' AND column_name='published_at') THEN
    ALTER TABLE public.blogs ADD COLUMN published_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='blogs' AND column_name='author_id') THEN
    ALTER TABLE public.blogs ADD COLUMN author_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='user_id') THEN
    ALTER TABLE public.comments ADD COLUMN user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='comments' AND column_name='user_name') THEN
    ALTER TABLE public.comments ADD COLUMN user_name TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='comments' AND column_name='comment_text') THEN
    ALTER TABLE public.comments ADD COLUMN comment_text TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='blogs' AND column_name='likes_count') THEN
    ALTER TABLE public.blogs ADD COLUMN likes_count BIGINT DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='blogs' AND column_name='comments_count') THEN
    ALTER TABLE public.blogs ADD COLUMN comments_count BIGINT DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='blogs' AND column_name='clicks_count') THEN
    ALTER TABLE public.blogs ADD COLUMN clicks_count BIGINT DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='follows' AND column_name='follower_id') THEN
    ALTER TABLE public.follows ADD COLUMN follower_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='follows' AND column_name='following_id') THEN
    ALTER TABLE public.follows ADD COLUMN following_id UUID REFERENCES auth.users(id);
  END IF;

  -- Ensure search_stats table exists if it doesn't. Keep both timestamp columns
  -- because older admin code and newer search code reference different names.
  CREATE TABLE IF NOT EXISTS public.search_stats (
    term TEXT PRIMARY KEY,
    count BIGINT DEFAULT 1,
    last_searched_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
  );

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='search_stats' AND column_name='created_at') THEN
    ALTER TABLE public.search_stats ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='search_stats' AND column_name='last_searched_at') THEN
    ALTER TABLE public.search_stats ADD COLUMN last_searched_at TIMESTAMP WITH TIME ZONE DEFAULT now();
  END IF;
END $$;

ALTER TABLE public.search_stats
  ALTER COLUMN count TYPE BIGINT USING count::BIGINT,
  ALTER COLUMN count SET DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_search_stats_term_unique ON public.search_stats (term);

-- Backfill legacy posts that were created before blogs.author_id existed.
UPDATE public.blogs b
SET author_id = p.id
FROM public.profiles p
WHERE b.author_id IS NULL
  AND b.author = p.username;

CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = check_user_id
      AND is_admin = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 2. ENFORCE DATA INTEGRITY TRIGGERS

-- Prevent non-admins from changing their 'is_admin' status
CREATE OR REPLACE FUNCTION public.handle_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If is_admin is being changed
  IF OLD.is_admin IS DISTINCT FROM NEW.is_admin THEN
    -- Only allow if the executing user is already an admin
    IF NOT public.is_admin(auth.uid()) THEN
      NEW.is_admin := OLD.is_admin;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_profile_update ON public.profiles;
CREATE TRIGGER on_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_update();

-- Create the private profile even when email confirmation delays the first session.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
BEGIN
  base_username := left(COALESCE(NULLIF(regexp_replace(split_part(NEW.email, '@', 1), '[^a-zA-Z0-9]', '', 'g'), ''), 'member'), 27);
  INSERT INTO public.profiles (id, email, username)
  VALUES (NEW.id, NEW.email, lower(base_username) || '-' || left(NEW.id::text, 8))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Automatically set author and reset counts on blog insert
CREATE OR REPLACE FUNCTION public.handle_blog_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(NEW.url, '') <> '' AND NEW.url !~* '^https?://' THEN
    RAISE EXCEPTION 'Only HTTP and HTTPS URLs are allowed';
  END IF;
  SELECT COALESCE(username, auth.uid()::text) INTO NEW.author FROM public.profiles WHERE id = auth.uid();
  NEW.author := COALESCE(NEW.author, auth.uid()::text);
  NEW.author_id := auth.uid();
  NEW.likes_count := 0;
  NEW.comments_count := 0;
  NEW.clicks_count := 0;
  NEW.status := COALESCE(NEW.status, 'published');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_blog_insert ON public.blogs;
CREATE TRIGGER on_blog_insert
  BEFORE INSERT ON public.blogs
  FOR EACH ROW EXECUTE FUNCTION public.handle_blog_insert();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blogs_url_http') THEN
    ALTER TABLE public.blogs ADD CONSTRAINT blogs_url_http
      CHECK (COALESCE(url, '') = '' OR url ~* '^https?://') NOT VALID;
  END IF;
END $$;

-- Automatically set user_id on comment insert
CREATE OR REPLACE FUNCTION public.handle_comment_insert()
RETURNS TRIGGER AS $$
BEGIN
  SELECT COALESCE(username, auth.uid()::text) INTO NEW.user_name FROM public.profiles WHERE id = auth.uid();
  NEW.user_name := COALESCE(NEW.user_name, auth.uid()::text);
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_comment_insert ON public.comments;
CREATE TRIGGER on_comment_insert
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_insert();

-- Prevent users from moving comments to other blogs
CREATE OR REPLACE FUNCTION public.handle_comment_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    NEW.user_id := OLD.user_id;
    NEW.blog_id := OLD.blog_id;
    NEW.user_name := OLD.user_name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_comment_update ON public.comments;
CREATE TRIGGER on_comment_update
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_update();

-- Rate limit blog submissions: max 1 post per 30 seconds per user
CREATE OR REPLACE FUNCTION public.enforce_blog_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  last_post TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT published_at INTO last_post
  FROM public.blogs
  WHERE author_id = auth.uid()
  ORDER BY published_at DESC
  LIMIT 1;

  IF last_post IS NOT NULL AND (now() - last_post) < INTERVAL '30 seconds' THEN
    RAISE EXCEPTION 'Rate limit exceeded. Please wait before submitting again.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_blog_rate_limit ON public.blogs;
CREATE TRIGGER on_blog_rate_limit
  BEFORE INSERT ON public.blogs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_blog_rate_limit();

-- Prevent users from spoofing counters or author_id on update
CREATE OR REPLACE FUNCTION public.handle_blog_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    NEW.author_id := OLD.author_id;
    NEW.likes_count := OLD.likes_count;
    NEW.comments_count := OLD.comments_count;
    NEW.clicks_count := OLD.clicks_count;
    NEW.author := OLD.author;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_blog_update ON public.blogs;
CREATE TRIGGER on_blog_update
  BEFORE UPDATE ON public.blogs
  FOR EACH ROW EXECUTE FUNCTION public.handle_blog_update();


-- 3. PRIVATE PROFILES POLICIES
DROP VIEW IF EXISTS public.public_profiles;
REVOKE ALL ON public.profiles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users and admins can view full profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT TO authenticated USING (
  (select auth.uid()) = id
);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE TO authenticated
USING ((select auth.uid()) = id)
WITH CHECK ((select auth.uid()) = id);

-- A profile can only be deleted by its owner.
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
ON public.profiles FOR DELETE TO authenticated USING ((select auth.uid()) = id);


-- 4. BLOGS (POSTS) POLICIES
DROP POLICY IF EXISTS "Published blogs are viewable by everyone" ON public.blogs;
CREATE POLICY "Published blogs are viewable by everyone" 
ON public.blogs FOR SELECT TO anon, authenticated USING (status = 'published');

DROP POLICY IF EXISTS "Authenticated users can create blogs" ON public.blogs;
CREATE POLICY "Authenticated users can create blogs" 
ON public.blogs FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = author_id);

DROP POLICY IF EXISTS "Users can update their own blogs" ON public.blogs;
CREATE POLICY "Users can update their own blogs"
ON public.blogs FOR UPDATE TO authenticated USING (
  auth.uid() = author_id OR
  public.is_admin(auth.uid())
) WITH CHECK (auth.uid() = author_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own blogs" ON public.blogs;
CREATE POLICY "Users can delete their own blogs" 
ON public.blogs FOR DELETE TO authenticated USING (
  auth.uid() = author_id OR
  public.is_admin(auth.uid())
);


-- 5. COMMENTS POLICIES
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.comments;
CREATE POLICY "Comments are viewable by everyone" 
ON public.comments FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can post comments" ON public.comments;
CREATE POLICY "Authenticated users can post comments" 
ON public.comments FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own comments" ON public.comments;
CREATE POLICY "Users can update their own comments" 
ON public.comments FOR UPDATE TO authenticated USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments;
CREATE POLICY "Users can delete their own comments" 
ON public.comments FOR DELETE TO authenticated USING (
  auth.uid() = user_id OR 
  public.is_admin(auth.uid())
);


-- 6. LIKES, BOOKMARKS, FOLLOWS POLICIES
-- LIKES
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.likes;

DROP POLICY IF EXISTS "Users can manage their own likes" ON public.likes;
CREATE POLICY "Users can manage their own likes" 
ON public.likes FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- BOOKMARKS
DROP POLICY IF EXISTS "Users can view their own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can view their own bookmarks" ON public.bookmarks FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can manage their own bookmarks" 
ON public.bookmarks FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- FOLLOWS (feature disabled; data retained for rollback)
DROP POLICY IF EXISTS "Follows are viewable by everyone" ON public.follows;
DROP POLICY IF EXISTS "Users can manage their own follows" ON public.follows;
REVOKE ALL ON public.follows FROM anon, authenticated;


-- 7. COUNTER PROTECTION (DATABASE FUNCTIONS) - HARDENED WITH AUTH CHECKS

-- Click counter: require authentication
CREATE OR REPLACE FUNCTION increment_blog_clicks(blog_id BIGINT)
RETURNS void AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.blogs
  SET clicks_count = COALESCE(clicks_count, 0) + 1
  WHERE id = blog_id AND status = 'published';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Like and Comment triggers to replace vulnerable RPCs
CREATE OR REPLACE FUNCTION public.handle_like_insert_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.blogs SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = NEW.blog_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.blogs SET likes_count = GREATEST(0, COALESCE(likes_count, 0) - 1) WHERE id = OLD.blog_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_like_insert_delete ON public.likes;
CREATE TRIGGER on_like_insert_delete
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.handle_like_insert_delete();

CREATE OR REPLACE FUNCTION public.handle_comment_insert_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.blogs SET comments_count = COALESCE(comments_count, 0) + 1 WHERE id = NEW.blog_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.blogs SET comments_count = GREATEST(0, COALESCE(comments_count, 0) - 1) WHERE id = OLD.blog_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_comment_insert_delete ON public.comments;
CREATE TRIGGER on_comment_insert_delete
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_insert_delete();

-- Deprecated RPCs (made no-ops to prevent breaking existing client code while fixing the vulnerability)
CREATE OR REPLACE FUNCTION increment_blog_likes(blog_id BIGINT) RETURNS void AS $$ BEGIN RETURN; END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION decrement_blog_likes(blog_id BIGINT) RETURNS void AS $$ BEGIN RETURN; END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION increment_blog_comments(blog_id BIGINT) RETURNS void AS $$ BEGIN RETURN; END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION decrement_blog_comments(blog_id BIGINT) RETURNS void AS $$ BEGIN RETURN; END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 8. STORAGE POLICIES
-- These usually need to be run in the 'storage' schema context or via the dashboard.
-- Below is the SQL equivalent for standard Supabase storage setup.

-- Policy for 'avatars' bucket
-- Note: 'storage.objects' is where file metadata lives.
UPDATE storage.buckets SET public = false WHERE id = 'avatars';

DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own avatar" ON storage.objects;
CREATE POLICY "Users can view their own avatar" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  ) WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy for 'media' bucket
DROP POLICY IF EXISTS "Media is publicly viewable" ON storage.objects;
CREATE POLICY "Media is publicly viewable" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'media');

DROP POLICY IF EXISTS "Users can upload media" ON storage.objects;
CREATE POLICY "Users can upload media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'media' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can manage their media" ON storage.objects;
CREATE POLICY "Users can manage their media" ON storage.objects
  FOR ALL TO authenticated USING (
    bucket_id = 'media' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  ) WITH CHECK (
    bucket_id = 'media' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 9. SEARCH STATS POLICIES (HARDENED: require authentication)
ALTER TABLE public.search_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Search stats are viewable by everyone" ON public.search_stats;
CREATE POLICY "Search stats are viewable by everyone" ON public.search_stats FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anon users can insert search stats" ON public.search_stats;
-- REMOVED: old open policy that allowed anyone to insert

DROP POLICY IF EXISTS "Authenticated users can insert search stats" ON public.search_stats;
DROP POLICY IF EXISTS "Admins can manage search stats" ON public.search_stats;
DROP POLICY IF EXISTS "Admins can insert search stats" ON public.search_stats;
CREATE POLICY "Admins can insert search stats" ON public.search_stats 
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can update search stats" ON public.search_stats;
DROP POLICY IF EXISTS "Admins can update search stats" ON public.search_stats;
CREATE POLICY "Admins can update search stats" ON public.search_stats 
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- PROTECTED RPC FOR SEARCH (now requires auth)
CREATE OR REPLACE FUNCTION increment_search_count(search_term TEXT)
RETURNS void AS $$
BEGIN
  -- Require authentication to prevent spam
  IF auth.uid() IS NULL THEN
    RETURN; -- Silently skip for unauthenticated users
  END IF;

  -- Sanitize: limit term length
  IF length(search_term) > 200 THEN
    RETURN;
  END IF;

  INSERT INTO public.search_stats (term, count, last_searched_at)
  VALUES (search_term, 1, now())
  ON CONFLICT (term)
  DO UPDATE SET
    count = public.search_stats.count + 1,
    last_searched_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Compatibility alias for older pages/admin snippets that still call increment_search_stat.
CREATE OR REPLACE FUNCTION public.increment_search_stat(search_term TEXT)
RETURNS void AS $$
BEGIN
  PERFORM public.increment_search_count(search_term);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Search RPC used by assets/js/search.js. It keeps search parameterized inside SQL,
-- clamps pagination, and returns a total_count column so the current UI does not break.
DROP FUNCTION IF EXISTS public.search_all_content(TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.search_all_content(
  search_query TEXT,
  page_limit INTEGER DEFAULT 10,
  page_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id BIGINT,
  title TEXT,
  slug TEXT,
  url TEXT,
  published_at TIMESTAMP WITH TIME ZONE,
  likes_count BIGINT,
  comments_count BIGINT,
  author TEXT,
  category TEXT,
  content TEXT,
  excerpt TEXT,
  total_count BIGINT
) AS $$
DECLARE
  q TEXT := btrim(COALESCE(search_query, ''));
  safe_limit INTEGER := LEAST(GREATEST(COALESCE(page_limit, 10), 1), 50);
  safe_offset INTEGER := GREATEST(COALESCE(page_offset, 0), 0);
BEGIN
  IF q = '' OR length(q) > 200 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH matched AS (
    SELECT b.*
    FROM public.blogs b
    WHERE b.status = 'published'
      AND (
        b.title ILIKE '%' || q || '%'
        OR b.content ILIKE '%' || q || '%'
        OR b.author ILIKE '%' || q || '%'
        OR b.category ILIKE '%' || q || '%'
        OR b.url ILIKE '%' || q || '%'
      )
  )
  SELECT
    m.id::BIGINT,
    m.title::TEXT,
    m.slug::TEXT,
    m.url::TEXT,
    m.published_at,
    COALESCE(m.likes_count, 0)::BIGINT,
    COALESCE(m.comments_count, 0)::BIGINT,
    m.author::TEXT,
    m.category::TEXT,
    m.content::TEXT,
    CASE
      WHEN m.content IS NULL THEN NULL
      ELSE left(regexp_replace(m.content, '<[^>]+>', '', 'g'), 240)
    END::TEXT AS excerpt,
    count(*) OVER()::BIGINT AS total_count
  FROM matched m
  ORDER BY m.published_at DESC
  LIMIT safe_limit
  OFFSET safe_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- 10. PERFORMANCE INDEXES
-- Speed up homepage loading (trending and new)
CREATE INDEX IF NOT EXISTS idx_blogs_status_likes ON public.blogs (status, likes_count DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_blogs_status_date ON public.blogs (status, published_at DESC) WHERE status = 'published';

-- Speed up category filtering
CREATE INDEX IF NOT EXISTS idx_blogs_category ON public.blogs (category) WHERE status = 'published';

-- Speed up slug lookups for Pulse pages
CREATE INDEX IF NOT EXISTS idx_blogs_slug ON public.blogs (slug);

-- Speed up comment loading
CREATE INDEX IF NOT EXISTS idx_comments_blog_id ON public.comments (blog_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blogs_author_id ON public.blogs (author_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_likes_user_id ON public.likes (user_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments (user_id, created_at DESC);

-- Speed up search stats
CREATE INDEX IF NOT EXISTS idx_search_stats_count ON public.search_stats (count DESC);

-- SECURITY DEFINER functions are private unless the browser genuinely needs the RPC.
REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_profile_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_blog_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_comment_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_comment_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_blog_rate_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_blog_update() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_like_insert_delete() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_comment_insert_delete() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_blog_likes(BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_blog_likes(BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_blog_comments(BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrement_blog_comments(BIGINT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_search_stat(TEXT) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.increment_blog_clicks(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_blog_clicks(BIGINT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_search_count(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_search_count(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.search_all_content(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_all_content(TEXT, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

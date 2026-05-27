-- ==========================================
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='blogs' AND column_name='author_id') THEN
    ALTER TABLE public.blogs ADD COLUMN author_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='user_id') THEN
    ALTER TABLE public.comments ADD COLUMN user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
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

  -- Ensure search_stats table exists if it doesn't
  CREATE TABLE IF NOT EXISTS public.search_stats (
    id BIGSERIAL PRIMARY KEY,
    term TEXT UNIQUE NOT NULL,
    count BIGINT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
  );
END $$;

-- Backfill legacy posts that were created before blogs.author_id existed.
UPDATE public.blogs b
SET author_id = p.id
FROM public.profiles p
WHERE b.author_id IS NULL
  AND b.author = p.username;

-- 2. ENFORCE DATA INTEGRITY TRIGGERS

-- Prevent non-admins from changing their 'is_admin' status
CREATE OR REPLACE FUNCTION public.handle_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If is_admin is being changed
  IF OLD.is_admin IS DISTINCT FROM NEW.is_admin THEN
    -- Only allow if the executing user is already an admin
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
      NEW.is_admin := OLD.is_admin;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_update ON public.profiles;
CREATE TRIGGER on_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_update();

-- Automatically set author and reset counts on blog insert
CREATE OR REPLACE FUNCTION public.handle_blog_insert()
RETURNS TRIGGER AS $$
BEGIN
  SELECT username INTO NEW.author FROM public.profiles WHERE id = auth.uid();
  NEW.author_id := auth.uid();
  NEW.likes_count := 0;
  NEW.comments_count := 0;
  NEW.clicks_count := 0;
  NEW.status := 'published'; -- Force published or 'draft'
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_blog_insert ON public.blogs;
CREATE TRIGGER on_blog_insert
  BEFORE INSERT ON public.blogs
  FOR EACH ROW EXECUTE FUNCTION public.handle_blog_insert();

-- Automatically set user_id on comment insert
CREATE OR REPLACE FUNCTION public.handle_comment_insert()
RETURNS TRIGGER AS $$
BEGIN
  SELECT username INTO NEW.user_name FROM public.profiles WHERE id = auth.uid();
  NEW.user_id := auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_comment_insert ON public.comments;
CREATE TRIGGER on_comment_insert
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_insert();

-- Prevent users from moving comments to other blogs
CREATE OR REPLACE FUNCTION public.handle_comment_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    NEW.user_id := OLD.user_id;
    NEW.blog_id := OLD.blog_id;
    NEW.user_name := OLD.user_name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_blog_rate_limit ON public.blogs;
CREATE TRIGGER on_blog_rate_limit
  BEFORE INSERT ON public.blogs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_blog_rate_limit();

-- Prevent users from spoofing counters or author_id on update
CREATE OR REPLACE FUNCTION public.handle_blog_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    NEW.author_id := OLD.author_id;
    NEW.likes_count := OLD.likes_count;
    NEW.comments_count := OLD.comments_count;
    NEW.clicks_count := OLD.clicks_count;
    NEW.author := OLD.author;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_blog_update ON public.blogs;
CREATE TRIGGER on_blog_update
  BEFORE UPDATE ON public.blogs
  FOR EACH ROW EXECUTE FUNCTION public.handle_blog_update();


-- 3. PROFILES POLICIES
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" 
ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
WITH CHECK (auth.uid() = id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Admins can delete profiles
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles"
ON public.profiles FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);


-- 4. BLOGS (POSTS) POLICIES
DROP POLICY IF EXISTS "Published blogs are viewable by everyone" ON public.blogs;
CREATE POLICY "Published blogs are viewable by everyone" 
ON public.blogs FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS "Authenticated users can create blogs" ON public.blogs;
CREATE POLICY "Authenticated users can create blogs" 
ON public.blogs FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update their own blogs" ON public.blogs;
CREATE POLICY "Users can update their own blogs" 
ON public.blogs FOR UPDATE USING (
  auth.uid() = author_id OR 
  author = (SELECT username FROM public.profiles WHERE id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

DROP POLICY IF EXISTS "Users can delete their own blogs" ON public.blogs;
CREATE POLICY "Users can delete their own blogs" 
ON public.blogs FOR DELETE USING (
  auth.uid() = author_id OR 
  author = (SELECT username FROM public.profiles WHERE id = auth.uid()) OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);


-- 5. COMMENTS POLICIES
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.comments;
CREATE POLICY "Comments are viewable by everyone" 
ON public.comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can post comments" ON public.comments;
CREATE POLICY "Authenticated users can post comments" 
ON public.comments FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update their own comments" ON public.comments;
CREATE POLICY "Users can update their own comments" 
ON public.comments FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments;
CREATE POLICY "Users can delete their own comments" 
ON public.comments FOR DELETE USING (
  auth.uid() = user_id OR 
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);


-- 6. LIKES, BOOKMARKS, FOLLOWS POLICIES
-- LIKES
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.likes;
CREATE POLICY "Likes are viewable by everyone" ON public.likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage their own likes" ON public.likes;
CREATE POLICY "Users can manage their own likes" 
ON public.likes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- BOOKMARKS
DROP POLICY IF EXISTS "Users can view their own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can view their own bookmarks" ON public.bookmarks FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can manage their own bookmarks" 
ON public.bookmarks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- FOLLOWS
DROP POLICY IF EXISTS "Follows are viewable by everyone" ON public.follows;
CREATE POLICY "Follows are viewable by everyone" ON public.follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage their own follows" ON public.follows;
CREATE POLICY "Users can manage their own follows" 
ON public.follows FOR ALL USING (auth.uid() = follower_id) WITH CHECK (auth.uid() = follower_id);


-- 7. COUNTER PROTECTION (DATABASE FUNCTIONS) — HARDENED WITH AUTH CHECKS

-- Click counter: require authentication
CREATE OR REPLACE FUNCTION increment_blog_clicks(blog_id BIGINT)
RETURNS void AS $$
BEGIN
  -- Require authenticated user
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.blogs
  SET clicks_count = COALESCE(clicks_count, 0) + 1
  WHERE id = blog_id AND status = 'published';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_comment_insert_delete ON public.comments;
CREATE TRIGGER on_comment_insert_delete
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_insert_delete();

-- Deprecated RPCs (made no-ops to prevent breaking existing client code while fixing the vulnerability)
CREATE OR REPLACE FUNCTION increment_blog_likes(blog_id BIGINT) RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION decrement_blog_likes(blog_id BIGINT) RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION increment_blog_comments(blog_id BIGINT) RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION decrement_blog_comments(blog_id BIGINT) RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;


-- 8. STORAGE POLICIES
-- These usually need to be run in the 'storage' schema context or via the dashboard.
-- Below is the SQL equivalent for standard Supabase storage setup.

-- Policy for 'avatars' bucket
-- Note: 'storage.objects' is where file metadata lives.
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy for 'media' bucket
DROP POLICY IF EXISTS "Media is publicly viewable" ON storage.objects;
CREATE POLICY "Media is publicly viewable" ON storage.objects
  FOR SELECT USING (bucket_id = 'media');

DROP POLICY IF EXISTS "Users can upload media" ON storage.objects;
CREATE POLICY "Users can upload media" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'media' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can manage their media" ON storage.objects;
CREATE POLICY "Users can manage their media" ON storage.objects
  FOR ALL USING (
    bucket_id = 'media' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 9. SEARCH STATS POLICIES (HARDENED: require authentication)
ALTER TABLE public.search_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Search stats are viewable by everyone" ON public.search_stats;
CREATE POLICY "Search stats are viewable by everyone" ON public.search_stats FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anon users can insert search stats" ON public.search_stats;
-- REMOVED: old open policy that allowed anyone to insert

DROP POLICY IF EXISTS "Authenticated users can insert search stats" ON public.search_stats;
CREATE POLICY "Admins can insert search stats" ON public.search_stats 
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Authenticated users can update search stats" ON public.search_stats;
CREATE POLICY "Admins can update search stats" ON public.search_stats 
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

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

  INSERT INTO public.search_stats (term, count)
  VALUES (search_term, 1)
  ON CONFLICT (term)
  DO UPDATE SET count = public.search_stats.count + 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- Speed up search stats
CREATE INDEX IF NOT EXISTS idx_search_stats_count ON public.search_stats (count DESC);

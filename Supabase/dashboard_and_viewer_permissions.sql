-- Run once in the Supabase SQL editor.
-- Enables dashboard post management, comment deletion/moderation, and
-- reliable viewer bookmarks while keeping every action owner-scoped.

BEGIN;

ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE, DELETE ON public.blogs TO authenticated;
GRANT SELECT, DELETE ON public.comments TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.bookmarks TO authenticated;

DROP POLICY IF EXISTS "Users can update their own blogs" ON public.blogs;
CREATE POLICY "Users can update their own blogs"
ON public.blogs FOR UPDATE TO authenticated
USING (
  author_id = (SELECT auth.uid())
  OR public.is_admin((SELECT auth.uid()))
)
WITH CHECK (
  author_id = (SELECT auth.uid())
  OR public.is_admin((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Users can delete their own blogs" ON public.blogs;
CREATE POLICY "Users can delete their own blogs"
ON public.blogs FOR DELETE TO authenticated
USING (
  author_id = (SELECT auth.uid())
  OR public.is_admin((SELECT auth.uid()))
);

-- A member can delete their own comment. A post author can also moderate
-- comments received on their own post.
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments;
CREATE POLICY "Users can delete their own comments"
ON public.comments FOR DELETE TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.blogs
    WHERE blogs.id = comments.blog_id
      AND blogs.author_id = (SELECT auth.uid())
  )
  OR public.is_admin((SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Users can view their own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can view their own bookmarks"
ON public.bookmarks FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can manage their own bookmarks" ON public.bookmarks;
CREATE POLICY "Users can manage their own bookmarks"
ON public.bookmarks FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

ALTER TABLE public.blogs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

CREATE OR REPLACE FUNCTION public.set_blog_edited_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN
    NEW.updated_at := timezone('utc'::text, now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_blog_editorial_update ON public.blogs;
CREATE TRIGGER on_blog_editorial_update
  BEFORE UPDATE OF title, url, content, category, status ON public.blogs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_blog_edited_at();

REVOKE EXECUTE ON FUNCTION public.set_blog_edited_at() FROM PUBLIC;

COMMIT;

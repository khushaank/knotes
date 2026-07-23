-- Run once in the Supabase SQL editor to track visible post edits.
-- The trigger only reacts to editorial fields, so likes and comment counters
-- never cause a post to be labelled as edited.

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

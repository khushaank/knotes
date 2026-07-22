-- K. Notes least-privilege hardening and hidden-story persistence
-- Run after supabase_security_setup.sql in the Supabase SQL Editor.
-- This script is idempotent. Review in a staging project before production.

BEGIN;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- New public-schema objects are private until explicitly exposed.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Private, per-account hidden-story state.
CREATE TABLE IF NOT EXISTS public.hidden_stories (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blog_id BIGINT NOT NULL REFERENCES public.blogs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blog_id)
);

CREATE INDEX IF NOT EXISTS hidden_stories_user_created_idx
  ON public.hidden_stories (user_id, created_at DESC);

ALTER TABLE public.hidden_stories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hidden_stories FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.hidden_stories TO authenticated;

DROP POLICY IF EXISTS "Users can view their hidden stories" ON public.hidden_stories;
DROP POLICY IF EXISTS "Users can hide stories" ON public.hidden_stories;
DROP POLICY IF EXISTS "Users can restore hidden stories" ON public.hidden_stories;

CREATE POLICY "Users can view their hidden stories"
  ON public.hidden_stories FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can hide stories"
  ON public.hidden_stories FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can restore hidden stories"
  ON public.hidden_stories FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Search terms are operational data, not a public dataset.
ALTER TABLE public.search_stats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.search_stats FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_stats TO authenticated;

DO $policies$
DECLARE policy_name TEXT;
BEGIN
  FOR policy_name IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'search_stats'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.search_stats', policy_name);
  END LOOP;
END
$policies$;

CREATE POLICY "Admins can read search stats"
  ON public.search_stats FOR SELECT TO authenticated
  USING (public.is_admin((SELECT auth.uid())));
CREATE POLICY "Admins can insert search stats"
  ON public.search_stats FOR INSERT TO authenticated
  WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY "Admins can update search stats"
  ON public.search_stats FOR UPDATE TO authenticated
  USING (public.is_admin((SELECT auth.uid())))
  WITH CHECK (public.is_admin((SELECT auth.uid())));
CREATE POLICY "Admins can delete search stats"
  ON public.search_stats FOR DELETE TO authenticated
  USING (public.is_admin((SELECT auth.uid())));

-- The argument is retained for client compatibility, but callers may only
-- check their own account. SECURITY DEFINER is required because profiles are private.
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(check_user_id = (SELECT auth.uid()), false)
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid()) AND is_admin IS TRUE
    );
$$;

-- Revoke every exposed SECURITY DEFINER function, including trigger helpers,
-- then explicitly expose only the small RPC surface used by the browser.
DO $functions$
DECLARE fn REGPROCEDURE;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END
$functions$;

GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_all_content(TEXT, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_blog_clicks(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_search_count(TEXT) TO authenticated;

-- Profiles and follow graphs remain private. The old public_profiles view may
-- exist in installations that ran rollback_private_profiles.sql.
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.follows FROM PUBLIC, anon, authenticated;
DO $views$
BEGIN
  IF to_regclass('public.public_profiles') IS NOT NULL THEN
    REVOKE ALL ON public.public_profiles FROM PUBLIC, anon, authenticated;
  END IF;
END
$views$;

-- Leading-wildcard ILIKE search is accelerated by trigram indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS blogs_title_trgm_idx
  ON public.blogs USING gin (lower(title) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS blogs_content_trgm_idx
  ON public.blogs USING gin (lower(COALESCE(content, '')) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS blogs_author_trgm_idx
  ON public.blogs USING gin (lower(COALESCE(author, '')) extensions.gin_trgm_ops);

COMMIT;

-- Verification queries (run separately after commit):
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' AND tablename IN ('hidden_stories', 'search_stats');
-- SELECT grantee, privilege_type FROM information_schema.routine_privileges
-- WHERE specific_schema = 'public' ORDER BY routine_name, grantee;
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND table_name IN ('hidden_stories', 'search_stats');

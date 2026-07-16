-- Reopens the previous public-profile, avatar, leaderboard, and follow data access.
-- This rolls back the SQL only; restore the removed UI files separately if wanted.
BEGIN;

DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.likes;
CREATE POLICY "Likes are viewable by everyone"
ON public.likes FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;

CREATE POLICY "Users and admins can view full profiles"
ON public.profiles FOR SELECT TO authenticated
USING ((select auth.uid()) = id OR public.is_admin((select auth.uid())));

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING ((select auth.uid()) = id OR public.is_admin((select auth.uid())))
WITH CHECK ((select auth.uid()) = id OR public.is_admin((select auth.uid())));

CREATE POLICY "Admins can delete profiles"
ON public.profiles FOR DELETE TO authenticated
USING (public.is_admin((select auth.uid())));

CREATE VIEW public.public_profiles AS
SELECT id, username, avatar_url, about, created_at, is_public
FROM public.profiles
WHERE is_public = true;
GRANT SELECT ON public.public_profiles TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.follows TO authenticated;
GRANT SELECT ON public.follows TO anon;
CREATE POLICY "Follows are viewable by everyone"
ON public.follows FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users can manage their own follows"
ON public.follows FOR ALL TO authenticated
USING ((select auth.uid()) = follower_id)
WITH CHECK ((select auth.uid()) = follower_id);

UPDATE storage.buckets SET public = true WHERE id = 'avatars';
DROP POLICY IF EXISTS "Users can view their own avatar" ON storage.objects;
CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'avatars');

COMMIT;

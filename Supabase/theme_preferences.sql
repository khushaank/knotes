-- Run once in the Supabase SQL editor. Existing users default to their device.
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme_preference text NOT NULL DEFAULT 'system';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_theme_preference_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_theme_preference_check
  CHECK (theme_preference IN ('system', 'light', 'dark'));

COMMIT;

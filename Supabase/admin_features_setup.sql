-- Table for global settings
CREATE TABLE IF NOT EXISTS public.site_settings (
    id TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_by UUID REFERENCES auth.users(id)
);

-- Insert default settings if not exists
INSERT INTO public.site_settings (id, value) VALUES ('broadcast_message', '') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.site_settings (id, value) VALUES ('maintenance_mode', 'false') ON CONFLICT (id) DO NOTHING;
DELETE FROM public.site_settings WHERE id = 'admin_password';

-- Enable RLS
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = check_user_id
      AND is_admin = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Search Stats Table
CREATE TABLE IF NOT EXISTS public.search_stats (
    term TEXT PRIMARY KEY,
    count BIGINT DEFAULT 1,
    last_searched_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.search_stats
    ADD COLUMN IF NOT EXISTS last_searched_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.search_stats
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL;

ALTER TABLE public.search_stats
    ALTER COLUMN count TYPE BIGINT USING count::BIGINT,
    ALTER COLUMN count SET DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_search_stats_term_unique ON public.search_stats (term);

ALTER TABLE public.search_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Search stats are viewable by everyone" ON public.search_stats;
CREATE POLICY "Search stats are viewable by everyone" ON public.search_stats FOR SELECT USING (true);
DROP POLICY IF EXISTS "Anon users can insert search stats" ON public.search_stats;
DROP POLICY IF EXISTS "Authenticated users can insert search stats" ON public.search_stats;
DROP POLICY IF EXISTS "Authenticated users can update search stats" ON public.search_stats;
DROP POLICY IF EXISTS "Admins can manage search stats" ON public.search_stats;
DROP POLICY IF EXISTS "Admins can insert search stats" ON public.search_stats;
DROP POLICY IF EXISTS "Admins can update search stats" ON public.search_stats;
CREATE POLICY "Admins can manage search stats" ON public.search_stats
FOR ALL USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- RPC to increment search stats
CREATE OR REPLACE FUNCTION public.increment_search_stat(search_term TEXT)
RETURNS void AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN;
    END IF;

    IF length(search_term) > 200 THEN
        RETURN;
    END IF;

    INSERT INTO public.search_stats (term, count, last_searched_at)
    VALUES (search_term, 1, now())
    ON CONFLICT (term) DO UPDATE
    SET count = search_stats.count + 1,
        last_searched_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.increment_search_count(search_term TEXT)
RETURNS void AS $$
BEGIN
    PERFORM public.increment_search_stat(search_term);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Policies
DROP POLICY IF EXISTS "Site settings are viewable by everyone" ON public.site_settings;
DROP POLICY IF EXISTS "Safe site settings are viewable by everyone" ON public.site_settings;
CREATE POLICY "Safe site settings are viewable by everyone" ON public.site_settings
FOR SELECT USING (id IN ('broadcast_message', 'maintenance_mode'));

DROP POLICY IF EXISTS "Only admins can update site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Only admins can manage site settings" ON public.site_settings;
CREATE POLICY "Only admins can update site settings" ON public.site_settings FOR ALL USING (
    public.is_admin(auth.uid())
) WITH CHECK (
    id <> 'admin_password'
    AND public.is_admin(auth.uid())
);

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

-- Enable RLS
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Search Stats Table
CREATE TABLE IF NOT EXISTS public.search_stats (
    term TEXT PRIMARY KEY,
    count INTEGER DEFAULT 1,
    last_searched_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.search_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Search stats are viewable by everyone" ON public.search_stats;
CREATE POLICY "Search stats are viewable by everyone" ON public.search_stats FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage search stats" ON public.search_stats;
CREATE POLICY "Admins can manage search stats" ON public.search_stats FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- RPC to increment search stats
CREATE OR REPLACE FUNCTION public.increment_search_stat(search_term TEXT)
RETURNS void AS $$
BEGIN
    INSERT INTO public.search_stats (term, count, last_searched_at)
    VALUES (search_term, 1, now())
    ON CONFLICT (term) DO UPDATE
    SET count = search_stats.count + 1,
        last_searched_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policies
DROP POLICY IF EXISTS "Site settings are viewable by everyone" ON public.site_settings;
CREATE POLICY "Site settings are viewable by everyone" ON public.site_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Only admins can update site settings" ON public.site_settings;
CREATE POLICY "Only admins can update site settings" ON public.site_settings FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

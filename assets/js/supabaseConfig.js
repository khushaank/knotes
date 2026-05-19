let localEnv = {};

try {
    const response = await fetch('/env.json');
    if (response.ok) {
        localEnv = await response.json();
    }
} catch (e) {
}

export const SUPABASE_URL = localEnv.SUPABASE_URL || window.process?.env?.SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = localEnv.SUPABASE_ANON_KEY || window.process?.env?.SUPABASE_ANON_KEY || '';
export const DEFAULT_ADMIN_PASSWORD = localEnv.DEFAULT_ADMIN_PASSWORD || window.process?.env?.DEFAULT_ADMIN_PASSWORD || '';

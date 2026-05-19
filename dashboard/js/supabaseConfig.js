function getProjectRoot() {
    const loc = window.location.pathname;
    const subfolders = ['/admin/', '/dashboard/', '/pulse/'];
    for (const folder of subfolders) {
        const idx = loc.indexOf(folder);
        if (idx !== -1) {
            return loc.substring(0, idx) + '/';
        }
    }
    const lastSlash = loc.lastIndexOf('/');
    return loc.substring(0, lastSlash + 1);
}

let localEnv = {};

try {
    const response = await fetch(getProjectRoot() + 'env.json');
    if (response.ok) {
        localEnv = await response.json();
    }
} catch (e) {
}

export const SUPABASE_URL = localEnv.SUPABASE_URL || window.process?.env?.SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = localEnv.SUPABASE_ANON_KEY || window.process?.env?.SUPABASE_ANON_KEY || '';
export const DEFAULT_ADMIN_PASSWORD = localEnv.DEFAULT_ADMIN_PASSWORD || window.process?.env?.DEFAULT_ADMIN_PASSWORD || '';

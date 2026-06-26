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

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === '::1';

try {
    const configFiles = isLocal ? ['runtime-config.json', 'env.json'] : ['runtime-config.json'];
    for (const configFile of configFiles) {
        const response = await fetch(getProjectRoot() + configFile, { cache: 'no-store' });
        if (response.ok) {
            localEnv = await response.json();
            break;
        }
    }
} catch (e) {
}

const runtimeConfig = window.KNOTES_CONFIG || {};

export const SUPABASE_URL = localEnv.SUPABASE_URL || runtimeConfig.SUPABASE_URL || window.process?.env?.SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = localEnv.SUPABASE_ANON_KEY || runtimeConfig.SUPABASE_ANON_KEY || window.process?.env?.SUPABASE_ANON_KEY || '';

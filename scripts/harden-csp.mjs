import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const csp = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cloudflareinsights.com; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; form-action 'self'; upgrade-insecure-requests;";

async function htmlFiles(directory) {
    const results = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (['node_modules', '.git'].includes(entry.name)) continue;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) results.push(...await htmlFiles(path));
        else if (entry.name.endsWith('.html')) results.push(path);
    }
    return results;
}

for (const path of await htmlFiles(root)) {
    const source = await readFile(path, 'utf8');
    const hardened = source
        .replace(/content="default-src 'self'; base-uri 'self'; object-src 'none'; script-src[^"]+"/g, `content="${csp}"`)
        .replace(/\s*<link rel="preconnect" href="https:\/\/cdn\.jsdelivr\.net" crossorigin\s*\/?>/g, '');
    if (hardened !== source) await writeFile(path, hardened);
}

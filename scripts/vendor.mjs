import { copyFile, mkdir } from 'node:fs/promises';

await mkdir(new URL('../assets/vendor/', import.meta.url), { recursive: true });
await Promise.all([
    ['@supabase/supabase-js/dist/umd/supabase.js', 'supabase.js'],
    ['chart.js/dist/chart.umd.js', 'chart.umd.js'],
    ['dompurify/dist/purify.min.js', 'purify.min.js'],
    ['marked/lib/marked.umd.js', 'marked.umd.js']
].map(async ([source, target]) => {
    await copyFile(
        new URL(`../node_modules/${source}`, import.meta.url),
        new URL(`../assets/vendor/${target}`, import.meta.url)
    );
}));

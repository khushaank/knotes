import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const config = {
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ''
};

const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

if (missing.length > 0) {
    throw new Error(`Missing required deploy environment variables: ${missing.join(', ')}`);
}

await writeFile(
    join(rootDir, 'runtime-config.json'),
    `${JSON.stringify(config, null, 2)}\n`,
    'utf8'
);

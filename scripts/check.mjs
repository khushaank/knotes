import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const failures = [];
const sourceFiles = [];

async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory()) await walk(fullPath);
        else if (['.html', '.js', '.sql'].includes(extname(entry.name))) sourceFiles.push(fullPath);
    }
}

await walk(rootPath);

for (const file of sourceFiles) {
    const source = await readFile(file, 'utf8');
    const name = relative(rootPath, file).replaceAll('\\', '/');

    if (/cdn\.jsdelivr\.net\/npm\/(?:dompurify|marked|chart\.js)(?:\/|["'])/i.test(source)) {
        failures.push(`${name}: unpinned CDN dependency`);
    }
    if (!name.startsWith('assets/vendor/') && /DOMPurify[^\n]+\?[^\n]+:[^\n]+\.value/.test(source)) {
        failures.push(`${name}: unsafe raw-HTML sanitizer fallback`);
    }
    if (extname(file) === '.js' && !file.endsWith('check.mjs')) {
        const syntax = spawnSync(process.execPath, [
            '--experimental-vm-modules',
            '-e',
            "new (require('node:vm').SourceTextModule)(require('node:fs').readFileSync(process.argv[1], 'utf8'))",
            file
        ], { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } });
        if (syntax.status !== 0) failures.push(`${name}: ${syntax.stderr.trim()}`);
    }
}

if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
} else {
    console.log(`Static checks passed (${sourceFiles.length} source files).`);
}

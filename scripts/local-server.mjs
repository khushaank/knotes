import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { cwd } from 'node:process';

const root = cwd();
const port = Number(process.env.PORT || 3000);

const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function resolveRoute(pathname) {
    if (pathname === '/' || pathname === '/home') return '/index.html';
    if (pathname === '/admin/home') return '/admin/index.html';
    if (pathname === '/dashboard' || pathname === '/dashboard/' || pathname === '/dashboard/home') return '/dashboard/index.html';
    if (pathname === '/pulse/home') return '/pulse/index.html';
    if (!extname(pathname)) return `${pathname}.html`;
    return pathname;
}

createServer(async (req, res) => {
    try {
        const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
        const pathname = resolveRoute(decodeURIComponent(url.pathname));
        const filePath = normalize(join(root, pathname));

        if (!filePath.startsWith(root)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Forbidden');
            return;
        }

        const body = await readFile(filePath);
        res.writeHead(200, {
            'Content-Type': contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream'
        });
        res.end(body);
    } catch {
        const body = await readFile(join(root, '404.html')).catch(() => 'Not found');
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(body);
    }
}).listen(port, '127.0.0.1');

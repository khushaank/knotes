import { mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

const routes = ['home', 'chess', 'cube-lab', 'creator-room', 'minecraft', 'about', 'dashboard'];
const distDir = 'dist';
const indexFile = join(distDir, 'index.html');

for (const route of routes) {
    const routeDir = join(distDir, route);
    await mkdir(routeDir, { recursive: true });
    await copyFile(indexFile, join(routeDir, 'index.html'));
}

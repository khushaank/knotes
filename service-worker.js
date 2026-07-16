const CACHE = 'knotes-v3';
const SHELL = ['/home', '/assets/css/styles.css', '/assets/img/logo.png'];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(SHELL.map(url => cache.add(url)))));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin || /(?:runtime-config|env)\.json$/.test(url.pathname)) return;

    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).then(response => {
            const copy = response.clone();
            if (!response.headers.get('Cache-Control')?.includes('no-store')) {
                caches.open(CACHE).then(cache => cache.put(request, copy));
            }
            return response;
        }).catch(() => caches.match(request).then(response => response || caches.match('/home'))));
        return;
    }

    event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
        const copy = response.ok ? response.clone() : null;
        if (copy) caches.open(CACHE).then(cache => cache.put(request, copy));
        return response;
    })));
});

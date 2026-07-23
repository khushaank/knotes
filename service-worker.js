const CACHE = 'knotes-v14';
const SHELL = ['/home', '/assets/css/styles.css', '/assets/img/logo.png'];
const PUBLIC_PAGES = new Set([
    '/', '/home', '/ask', '/show', '/contact', '/faq',
    '/guidelines', '/legal', '/security', '/search', '/profile'
]);
const STATIC_ASSET = /^\/assets\/(?:css|img|js)\/[^?]+\.(?:css|js|png|jpg|jpeg|gif|webp|svg|ico)$/i;

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => Promise.allSettled(SHELL.map(url => cache.add(url)))));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)));

        // Dashboard markup is authenticated and changes frequently. Keeping it
        // out of the navigation cache prevents GitHub Pages deploys from
        // looking "stuck" after a successful publish.
        const cache = await caches.open(CACHE);
        await Promise.allSettled([
            cache.delete('/dashboard'),
            cache.delete('/dashboard/'),
            cache.delete('/dashboard/home')
        ]);
    })());
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin || /(?:runtime-config|env)\.json$/.test(url.pathname)) return;

    if (request.mode === 'navigate') {
        if (url.pathname.startsWith('/dashboard')) {
            event.respondWith(fetch(request).catch(() => caches.match('/home')));
            return;
        }

        event.respondWith(fetch(request).then(response => {
            if (response.ok && PUBLIC_PAGES.has(url.pathname) && !url.search) {
                const copy = response.clone();
                event.waitUntil(caches.open(CACHE).then(cache => cache.put(url.pathname, copy)));
            }
            return response;
        }).catch(() => {
            if (!PUBLIC_PAGES.has(url.pathname)) return caches.match('/home');
            return caches.match(url.pathname).then(response => response || caches.match('/home'));
        }));
        return;
    }

    if (!STATIC_ASSET.test(url.pathname)) return;

    if (/\.(?:css|js)$/i.test(url.pathname)) {
        // Do not let a stale stylesheet keep an old header layout after deploy.
        event.respondWith(fetch(request).then(response => {
            if (response.ok) {
                const copy = response.clone();
                event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
            }
            return response;
        }).catch(() => caches.match(request)));
        return;
    }

    event.respondWith(caches.match(request, { ignoreSearch: false }).then(cached => cached || fetch(request).then(response => {
        if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
        }
        return response;
    })));
});

const CACHE_NAME = 'knotes-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/about.html',
  '/comments.html',
  '/ask.html',
  '/show.html',
  '/submit.html',
  '/leaderboard.html',
  '/offline.html',
  '/assets/css/styles.css',
  '/assets/img/logo.png',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
  } else {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
  }
});

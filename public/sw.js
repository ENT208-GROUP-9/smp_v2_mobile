const CACHE_NAME = 'campus-os-mobile-v1';
const BASE_PATH = self.location.pathname.replace(/\/sw\.js$/, '') || '';
const withBase = (path) => `${BASE_PATH}${path}`;
const APP_ASSETS = [withBase('/'), withBase('/manifest.webmanifest'), withBase('/favicon.svg'), withBase('/icons.svg')];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match(withBase('/')));
    }),
  );
});

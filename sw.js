// sw.js - Service Worker for Barve Guruji AI

const CACHE_NAME = 'barve-guruji-cache-v2';
const APP_SHELL = [
  '/',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg'
  // Note: PNG icons generated via tools are not cached here by default
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  // Activate new SW immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Do not cache or intercept Gemini API calls
  if (url.hostname.includes('generativelanguage.googleapis.com')) {
    return;
  }
  // Same-origin requests: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return (
          cached ||
          fetch(request).then((response) => {
            // Clone and store in cache
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
        );
      })
    );
    return;
  }
  // For other requests (fonts, Tailwind, Google Fonts) use network-first
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Save a clone to cache
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});


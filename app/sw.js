const CACHE_NAME = "campus-waste-guide-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./retrieve.js",
  "./ai.js",
  "./render.js",
  "./manifest.webmanifest",
  "./hku-sources.json",
  "./contacts.json",
  "./corpus/index.json",
  "./icons/recycle.svg",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Stale-while-revalidate: the app opens instantly from cache and the next load
// picks up a fresh build. Plain cache-first kept serving old code after a
// deploy, which is exactly how a demo ends up showing the previous version.
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then(response => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

const CACHE = "icegram-shell-v2";
const SHELL = ["/", "/manifest.json", "/icegram-icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || request.url.includes("/api/")) return;

  const url = new URL(request.url);
  const networkFirst = request.mode === "navigate" ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname === "/manifest.json";

  event.respondWith(
    (networkFirst
      ? fetch(request).then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
          return response;
        }).catch(() => caches.match(request).then(cached => cached || caches.match("/")))
      : caches.match(request).then(cached => cached || fetch(request).then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
          return response;
        }).catch(() => caches.match("/")))
    )
  );
});

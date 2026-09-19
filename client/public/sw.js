const CACHE = "icegram-shell-v1";
const SHELL = ["/", "/manifest.json", "/icegram-icon.svg"];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", event => { const request = event.request; if (request.method !== "GET" || request.url.includes("/api/")) return; event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)); return response; }).catch(() => caches.match("/")))); });

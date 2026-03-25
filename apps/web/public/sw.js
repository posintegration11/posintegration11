/* Minimal service worker so the app is installable (Chrome / Edge "Install app"). */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** Required for installability; keep network-first so the POS always hits the live API. */
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request).catch(() => new Response("Offline", { status: 503, statusText: "Offline" }))
  );
});

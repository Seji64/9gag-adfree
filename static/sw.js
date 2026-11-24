// PWA-Shell: Navigation network-first, offline = letzte Shell.
// API + Medien bleiben immer live (nur mode:navigate wird abgefangen).
const C = 'gag-shell-v1';
self.addEventListener('install', (e) =>
  e.waitUntil(caches.open(C).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png']))));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match('/')));
});

// Service worker mínimo — necesario para que Chrome/Android permita instalar TallerYa
// como app ("Agregar a pantalla de inicio"). No hace caché agresivo, solo pasa las
// peticiones a la red normalmente.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

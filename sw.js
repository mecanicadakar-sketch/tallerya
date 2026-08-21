/**
 * Service Worker — TallerYa PWA
 * Gestiona la instalación, caché inteligente de recursos estáticos y soporte offline.
 */

const CACHE_NAME = 'tallerya-pwa-v1.3.0';

// Recursos esenciales que se pre-cargan en la instalación
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/site.webmanifest',
  '/favicon.ico',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/favicon-48x48.png',
  '/apple-touch-icon.png',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png',
  '/LogoTallerYa.png',
  '/logoventas.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap'
];

// Instalación: Precarga recursos estáticos y activa de inmediato
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Intentamos cachear cada recurso individualmente para que uno faltante no impida la instalación
      return Promise.allSettled(
        STATIC_ASSETS.map((url) =>
          fetch(url, { mode: 'cors' })
            .then((response) => {
              if (response.ok) {
                return cache.put(url, response);
              }
            })
            .catch((err) => {
              console.warn('[SW] No se pudo pre-cachear:', url, err.message);
            })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activación: Limpia versiones antiguas de caché
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('tallerya-') && name !== CACHE_NAME)
          .map((oldName) => {
            console.log('[SW] Eliminando caché antigua:', oldName);
            return caches.delete(oldName);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Estrategia de Fetch:
// 1. API (/api/*) -> Network First (para datos siempre actualizados)
// 2. Navegación (HTML) -> Network First con fallback a index.html en caché
// 3. Estáticos (Imágenes, Fuentes, CSS, JS) -> Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorar peticiones no GET o de esquemas no HTTP/HTTPS (ej. chrome-extension)
  if (req.method !== 'GET' || !req.url.startsWith('http')) {
    return;
  }

  // 1. Peticiones a la API: Red primero (Network First)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then((response) => response)
        .catch(() => {
          // Si no hay red, intenta servir de caché si existiera
          return caches.match(req).then((cached) => {
            if (cached) return cached;
            return new Response(
              JSON.stringify({ error: 'Sin conexión a internet', offline: true }),
              { headers: { 'Content-Type': 'application/json' }, status: 503 }
            );
          });
        })
    );
    return;
  }

  // 2. Solicitudes de Navegación de páginas (HTML SPA)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes.ok) {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return networkRes;
        })
        .catch(async () => {
          const cachedIndex = await caches.match('/index.html');
          if (cachedIndex) return cachedIndex;
          const cachedRoot = await caches.match('/');
          if (cachedRoot) return cachedRoot;
          return new Response(
            '<h1>TallerYa</h1><p>Estás en modo sin conexión. Reconéctate a internet para ver datos en vivo.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // 3. Recursos Estáticos: Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(req, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// Comunicación con clientes (ej. forzar actualización inmediata)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

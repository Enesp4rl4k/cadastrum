/**
 * Cadastrum PWA Service Worker — Faz 5 Sprint K.
 *
 * Strateji:
 *   - App shell precache: kritik statik dosyalar install-time'da cache'lenir
 *   - Sayfa istekleri: network-first, fallback cache (offline page)
 *   - API istekleri (api.cadastrum.com.tr): stale-while-revalidate (~5dk fresh)
 *   - Statik asset'ler: cache-first
 *
 * Workbox kullanılmadı — basit yerel implementasyon, ek dependency yok.
 */

const VERSION = "cadastrum-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const API_CACHE = `${VERSION}-api`;

const PRECACHE = [
  "/",
  "/sorgu",
  "/fiyat",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // API çağrıları — stale-while-revalidate
  if (url.hostname === "api.cadastrum.com.tr") {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Aynı domain — sayfalar için network-first
  if (url.origin === self.location.origin) {
    // Statik asset uzantıları → cache-first
    if (/\.(?:png|jpg|jpeg|svg|webp|woff2?|ico|css|js)$/.test(url.pathname)) {
      event.respondWith(cacheFirst(req));
      return;
    }
    // HTML / sayfa istekleri → network-first
    event.respondWith(networkFirst(req));
  }
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return cached || new Response("Offline", { status: 503 });
  }
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    if (cached) return cached;
    // Offline fallback — basit HTML
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>Çevrimdışı</title>
       <body style="font-family:sans-serif;padding:2rem;text-align:center">
         <h1>📡 Bağlantı yok</h1>
         <p>İnternet bağlantın yok. Tekrar dene.</p>
         <button onclick="location.reload()" style="padding:.5rem 1rem">Yeniden dene</button>
       </body>`,
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

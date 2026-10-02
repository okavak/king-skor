// sw.js — uygulama kabuğunu önbelleğe alır; önbellek-önce, arka planda yenile.
const VERSION = '2026.10.02-2101';
const CACHE = `king-skor-${VERSION}`;
const ASSETS = [
  './', './index.html', './app.css', './app.js', './rules.js', './store.js', './version.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './icons/maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
];

self.addEventListener('install', event => {
  // cache: 'reload' → HTTP önbelleğini atla; yeni sürüm her zaman taze dosyalarla kurulur.
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('king-skor-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // Önbellek-önce: kabuk dosyaları sürümlü önbellekten gelir; eksikse ağa gidilir.
  // Çalışma zamanında önbelleğe yazılmaz; böylece tek önbellekte karışık sürüm oluşmaz.
  event.respondWith(caches.match(request, { ignoreSearch: true }).then(cached => cached || fetch(request)));
});

// sw.js — uygulama kabuğunu kurulumda önbelleğe alır; önbellek-önce. Çalışma zamanında önbelleğe yazılmaz.
const VERSION = '2026.11.03-2002';
const CACHE = `king-skor-${VERSION}`;
// Açılışta yüklenen her yerel dosya burada olmalı; eksik modül internetsiz açılışı boş ekranda bırakır.
// tests/sw.test.js import zincirini tarayıp bu listeyi denetler (deploy.sh testleri yayından önce çalıştırır).
const ASSETS = [
  './', './index.html', './app.css', './app.js', './rules.js', './store.js', './roster.js', './names.js', './analysis.js', './groupcode.js', './group.js', './config.js', './version.js',
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

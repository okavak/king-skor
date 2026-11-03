import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = url => readFileSync(url, 'utf8');
// Dosya URL'sini './a/b.js' biçimine indirger; sw.js ASSETS girdileriyle birebir karşılaştırılır.
const rel = url => './' + decodeURIComponent(url.pathname.slice(root.pathname.length));

// sw.js'yi tarayıcı dışında çalıştırıp gerçek ASSETS dizisini alır; olay dinleyicileri yalnızca kaydedilir.
function precacheList() {
  const sandbox = { self: { addEventListener() {}, location: { origin: 'http://localhost' } } };
  return [...vm.runInNewContext(`${read(new URL('sw.js', root))}\n;ASSETS`, sandbox)];
}

const STATIC_IMPORT = /^\s*(?:import|export)\b[^'"`;]*?['"](\.{1,2}\/[^'"]+)['"]/gm;
const DYNAMIC_IMPORT = /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

function moduleGraph(entries) {
  const seen = new Set();
  const visit = url => {
    if (seen.has(rel(url))) return;
    seen.add(rel(url));
    const src = read(url);
    for (const re of [STATIC_IMPORT, DYNAMIC_IMPORT]) {
      for (const [, spec] of src.matchAll(re)) visit(new URL(spec, url));
    }
  };
  entries.forEach(visit);
  return seen;
}

// Açılışta tarayıcının istediği yerel dosyalar: sayfa, index.html bağlantıları, modül zinciri, manifest.
function startupFiles() {
  const page = new URL('index.html', root);
  const html = read(page);
  const refs = [...html.matchAll(/\b(?:src|href)="(\.{1,2}\/[^"#?]+)"/g)].map(m => new URL(m[1], page));
  const files = new Set(['./', './index.html', ...refs.map(rel)]);
  for (const m of moduleGraph(refs.filter(u => u.pathname.endsWith('.js')))) files.add(m);
  const manifestUrl = new URL(html.match(/<link rel="manifest" href="([^"]+)"/)[1], page);
  const manifest = JSON.parse(read(manifestUrl));
  files.add(rel(new URL(manifest.start_url, manifestUrl)));
  for (const icon of manifest.icons) files.add(rel(new URL(icon.src, manifestUrl)));
  return files;
}

test('service worker precaches every local file the app loads at startup', () => {
  // Eksik dosya internetsiz açılışta ağdan istenir ve düşer; modülse app.js hiç çalışmaz → boş ekran.
  // Elle denemek yanıltır: GitHub Pages dosyaları 10 dk HTTP önbelleğinde tutar, hata ancak sonra görünür.
  const cached = new Set(precacheList());
  const missing = [...startupFiles()].filter(f => !cached.has(f)).sort();
  assert.deepEqual(missing, [], `missing from sw.js ASSETS: ${missing.join(', ')}`);
});

test('every precached path exists, so the service worker install cannot fail', () => {
  // cache.addAll tek bir 404'te bütünüyle reddedilir; SW hiç kurulmaz ve çevrimdışı çalışma tamamen kaybolur.
  const absent = precacheList().filter(p => !existsSync(new URL(p, root))).sort();
  assert.deepEqual(absent, [], `listed in sw.js ASSETS but not on disk: ${absent.join(', ')}`);
});

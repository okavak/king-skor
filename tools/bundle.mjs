// tools/bundle.mjs — index.html + app.css + modülleri tek HTML dosyasında toplar (artifact önizlemesi için).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = f => readFileSync(new URL(f, root), 'utf8');
const strip = src => src
  .replace(/^import\s[\s\S]*?from\s+'[^']+';\s*$/gm, '')
  .replace(/^export\s+(const|function|let|class)\s/gm, '$1 ')
  .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');

const files = ['version.js', 'rules.js', 'store.js', 'app.js'];
const seen = new Map();
for (const f of files) {
  for (const m of strip(read(f)).matchAll(/^(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    if (seen.has(m[1])) throw new Error(`Çakışan üst düzey ad: ${m[1]} (${seen.get(m[1])} ve ${f}); birini yeniden adlandırın`);
    seen.set(m[1], f);
  }
}

let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="./app.css">', `<style>\n${read('app.css')}\n</style>`);
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '');
html = html.replace(/<link rel="(apple-touch-icon|icon)"[^>]*>\n?/g, '');
const js = files.map(f => `// ---- ${f}\n${strip(read(f))}`).join('\n');
if (js.includes('</script')) throw new Error('JS içinde </script> var; paket bozulur');
html = html.replace('<script type="module" src="./app.js"></script>', `<script>window.__KING_BUNDLE__ = true;</script>\n<script type="module">\n${js}\n</script>`);
mkdirSync(new URL('dist/', root), { recursive: true });
writeFileSync(new URL('dist/king-skor.html', root), html);
// Artifact sürümü: yayın iskeleti doctype/html/head/body ve viewport'u kendisi ekler.
const fragment = html
  .replace(/<!doctype html>\n?/i, '')
  .replace(/<\/?(html|head|body)[^>]*>\n?/g, '')
  .replace(/<meta charset="utf-8">\n?/, '')
  .replace(/<meta name="viewport"[^>]*>\n?/, '');
writeFileSync(new URL('dist/king-skor.artifact.html', root), fragment);
console.log(`dist/king-skor.html yazıldı (${html.length} bayt), dist/king-skor.artifact.html (${fragment.length} bayt)`);

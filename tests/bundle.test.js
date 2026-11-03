import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Tek dosyalık önizleme: modüller tek betikte birleşir. Kod içindeki "$`" gibi dizgiler String.replace'te özel desen
// sayılırsa sayfanın parçaları betiğin ortasına kopyalanır ve önizleme hiç açılmaz.
test('single-file preview bundle compiles and contains the page exactly once', () => {
  execFileSync(process.execPath, ['tools/bundle.mjs'], { cwd: new URL('..', import.meta.url), stdio: 'pipe' });
  const html = readFileSync(new URL('../dist/king-skor.html', import.meta.url), 'utf8');
  assert.equal(html.match(/<!doctype html>/gi).length, 1);
  const js = html.split('<script type="module">\n')[1].split('</script>')[0];
  assert.doesNotThrow(() => new vm.Script(js), 'bundled script must parse');
  for (const name of ['nameKeyOf', 'createGroupClient', 'analyze', 'normalizeCode']) assert.match(js, new RegExp(`\\b(?:function|const) ${name}\\b`));
});

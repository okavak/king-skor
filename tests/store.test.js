import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../store.js';
import { createGame, makeHand, withHand, DEFAULT_RULES } from '../rules.js';

function fakeStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    dump: () => Object.fromEntries(m),
  };
}
const players = ['Ali', 'Ayşe', 'Mehmet', 'Zeynep'];

test('current game round-trips and clears', () => {
  const s = createStore(fakeStorage());
  assert.equal(s.loadCurrent(), null);
  const g = withHand(createGame({ players }), makeHand('el', 0, [13, 0, 0, 0]));
  s.saveCurrent(g);
  assert.deepEqual(s.loadCurrent(), g);
  s.clearCurrent();
  assert.equal(s.loadCurrent(), null);
});

test('history is newest-first, capped at 200, removable by id', () => {
  const s = createStore(fakeStorage());
  const a = createGame({ players, now: new Date('2026-01-01') });
  const b = createGame({ players, now: new Date('2026-01-02') });
  s.addToHistory(a); s.addToHistory(b);
  assert.deepEqual(s.loadHistory().map(g => g.id), [b.id, a.id]);
  s.removeFromHistory(a.id);
  assert.deepEqual(s.loadHistory().map(g => g.id), [b.id]);
  for (let i = 0; i < 205; i++) s.addToHistory(createGame({ players }));
  assert.equal(s.loadHistory().length, 200);
});

test('settings merge over defaults, including nested pointsPer', () => {
  const s = createStore(fakeStorage());
  assert.deepEqual(s.loadSettings(), { ...DEFAULT_RULES, pointsPer: { ...DEFAULT_RULES.pointsPer } });
  s.saveSettings({ ...s.loadSettings(), enforceQuotas: false, pointsPer: { ...DEFAULT_RULES.pointsPer, koz: 60 } });
  const loaded = s.loadSettings();
  assert.equal(loaded.enforceQuotas, false);
  assert.equal(loaded.pointsPer.koz, 60);
  assert.equal(loaded.pointsPer.el, -50);
  assert.equal(loaded.kingThreshold, 10);
});

test('saveNames stores a clean unique roster (tr-TR) capped at 50', () => {
  const s = createStore(fakeStorage());
  s.saveNames(['Ali', ' Ayşe ', 'ali', 7, '', 'Can']);
  assert.deepEqual(s.loadNames(), ['Ali', 'Ayşe', 'Can']);
  s.saveNames(Array.from({ length: 60 }, (_, i) => `O${i}`));
  assert.equal(s.loadNames().length, 50);
});

test('tolerates corrupt JSON and wrong shapes', () => {
  const s = createStore(fakeStorage({
    'king:v1:current': '{not json',
    'king:v1:history': '"a string"',
    'king:v1:settings': '[1,2,3]',
    'king:v1:names': '{"x":1}',
  }));
  assert.equal(s.loadCurrent(), null);
  assert.deepEqual(s.loadHistory(), []);
  assert.deepEqual(s.loadSettings().pointsPer, { ...DEFAULT_RULES.pointsPer });
  assert.deepEqual(s.loadNames(), []);
});

test('saveCurrent reports failure when storage throws', () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => {} };
  const s = createStore(broken);
  assert.equal(s.saveCurrent(createGame({ players })), false);
});

test('flags', () => {
  const s = createStore(fakeStorage());
  assert.equal(s.loadFlag('hintDismissed'), false);
  s.setFlag('hintDismissed', true);
  assert.equal(s.loadFlag('hintDismissed'), true);
});

test('wipeAll removes every key', () => {
  const st = fakeStorage();
  const s = createStore(st);
  s.saveCurrent(createGame({ players })); s.saveNames(players); s.setFlag('x', true); s.saveSettings({ a: 1 }); s.addToHistory(createGame({ players }));
  s.wipeAll();
  assert.deepEqual(st.dump(), {});
});

test('exportAll / importAll round-trip; importAll rejects invalid payload', () => {
  const st = fakeStorage();
  const s = createStore(st);
  const g = createGame({ players });
  s.saveCurrent(g); s.addToHistory(createGame({ players })); s.saveNames(players);
  s.saveSettings({ ...s.loadSettings(), enforceQuotas: false });
  const json = s.exportAll();
  const parsed = JSON.parse(json);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.current.id, g.id);

  const s2 = createStore(fakeStorage());
  assert.deepEqual(s2.importAll(json), { ok: true });
  assert.equal(s2.loadCurrent().id, g.id);
  assert.equal(s2.loadHistory().length, 1);
  assert.equal(s2.loadSettings().enforceQuotas, false);
  assert.deepEqual(s2.loadNames(), s.loadNames());

  assert.equal(s2.importAll('garbage').ok, false);
  assert.equal(s2.importAll('{"version":1,"history":[{"bad":true}]}').ok, false);
  assert.equal(s2.importAll('{"version":99}').ok, false);
  assert.equal(s2.loadCurrent().id, g.id, 'failed import leaves data untouched');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HAND_TYPES, TYPE_BY_ID, DEFAULT_RULES, PLAYER_COUNT, handsTotal,
  createGame, makeHand, handScores, validateCounts, formatPoints,
} from '../rules.js';

const players = ['Ali', 'Ayşe', 'Mehmet', 'Zeynep'];

test('HAND_TYPES has 6 ceza + koz with correct totals', () => {
  assert.equal(HAND_TYPES.length, 7);
  assert.deepEqual(HAND_TYPES.map(t => t.id), ['el', 'kupa', 'erkek', 'kiz', 'rifki', 'soniki', 'koz']);
  assert.deepEqual(HAND_TYPES.map(t => t.total), [13, 13, 8, 4, 1, 2, 13]);
  assert.equal(HAND_TYPES.filter(t => t.ceza).length, 6);
  assert.equal(TYPE_BY_ID.rifki.name, 'Rıfkı');
});

test('default rules sum to zero over a full game', () => {
  const p = DEFAULT_RULES.pointsPer;
  const ceza = 13 * p.el + 13 * p.kupa + 8 * p.erkek + 4 * p.kiz + 1 * p.rifki + 2 * p.soniki; // -2600
  assert.equal(ceza * DEFAULT_RULES.maxPerCezaType + PLAYER_COUNT * DEFAULT_RULES.kozPerPlayer * 13 * p.koz, 0);
  assert.equal(handsTotal(DEFAULT_RULES), 20);
});

test('createGame snapshots rules (deep copy)', () => {
  const rules = { ...DEFAULT_RULES, pointsPer: { ...DEFAULT_RULES.pointsPer } };
  const g = createGame({ players, firstDealer: 2, rules, now: new Date('2026-10-02T20:00:00Z') });
  rules.pointsPer.koz = 999;
  rules.enforceQuotas = false;
  assert.equal(g.rules.pointsPer.koz, 50);
  assert.equal(g.rules.enforceQuotas, true);
  assert.equal(g.firstDealer, 2);
  assert.equal(g.createdAt, '2026-10-02T20:00:00.000Z');
  assert.equal(g.finishedAt, null);
  assert.deepEqual(g.hands, []);
  assert.ok(typeof g.id === 'string' && g.id.length > 6);
});

test('handScores multiplies counts by points per unit', () => {
  const g = createGame({ players });
  assert.deepEqual(handScores(makeHand('el', 0, [5, 3, 5, 0]), g.rules), [-250, -150, -250, 0]);
  assert.deepEqual(handScores(makeHand('koz', 1, [7, 2, 4, 0], 's'), g.rules), [350, 100, 200, 0]);
  assert.deepEqual(handScores(makeHand('rifki', 1, [0, 0, 1, 0]), g.rules), [0, 0, -320, 0]);
  assert.deepEqual(handScores(makeHand('soniki', 1, [1, 1, 0, 0]), g.rules), [-180, -180, 0, 0]);
});

test('validateCounts enforces totals, ranges and integers', () => {
  assert.deepEqual(validateCounts('el', [13, 0, 0, 0]), { ok: true });
  assert.equal(validateCounts('el', [12, 0, 0, 0]).ok, false);
  assert.match(validateCounts('el', [12, 0, 0, 0]).error, /1 el eksik/);
  assert.match(validateCounts('kiz', [3, 2, 0, 0]).error, /1 kız fazla/);
  assert.equal(validateCounts('kiz', [5, -1, 0, 0]).ok, false);
  assert.equal(validateCounts('kupa', [6.5, 6.5, 0, 0]).ok, false);
  assert.equal(validateCounts('rifki', [1, 0, 0, 0]).ok, true);
  assert.equal(validateCounts('rifki', [0, 0, 0, 0]).ok, false);
  assert.equal(validateCounts('yok', [0, 0, 0, 0]).ok, false);
  assert.equal(validateCounts('el', [13, 0, 0]).ok, false);
});

test('formatPoints shows sign only for negatives and dash for zero', () => {
  assert.equal(formatPoints(-320), '-320');
  assert.equal(formatPoints(650), '650');
  assert.equal(formatPoints(0), '0');
});

// ---- Task 2: rotasyon, kota, uygunluk ----
import {
  dealerForHand, currentDealer, gameTotals, quotaState, availableTypes, isFinished,
  withHand, withHandReplaced, withoutHand,
} from '../rules.js';

function enabledIds(list) { return list.filter(x => x.enabled).map(x => x.type); }

test('dealer rotates clockwise from firstDealer', () => {
  const g = createGame({ players, firstDealer: 3 });
  assert.equal(dealerForHand(g, 0), 3);
  assert.equal(dealerForHand(g, 1), 0);
  assert.equal(dealerForHand(g, 4), 3);
  assert.equal(currentDealer(g), 3);
  const g2 = withHand(g, makeHand('el', 3, [13, 0, 0, 0]));
  assert.equal(currentDealer(g2), 0);
  assert.equal(g.hands.length, 0, 'withHand is immutable');
});

test('gameTotals sums every hand', () => {
  let g = createGame({ players });
  g = withHand(g, makeHand('el', 0, [5, 3, 5, 0]));
  g = withHand(g, makeHand('koz', 1, [7, 2, 4, 0]));
  assert.deepEqual(gameTotals(g), [100, -50, -50, 0]);
});

test('quotaState tracks per-player and per-type remaining', () => {
  let g = createGame({ players, firstDealer: 0 });
  g = withHand(g, makeHand('kupa', 0, [13, 0, 0, 0]));
  g = withHand(g, makeHand('koz', 1, [13, 0, 0, 0]));
  g = withHand(g, makeHand('kupa', 2, [13, 0, 0, 0]));
  const q = quotaState(g);
  assert.deepEqual(q.cezaLeft, [2, 3, 2, 3]);
  assert.deepEqual(q.kozLeft, [2, 1, 2, 2]);
  assert.equal(q.typeLeft.kupa, 0);
  assert.equal(q.typeLeft.el, 2);
  assert.equal(q.typeLeft.koz, 7);
  assert.equal(q.handsLeft, 17);
});

test('availableTypes disables exhausted ceza type with reason', () => {
  let g = createGame({ players, firstDealer: 0 });
  g = withHand(g, makeHand('kupa', 0, [13, 0, 0, 0]));
  g = withHand(g, makeHand('kupa', 1, [13, 0, 0, 0]));
  const list = availableTypes(g, 2);
  const kupa = list.find(x => x.type === 'kupa');
  assert.equal(kupa.enabled, false);
  assert.match(kupa.reason, /Kupa Almaz 2 kez oynandı/);
  assert.equal(kupa.left, 0);
  assert.deepEqual(enabledIds(list), ['el', 'erkek', 'kiz', 'rifki', 'soniki', 'koz']);
});

test('availableTypes disables ceza when dealer used 3 ceza, koz when used 2 koz', () => {
  let g = createGame({ players, firstDealer: 0 });
  // dealer 0 plays ceza at hands 0, 4, 8 (every 4th hand); others fill in
  const plan = [
    ['el', 0], ['koz', 1], ['koz', 2], ['koz', 3],
    ['kiz', 0], ['koz', 1], ['koz', 2], ['koz', 3],
    ['rifki', 0], ['el', 1], ['kiz', 2], ['rifki', 3],
  ];
  for (const [type, dealer] of plan) g = withHand(g, makeHand(type, dealer, [TYPE_BY_ID[type].total, 0, 0, 0]));
  const forZero = availableTypes(g, 0);
  assert.deepEqual(enabledIds(forZero), ['koz']);
  assert.match(forZero.find(x => x.type === 'kupa').reason, /Ali için ceza hakkı kalmadı/);
  const forOne = availableTypes(g, 1);
  assert.equal(forOne.find(x => x.type === 'koz').enabled, false);
  assert.match(forOne.find(x => x.type === 'koz').reason, /Ayşe için koz hakkı kalmadı/);
});

test('availableTypes ignores quotas when enforceQuotas is false', () => {
  let g = createGame({ players, rules: { ...DEFAULT_RULES, enforceQuotas: false } });
  g = withHand(g, makeHand('kupa', 0, [13, 0, 0, 0]));
  g = withHand(g, makeHand('kupa', 1, [13, 0, 0, 0]));
  assert.equal(availableTypes(g, 2).every(x => x.enabled), true);
});

test('availableTypes blocks koz in first 4 hands when noKozFirstRound', () => {
  let g = createGame({ players, rules: { ...DEFAULT_RULES, noKozFirstRound: true } });
  const koz0 = availableTypes(g, 0).find(x => x.type === 'koz');
  assert.equal(koz0.enabled, false);
  assert.match(koz0.reason, /İlk 4 elde koz seçilemez/);
  for (let i = 0; i < 4; i++) g = withHand(g, makeHand('el', i, [13, 0, 0, 0]));
  assert.equal(availableTypes(g, 0).find(x => x.type === 'koz').enabled, true);
});

test('availableTypes excludes the hand being edited', () => {
  let g = createGame({ players, firstDealer: 0 });
  g = withHand(g, makeHand('kupa', 0, [13, 0, 0, 0]));
  g = withHand(g, makeHand('kupa', 1, [13, 0, 0, 0]));
  // Editing hand #1 (dealer 1): kupa must stay selectable because that hand is its own second kupa.
  const list = availableTypes(g, 1, { handIndex: 1, excludeIndex: 1 });
  assert.equal(list.find(x => x.type === 'kupa').enabled, true);
  assert.equal(list.find(x => x.type === 'kupa').left, 1);
});

test('withHandReplaced / withoutHand are immutable and keep order', () => {
  let g = createGame({ players });
  g = withHand(g, makeHand('el', 0, [13, 0, 0, 0]));
  g = withHand(g, makeHand('kiz', 1, [4, 0, 0, 0]));
  const g2 = withHandReplaced(g, 0, makeHand('el', 0, [0, 13, 0, 0]));
  assert.deepEqual(g2.hands[0].counts, [0, 13, 0, 0]);
  assert.deepEqual(g.hands[0].counts, [13, 0, 0, 0]);
  const g3 = withoutHand(g, 0);
  assert.equal(g3.hands.length, 1);
  assert.equal(g3.hands[0].type, 'kiz');
});

test('isFinished at 20 hands', () => {
  let g = createGame({ players, rules: { ...DEFAULT_RULES, enforceQuotas: false } });
  for (let i = 0; i < 19; i++) g = withHand(g, makeHand('el', i % 4, [13, 0, 0, 0]));
  assert.equal(isFinished(g), false);
  g = withHand(g, makeHand('el', 3, [13, 0, 0, 0]));
  assert.equal(isFinished(g), true);
});

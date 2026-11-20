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
  callerForHand, currentCaller, gameTotals, quotaState, availableTypes, isFinished,
  withHand, withHandReplaced, withoutHand,
} from '../rules.js';

function enabledIds(list) { return list.filter(x => x.enabled).map(x => x.type); }

// Kayıtta firstDealer ve hand.dealer eli söyleyen koltuğu tutar (rules.js'teki not).
test('the caller rotates clockwise from firstDealer', () => {
  const g = createGame({ players, firstDealer: 3 });
  assert.equal(callerForHand(g, 0), 3);
  assert.equal(callerForHand(g, 1), 0);
  assert.equal(callerForHand(g, 4), 3);
  assert.equal(currentCaller(g), 3);
  const g2 = withHand(g, makeHand('el', 3, [13, 0, 0, 0]));
  assert.equal(currentCaller(g2), 0);
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

// ---- Task 3: sıralama, özet, istatistik, geçerlilik ----
import { standings, summaryText, speechText, isValidGame, expectedGameTotal } from '../rules.js';

function fullGame(firstDealer = 0) {
  // 20 legal hands: each dealer 3 ceza + 2 koz, each ceza type twice. Winner: seat 0.
  let g = createGame({ players, firstDealer, now: new Date('2026-10-02T20:00:00Z') });
  const seq = ['el', 'kupa', 'erkek', 'kiz', 'rifki', 'soniki', 'el', 'kupa', 'erkek', 'kiz', 'rifki', 'soniki'];
  let c = 0;
  for (let i = 0; i < 20; i++) {
    const dealer = (firstDealer + i) % 4;
    const round = Math.floor(i / 4); // 0..4
    const isKoz = round >= 3;        // rounds 3-4 → koz (2 per dealer), rounds 0-2 → ceza (3 per dealer)
    if (isKoz) g = withHand(g, makeHand('koz', dealer, [13, 0, 0, 0]));
    else { const t = seq[c++]; g = withHand(g, makeHand(t, dealer, [0, 0, 0, TYPE_BY_ID[t].total])); }
  }
  return g;
}

test('a full legal game sums to zero and is finished', () => {
  const g = fullGame();
  assert.equal(isFinished(g), true);
  assert.equal(gameTotals(g).reduce((a, b) => a + b, 0), 0);
  assert.deepEqual(gameTotals(g), [5200, 0, 0, -5200]);
  assert.equal(availableTypes(g, 0).every(x => !x.enabled), true, 'nothing left to call');
});

test('standings ranks descending with shared ranks on ties', () => {
  const g = fullGame();
  const st = standings(g);
  assert.deepEqual(st.map(s => [s.seat, s.total, s.rank]), [[0, 5200, 1], [1, 0, 2], [2, 0, 2], [3, -5200, 4]]);
});

test('summaryText reports hand count for early finish', () => {
  let g = createGame({ players, now: new Date('2026-10-02T20:00:00Z') });
  g = withHand(g, makeHand('koz', 0, [13, 0, 0, 0]));
  g = withHand(g, makeHand('kiz', 1, [0, 4, 0, 0]));
  const txt = summaryText(g);
  assert.match(txt, /2 el/);
  assert.match(txt, /1\. Ali: 650/);
  assert.match(txt, /4\. Ayşe: -400/);
  assert.match(txt, /2\. Mehmet: 0/);
});

test('speechText reads totals with Turkish minus', () => {
  let g = createGame({ players });
  g = withHand(g, makeHand('kiz', 1, [0, 4, 0, 0]));
  assert.equal(speechText(g), 'Ali 0. Ayşe eksi 400. Mehmet 0. Zeynep 0.');
});

test('expectedGameTotal is 0 for defaults and shifts with custom points', () => {
  assert.equal(expectedGameTotal(DEFAULT_RULES), 0);
  assert.equal(expectedGameTotal({ ...DEFAULT_RULES, pointsPer: { ...DEFAULT_RULES.pointsPer, koz: 60 } }), 1040);
});

test('isValidGame accepts real games and rejects junk', () => {
  assert.equal(isValidGame(fullGame()), true);
  assert.equal(isValidGame(createGame({ players })), true);
  assert.equal(isValidGame(null), false);
  assert.equal(isValidGame({}), false);
  assert.equal(isValidGame({ ...createGame({ players }), players: ['a'] }), false);
  assert.equal(isValidGame({ ...createGame({ players }), hands: [{ type: 'yok', dealer: 0, counts: [1, 0, 0, 0] }] }), false);
  assert.equal(isValidGame({ ...createGame({ players }), hands: [{ type: 'el', dealer: 9, counts: [13, 0, 0, 0] }] }), false);
});

// ---- İnceleme düzeltmeleri ----
test('withoutHand re-stamps callers so hands[i].dealer === callerForHand(g, i)', () => {
  let g = createGame({ players, firstDealer: 0, rules: { ...DEFAULT_RULES, enforceQuotas: false } });
  for (let i = 0; i < 5; i++) g = withHand(g, makeHand('koz', callerForHand(g, i), [13, 0, 0, 0]));
  const g2 = withoutHand(g, 2);
  assert.equal(g2.hands.length, 4);
  g2.hands.forEach((h, i) => assert.equal(h.dealer, callerForHand(g2, i), `hand ${i}`));
  assert.deepEqual(quotaState(g2).kozLeft, [1, 1, 1, 1]);
  assert.equal(currentCaller(g2), 0);
});

test('noKozFirstRound applies even when quotas are off', () => {
  const g = createGame({ players, rules: { ...DEFAULT_RULES, enforceQuotas: false, noKozFirstRound: true } });
  assert.equal(availableTypes(g, 0).find(x => x.type === 'koz').enabled, false);
  assert.equal(availableTypes(g, 0).find(x => x.type === 'el').enabled, true);
});

// ---- King kuralı ve çıktı/battı ----
import { kingSeat, outcomes } from '../rules.js';

test('kingSeat finds the koz hand where a player reaches the threshold and it ends the game', () => {
  let g = createGame({ players, rules: { ...DEFAULT_RULES, enforceQuotas: false } });
  g = withHand(g, makeHand('koz', 0, [9, 4, 0, 0]));
  assert.equal(kingSeat(g), null);
  assert.equal(isFinished(g), false);
  g = withHand(g, makeHand('koz', 1, [10, 3, 0, 0]));
  assert.deepEqual(kingSeat(g), { seat: 0, handIndex: 1 });
  assert.equal(isFinished(g), true);
});

test('King is ignored when kingEndsGame is off, and ceza hands never make a King', () => {
  let g = createGame({ players, rules: { ...DEFAULT_RULES, enforceQuotas: false, kingEndsGame: false } });
  g = withHand(g, makeHand('koz', 0, [13, 0, 0, 0]));
  assert.equal(kingSeat(g), null);
  assert.equal(isFinished(g), false);
  let g2 = createGame({ players, rules: { ...DEFAULT_RULES, enforceQuotas: false } });
  g2 = withHand(g2, makeHand('el', 0, [13, 0, 0, 0]));
  assert.equal(kingSeat(g2), null);
});

test('outcomes: King → king + sunk; normal end → out (>= 0) or sunk (< 0)', () => {
  let g = createGame({ players, rules: { ...DEFAULT_RULES, enforceQuotas: false } });
  g = withHand(g, makeHand('koz', 0, [11, 2, 0, 0]));
  assert.deepEqual(outcomes(g), { king: 0, bySeat: ['king', 'sunk', 'sunk', 'sunk'] });
  let h = createGame({ players });
  h = withHand(h, makeHand('kiz', 0, [0, 4, 0, 0]));
  h = withHand(h, makeHand('koz', 1, [7, 0, 6, 0]));
  assert.deepEqual(outcomes(h), { king: null, bySeat: ['out', 'sunk', 'out', 'out'] });
});

test('summaryText reflects outcomes', () => {
  let g = createGame({ players, rules: { ...DEFAULT_RULES, enforceQuotas: false }, now: new Date('2026-10-02T20:00:00Z') });
  g = withHand(g, makeHand('koz', 0, [11, 2, 0, 0]));
  assert.match(summaryText(g), /Ali King yaptı/);
  assert.match(summaryText(g), /Ayşe, Mehmet, Zeynep battı/);
  let h = createGame({ players, now: new Date('2026-10-02T20:00:00Z') });
  h = withHand(h, makeHand('kiz', 0, [0, 4, 0, 0]));
  assert.match(summaryText(h), /Çıkanlar: Ali, Mehmet, Zeynep/);
  assert.match(summaryText(h), /Batanlar: Ayşe/);
});

// ---- söyleyen ve dağıtan: bir önceki eli söyleyen dağıtır, ondan sonraki söyler ----
import { currentDealer, callerAfter, dealerBefore, withCurrentDealer } from '../rules.js';

test('the seat after the dealer calls, and both wrap around the table', () => {
  assert.deepEqual([0, 1, 2, 3].map(callerAfter), [1, 2, 3, 0]);
  assert.deepEqual([0, 1, 2, 3].map(dealerBefore), [3, 0, 1, 2]);
});

test('whoever called the last hand deals the next one', () => {
  let g = createGame({ players, firstDealer: 3 }); // ilk eli Zeynep (3) söyler
  assert.equal(currentDealer(g), 2, 'ilk eli, söyleyenden bir önceki koltuk dağıtır');
  g = withHand(g, makeHand('el', 3, [13, 0, 0, 0]));
  assert.equal(currentDealer(g), 3, '1. eli söyleyen Zeynep 2. eli dağıtır');
  assert.equal(currentCaller(g), 0, 'ondan sonraki (Ali) söyler');
  g = withHand(g, makeHand('kupa', 0, [13, 0, 0, 0]));
  assert.equal(currentDealer(g), 0);
  assert.equal(currentCaller(g), 1);
});

test('withCurrentDealer: the chosen seat deals the next hand and played hands are re-stamped to match', () => {
  let g = createGame({ players, firstDealer: 0, rules: { ...DEFAULT_RULES, enforceQuotas: false } });
  for (let i = 0; i < 3; i++) g = withHand(g, makeHand('el', i, [13, 0, 0, 0]));
  // Uygulama "Mehmet (2) dağıtıyor, Zeynep (3) söylüyor" diyor; masada aslında Zeynep dağıtıyor, Ali (0) söylüyor.
  const fixed = withCurrentDealer(g, 3);
  assert.equal(currentDealer(fixed), 3);
  assert.equal(currentCaller(fixed), 0);
  assert.equal(fixed.firstDealer, 1);
  assert.deepEqual(fixed.hands.map(h => h.dealer), [1, 2, 3], 'oynanan ellerin söyleyeni bir koltuk kayar');
  assert.deepEqual(quotaState(fixed).cezaLeft, [3, 2, 2, 2], 'haklar yeni söyleyenlere göre');
  assert.deepEqual(g.hands.map(h => h.dealer), [0, 1, 2], 'original untouched');
  assert.equal(g.firstDealer, 0);
});

test('isValidGame rejects hand types that are inherited object properties', () => {
  for (const type of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const g = { ...createGame({ players }), hands: [{ type, dealer: 0, counts: [1, 0, 0, 0] }] };
    assert.equal(isValidGame(g), false, type);
    assert.equal(validateCounts(type, [1, 0, 0, 0]).ok, false, type);
  }
});

// ---- çıkmak için gereken koz ----
import { kozNeeded } from '../rules.js';

test('kozNeeded: koz tricks each seat needs to climb back to zero, rounded up', () => {
  let g = createGame({ players });
  g = withHand(g, makeHand('el', 0, [5, 4, 4, 0]));     // -250, -200, -200, 0
  g = withHand(g, makeHand('kupa', 1, [2, 0, 1, 10]));  // -60, 0, -30, -300
  // toplam -310, -200, -230, -300 → 6,2 → 7 · tam 4 (sıfıra gelen çıkar) · 4,6 → 5 · tam 6
  assert.deepEqual(kozNeeded(g), [7, 4, 5, 6]);
});

test('kozNeeded is 0 for a seat that is already at zero or above', () => {
  let g = createGame({ players });
  g = withHand(g, makeHand('el', 0, [13, 0, 0, 0]));  // -650, 0, 0, 0
  g = withHand(g, makeHand('koz', 1, [5, 4, 4, 0]));  // +250, +200, +200, 0
  assert.deepEqual(kozNeeded(g), [8, 0, 0, 0]);
});

test('kozNeeded follows the koz point value of the game', () => {
  const custom = pts => ({ ...DEFAULT_RULES, pointsPer: { ...DEFAULT_RULES.pointsPer, koz: pts } });
  const lost = g => withHand(g, makeHand('el', 0, [5, 0, 0, 8])); // -250, 0, 0, -400
  assert.deepEqual(kozNeeded(lost(createGame({ players, rules: custom(100) }))), [3, 0, 0, 4]);
  assert.deepEqual(kozNeeded(lost(createGame({ players, rules: custom(0) }))), [0, 0, 0, 0], 'koz puan getirmiyorsa yazılacak sayı yok');
});

// İki el almaz (Zeynep -1300), sonra herkes ikişer koz söyler: her kozda Zeynep 3 el alır (+150).
function kozRunDown(rules, kozHands) {
  let g = createGame({ players, rules });
  g = withHand(g, makeHand('el', 0, [0, 0, 0, 13]));
  g = withHand(g, makeHand('el', 1, [0, 0, 0, 13]));
  for (let i = 0; i < kozHands; i++) g = withHand(g, makeHand('koz', (2 + i) % 4, [4, 3, 3, 3]));
  return g;
}

test('kozNeeded stops counting once no koz hand is left to play', () => {
  assert.deepEqual(kozNeeded(kozRunDown(DEFAULT_RULES, 7)), [0, 0, 0, 5], 'bir koz eli kaldı: -250 → 5');
  assert.deepEqual(kozNeeded(kozRunDown(DEFAULT_RULES, 8)), [0, 0, 0, 0], 'sekiz koz da oynandı: Zeynep -100 ama alacak koz yok');
  const free = { ...DEFAULT_RULES, enforceQuotas: false };
  assert.deepEqual(kozNeeded(kozRunDown(free, 8)), [0, 0, 0, 2], 'haklar serbestse koz yine söylenebilir');
});

test('kozNeeded is all zeros once the game is over', () => {
  const early = { ...kozRunDown(DEFAULT_RULES, 3), finishedAt: '2026-11-20T20:00:00.000Z' }; // erken bitirildi
  assert.deepEqual(kozNeeded(early), [0, 0, 0, 0]);
  let king = createGame({ players });
  king = withHand(king, makeHand('el', 0, [0, 13, 0, 0]));
  king = withHand(king, makeHand('koz', 1, [10, 3, 0, 0])); // Ali King yaptı: oyun bitti
  assert.deepEqual(kozNeeded(king), [0, 0, 0, 0]);
});

// ---- avans: oyun başında koltuk başına verilen puan ("Başbuğ avansı" şakası) ----
import { gameAvans, withAvans } from '../rules.js';

test('gameTotals starts every seat from its avans', () => {
  let g = createGame({ players });
  g = withHand(g, makeHand('el', 0, [5, 3, 5, 0])); // -250, -150, -250, 0
  assert.deepEqual(gameTotals(withAvans(g, [100, 100, 0, 100])), [-150, -50, -250, 100]);
  assert.deepEqual(gameTotals(g), [-250, -150, -250, 0], 'avans yoksa toplam değişmez');
});

test('withAvans sets and removes the avans without touching the original game', () => {
  const g = createGame({ players });
  const on = withAvans(g, [100, 100, 0, 100]);
  assert.deepEqual(gameAvans(on), [100, 100, 0, 100]);
  assert.deepEqual(gameAvans(g), [0, 0, 0, 0], 'original untouched; avans yoksa sıfırlar');
  const off = withAvans(on, null);
  assert.deepEqual(gameAvans(off), [0, 0, 0, 0]);
  assert.equal('avans' in off, false, 'kapatılınca alan kayıttan kalkar');
  assert.deepEqual(gameAvans(on), [100, 100, 0, 100], 'kapatmak açık kopyayı değiştirmez');
});

test('avans counts toward who gets out and how many koz are still needed', () => {
  let g = createGame({ players });
  g = withHand(g, makeHand('el', 0, [1, 5, 4, 3])); // -50, -250, -200, -150
  assert.deepEqual(outcomes(g).bySeat, ['sunk', 'sunk', 'sunk', 'sunk']);
  const on = withAvans(g, [100, 100, 0, 100]);       // 50, -150, -200, -50
  assert.deepEqual(outcomes(on).bySeat, ['out', 'sunk', 'sunk', 'sunk']);
  assert.deepEqual(kozNeeded(on), [0, 3, 4, 1]);
});

test('isValidGame accepts a well-formed avans and rejects a malformed one', () => {
  const g = createGame({ players });
  assert.equal(isValidGame({ ...g, avans: [100, 100, 0, 100] }), true);
  for (const bad of [[100, 100, 0], [100, 100, 0, 100, 100], [100, 100, 0, 1.5], [100, 100, 0, -100], [100, 100, 0, '100'], [100, 100, 0, 1e9], 'evet', { 0: 100 }]) {
    assert.equal(isValidGame({ ...g, avans: bad }), false, JSON.stringify(bad));
  }
});

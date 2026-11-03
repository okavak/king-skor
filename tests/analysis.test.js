import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGame, aggregate, analyze, playedTogether, SUMMARY_VERSION } from '../analysis.js';
import { createGame, makeHand, withHand, DEFAULT_RULES, TYPE_BY_ID, HAND_TYPES } from '../rules.js';

const players = ['Ali', 'Ayşe', 'Mehmet', 'Zeynep'];

// 20 yasal el: her dağıtan 3 ceza + 2 koz, her ceza iki kez. Koltuk 3 bütün cezaları, koltuk 0 bütün kozları alır.
// Varsayılan kurallarda koltuk 0 ilk koz elinde (12. indeks) King yapar.
function fullGame(rules = DEFAULT_RULES, names = players) {
  let g = createGame({ players: names, rules, now: new Date('2026-10-02T20:00:00Z') });
  const seq = ['el', 'kupa', 'erkek', 'kiz', 'rifki', 'soniki', 'el', 'kupa', 'erkek', 'kiz', 'rifki', 'soniki'];
  let c = 0;
  for (let i = 0; i < 20; i++) {
    const dealer = i % 4;
    if (Math.floor(i / 4) >= 3) g = withHand(g, makeHand('koz', dealer, [13, 0, 0, 0]));
    else { const t = seq[c++]; g = withHand(g, makeHand(t, dealer, [0, 0, 0, TYPE_BY_ID[t].total])); }
  }
  return { ...g, finishedAt: '2026-10-02T21:00:00.000Z' };
}

function gameOf(names, hands, { at = '2026-10-02T21:00:00.000Z', rules = { ...DEFAULT_RULES, enforceQuotas: false } } = {}) {
  let g = createGame({ players: names, rules, now: new Date('2026-10-02T20:00:00Z') });
  hands.forEach(([type, counts], i) => { g = withHand(g, makeHand(type, i % 4, counts)); });
  return { ...g, finishedAt: at };
}

// Elle kurulmuş özet: aggregate'i summarizeGame'den bağımsız sınamak için.
const seat = (name, key, total, outcome, t = {}) => ({ name, key, total, outcome, kings: 0, t });
const summary = (id, at, seats) => ({ v: SUMMARY_VERSION, id, at, seats });
const find = (analysis, key) => analysis.players.find(p => p.key === key);

test('summarizeGame records totals, outcomes and per-type units, points and kings', () => {
  const g = fullGame({ ...DEFAULT_RULES, kingEndsGame: false });
  const s = summarizeGame(g);
  assert.equal(s.v, 1);
  assert.equal(s.id, g.id);
  assert.equal(s.at, '2026-10-02T21:00:00.000Z');
  const [ali, ayse, , zeynep] = s.seats;
  assert.deepEqual([ali.name, ali.key, ali.total, ali.outcome, ali.kings], ['Ali', 'ali', 5200, 'out', 8]);
  assert.deepEqual(ali.t.koz, [8, 104, 5200]);
  assert.deepEqual(ali.t.el, [2, 0, 0]);
  assert.deepEqual([ayse.key, ayse.total, ayse.outcome], ['ayse', 0, 'out']);
  assert.deepEqual([zeynep.total, zeynep.outcome], [-5200, 'sunk']);
  assert.deepEqual(zeynep.t.kiz, [2, 8, -800]);
  assert.deepEqual(zeynep.t.rifki, [2, 2, -640]);
  assert.deepEqual(zeynep.t.koz, [8, 0, 0]);
});

test('summarizeGame marks King and sinks everyone else under the King rule', () => {
  assert.deepEqual(summarizeGame(fullGame()).seats.map(x => x.outcome), ['king', 'sunk', 'sunk', 'sunk']);
});

test('summarizeGame lists only hand types that were played and falls back to createdAt', () => {
  const g = { ...gameOf(players, [['kiz', [1, 1, 1, 1]]]), finishedAt: null };
  const s = summarizeGame(g);
  assert.deepEqual(Object.keys(s.seats[0].t), ['kiz']);
  assert.equal(s.at, '2026-10-02T20:00:00.000Z');
});

test('analyze merges spelling variants into one player and keeps King wins and kings', () => {
  const a = analyze([fullGame(), fullGame(DEFAULT_RULES, ['ALİ', 'ayşe', 'MEHMET', 'zeynep']), fullGame()]);
  assert.equal(a.games, 3);
  assert.equal(a.players.length, 4);
  const ali = find(a, 'ali');
  assert.deepEqual([ali.name, ali.games, ali.wins, ali.avgTotal, ali.best, ali.worst, ali.kings], ['Ali', 3, 3, 5200, 5200, 5200, 24]);
  assert.deepEqual(ali.spellings, ['Ali', 'ALİ']);
  assert.equal(ali.winRate, 1);
  const zeynep = find(a, 'zeynep');
  assert.deepEqual([zeynep.wins, zeynep.winRate, zeynep.worst], [0, 0, -5200]);
});

test('aliases fold different keys into one player and list every merged key', () => {
  const s = [
    summary('g1', '2026-10-01', [seat('Memo', 'memo', 100, 'out')]),
    summary('g2', '2026-10-02', [seat('Memo', 'memo', -50, 'sunk')]),
    summary('g3', '2026-10-03', [seat('Mehmet', 'mehmet', 300, 'out')]),
  ];
  const a = aggregate(s, { aliases: { memo: 'mehmet' } });
  assert.equal(a.players.length, 1);
  const p = a.players[0];
  assert.deepEqual([p.key, p.name, p.games, p.wins, p.avgTotal, p.best, p.worst], ['mehmet', 'Mehmet', 3, 2, 117, 300, -50], 'the merge target spelling is shown even if the nickname is more frequent');
  assert.deepEqual(p.keys, ['mehmet', 'memo']);
  assert.deepEqual(p.spellings, ['Memo', 'Mehmet']);
  assert.equal(aggregate(s).players.length, 2, 'without the alias they stay apart');
});

test('share is units over hands × total; weakest needs 3 hands above fair share, strongest 3 hands below', () => {
  const three = gameOf(players, [['kiz', [3, 1, 0, 0]], ['kiz', [3, 0, 1, 0]], ['kiz', [3, 0, 0, 1]],
    ['el', [0, 13, 0, 0]], ['el', [0, 0, 13, 0]], ['el', [0, 0, 0, 13]], ['koz', [13, 0, 0, 0]]]);
  const ali = find(analyze([three]), 'ali');
  assert.deepEqual(ali.types.kiz, { hands: 3, units: 9, points: -900, share: 0.75 });
  assert.deepEqual(ali.types.el, { hands: 3, units: 0, points: 0, share: 0 });
  assert.equal(ali.types.koz.share, 1);
  assert.equal(ali.weakest, 'kiz');
  assert.equal(ali.strongest, 'el');

  const two = gameOf(players, [['kiz', [3, 1, 0, 0]], ['kiz', [3, 0, 1, 0]], ['el', [0, 13, 0, 0]], ['el', [0, 0, 13, 0]]]);
  const ali2 = find(analyze([two]), 'ali');
  assert.equal(ali2.weakest, null, 'two hands are not enough evidence');
  assert.equal(ali2.strongest, null);

  const fair = gameOf(players, [['kiz', [1, 1, 1, 1]], ['kiz', [1, 1, 1, 1]], ['kiz', [1, 1, 1, 1]], ['kupa', [4, 3, 3, 3]],
    ['kupa', [3, 4, 3, 3]], ['kupa', [3, 3, 4, 3]]]);
  const aliFair = find(analyze([fair]), 'ali');
  assert.equal(aliFair.types.kiz.share, 0.25);
  assert.equal(aliFair.weakest, 'kupa', 'kupa 10/39 is just above a quarter');
  assert.equal(aliFair.strongest, null, 'exactly a quarter is not a strength');
});

test('rank needs 3 games; equal win rate and average share a rank; unranked players come last', () => {
  const s = [];
  const add = (id, at, ...seats) => s.push(summary(id, at, seats));
  add('1', '2026-10-01', seat('A', 'a', 100, 'out'), seat('B', 'b', 100, 'out'), seat('C', 'c', -200, 'sunk'), seat('D', 'd', 0, 'out'));
  add('2', '2026-10-02', seat('A', 'a', 100, 'out'), seat('B', 'b', 100, 'out'), seat('C', 'c', -200, 'sunk'), seat('D', 'd', 0, 'out'));
  add('3', '2026-10-03', seat('A', 'a', 100, 'sunk'), seat('B', 'b', 100, 'sunk'), seat('C', 'c', 200, 'out'));
  add('4', '2026-10-04', seat('C', 'c', -100, 'sunk'));
  const a = aggregate(s);
  assert.deepEqual(a.players.map(p => [p.key, p.rank]), [['a', 1], ['b', 1], ['c', 3], ['d', null]]);
  assert.deepEqual([a.games, a.firstAt, a.lastAt], [4, '2026-10-01', '2026-10-04']);
});

test('display name is the most frequent spelling, the latest one on ties', () => {
  const tie = [summary('2', '2026-10-05', [seat('Çağrı', 'cagri', 0, 'out')]), summary('1', '2026-10-01', [seat('Cagri', 'cagri', 0, 'out')])];
  assert.equal(aggregate(tie).players[0].name, 'Çağrı');
  const more = [...tie, summary('3', '2026-10-03', [seat('Cagri', 'cagri', 0, 'out')])];
  assert.equal(aggregate(more).players[0].name, 'Cagri');
});

test('every hand type is present; unplayed ones have zero hands and no share', () => {
  const p = find(analyze([gameOf(players, [['kiz', [4, 0, 0, 0]]])]), 'ali');
  assert.deepEqual(Object.keys(p.types), HAND_TYPES.map(t => t.id));
  assert.deepEqual(p.types.el, { hands: 0, units: 0, points: 0, share: null });
  assert.deepEqual(p.types.kiz, { hands: 1, units: 4, points: -400, share: 1 });
  assert.equal(p.weakest, null);
});

test('playedTogether finds two keys at the same table, after aliases', () => {
  const s = [
    summary('1', '2026-10-01', [seat('Memo', 'memo', 0, 'out'), seat('Ali', 'ali', 0, 'out')]),
    summary('2', '2026-10-02', [seat('Memo2', 'memo2', 0, 'out'), seat('Veli', 'veli', 0, 'out')]),
  ];
  assert.equal(playedTogether(s, 'memo', 'ali'), true);
  assert.equal(playedTogether(s, 'memo', 'veli'), false);
  assert.equal(playedTogether(s, 'memo', 'veli', { memo2: 'memo' }), true);
});

test('analyze skips records that are not valid games', () => {
  const a = analyze([gameOf(players, [['kiz', [4, 0, 0, 0]]]), { junk: true }, null]);
  assert.equal(a.games, 1);
  assert.deepEqual(aggregate([]), { games: 0, firstAt: null, lastAt: null, players: [] });
});

test('aggregate ignores unknown hand types and never writes to Object.prototype', () => {
  const t = JSON.parse('{"__proto__":[1,1,1],"constructor":[1,1,1],"kiz":[1,4,-400]}');
  const a = aggregate([summary('x', '2026-10-01', [{ ...seat('Ali', 'ali', -400, 'sunk'), t }])]);
  assert.equal(({})[0], undefined);
  assert.equal(Object.prototype.hands, undefined);
  assert.deepEqual(Object.keys(a.players[0].types), HAND_TYPES.map(x => x.id));
  assert.equal(a.players[0].types.kiz.units, 4);
});

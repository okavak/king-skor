// rules.js — King puanlama motoru. Saf fonksiyonlar, yan etki yok, DOM yok.

export const PLAYER_COUNT = 4;

export const HAND_TYPES = [
  { id: 'el',     name: 'El Almaz',    short: 'El',      unit: 'el',    total: 13, ceza: true,  glyph: 'El',  red: false },
  { id: 'kupa',   name: 'Kupa Almaz',  short: 'Kupa',    unit: 'kupa',  total: 13, ceza: true,  glyph: '♥',   red: true },
  { id: 'erkek',  name: 'Erkek Almaz', short: 'Erkek',   unit: 'erkek', total: 8,  ceza: true,  glyph: 'KJ',  red: false },
  { id: 'kiz',    name: 'Kız Almaz',   short: 'Kız',     unit: 'kız',   total: 4,  ceza: true,  glyph: 'Q',   red: false },
  { id: 'rifki',  name: 'Rıfkı',       short: 'Rıfkı',   unit: 'rıfkı', total: 1,  ceza: true,  glyph: 'K♥',  red: true },
  { id: 'soniki', name: 'Son İki',     short: 'Son İki', unit: 'el',    total: 2,  ceza: true,  glyph: '2',   red: false },
  { id: 'koz',    name: 'Koz',         short: 'Koz',     unit: 'el',    total: 13, ceza: false, glyph: 'Koz', red: false },
];

export const TYPE_BY_ID = Object.fromEntries(HAND_TYPES.map(t => [t.id, t]));

export const DEFAULT_RULES = Object.freeze({
  pointsPer: Object.freeze({ el: -50, kupa: -30, erkek: -60, kiz: -100, rifki: -320, soniki: -180, koz: 50 }),
  cezaPerPlayer: 3,
  kozPerPlayer: 2,
  maxPerCezaType: 2,
  enforceQuotas: true,
  noKozFirstRound: false,
  kingThreshold: 10,
});

export const SUITS = { s: '♠', h: '♥', d: '♦', c: '♣' };

export function handsTotal(rules) {
  return PLAYER_COUNT * (rules.cezaPerPlayer + rules.kozPerPlayer);
}

export function cloneRules(rules) {
  return { ...rules, pointsPer: { ...rules.pointsPer } };
}

function genId(now) {
  return now.getTime().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createGame({ players, firstDealer = 0, rules = DEFAULT_RULES, now = new Date() }) {
  return {
    id: genId(now),
    createdAt: now.toISOString(),
    finishedAt: null,
    players: [...players],
    firstDealer,
    rules: cloneRules(rules),
    hands: [],
  };
}

export function makeHand(type, dealer, counts, trumpSuit = null) {
  const hand = { type, dealer, counts: [...counts] };
  if (type === 'koz' && trumpSuit) hand.trumpSuit = trumpSuit;
  return hand;
}

export function handScores(hand, rules) {
  const per = rules.pointsPer[hand.type] ?? 0;
  return hand.counts.map(c => (c * per) || 0); // -0 → 0
}

export function validateCounts(type, counts) {
  const t = TYPE_BY_ID[type];
  if (!t) return { ok: false, error: 'Bilinmeyen el türü' };
  if (!Array.isArray(counts) || counts.length !== PLAYER_COUNT) return { ok: false, error: 'Dört oyuncu için sayı gerekli' };
  if (counts.some(c => !Number.isInteger(c) || c < 0 || c > t.total)) {
    return { ok: false, error: `Her değer 0 ile ${t.total} arasında tam sayı olmalı` };
  }
  const sum = counts.reduce((a, b) => a + b, 0);
  if (sum < t.total) return { ok: false, error: `${t.total - sum} ${t.unit} eksik` };
  if (sum > t.total) return { ok: false, error: `${sum - t.total} ${t.unit} fazla` };
  return { ok: true };
}

export function formatPoints(n) {
  return String(n);
}

export function dealerForHand(game, index) {
  return (game.firstDealer + index) % PLAYER_COUNT;
}

export function currentDealer(game) {
  return dealerForHand(game, game.hands.length);
}

export function withHand(game, hand) {
  return { ...game, hands: [...game.hands, hand] };
}

export function withHandReplaced(game, index, hand) {
  const hands = game.hands.slice();
  hands[index] = hand;
  return { ...game, hands };
}

export function withoutHand(game, index) {
  return { ...game, hands: game.hands.filter((_, i) => i !== index) };
}

export function gameTotals(game) {
  const totals = new Array(PLAYER_COUNT).fill(0);
  for (const h of game.hands) handScores(h, game.rules).forEach((s, i) => { totals[i] += s; });
  return totals;
}

export function quotaState(game) {
  const r = game.rules;
  const cezaLeft = new Array(PLAYER_COUNT).fill(r.cezaPerPlayer);
  const kozLeft = new Array(PLAYER_COUNT).fill(r.kozPerPlayer);
  const typeLeft = {};
  for (const t of HAND_TYPES) typeLeft[t.id] = t.ceza ? r.maxPerCezaType : PLAYER_COUNT * r.kozPerPlayer;
  for (const h of game.hands) {
    const t = TYPE_BY_ID[h.type];
    if (!t) continue;
    if (t.ceza) cezaLeft[h.dealer] -= 1; else kozLeft[h.dealer] -= 1;
    typeLeft[h.type] -= 1;
  }
  return { cezaLeft, kozLeft, typeLeft, handsLeft: handsTotal(r) - game.hands.length };
}

export function availableTypes(game, dealer, { handIndex = game.hands.length, excludeIndex = null } = {}) {
  const base = excludeIndex === null ? game : withoutHand(game, excludeIndex);
  const r = game.rules;
  const q = quotaState(base);
  const name = game.players[dealer];
  return HAND_TYPES.map(t => {
    const left = q.typeLeft[t.id];
    const ok = { type: t.id, enabled: true, reason: '', left };
    if (!r.enforceQuotas) return ok;
    if (t.ceza) {
      if (left <= 0) return { ...ok, enabled: false, reason: `${t.name} ${r.maxPerCezaType} kez oynandı` };
      if (q.cezaLeft[dealer] <= 0) return { ...ok, enabled: false, reason: `${name} için ceza hakkı kalmadı` };
    } else {
      if (q.kozLeft[dealer] <= 0) return { ...ok, enabled: false, reason: `${name} için koz hakkı kalmadı` };
      if (r.noKozFirstRound && handIndex < PLAYER_COUNT) return { ...ok, enabled: false, reason: `İlk ${PLAYER_COUNT} elde koz seçilemez` };
    }
    return ok;
  });
}

export function isFinished(game) {
  return game.hands.length >= handsTotal(game.rules);
}

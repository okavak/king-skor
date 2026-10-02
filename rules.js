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

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
  kingThreshold: 10,     // koz elinde en az bu kadar el alan "King yapar"
  kingEndsGame: true,    // King yapan çıkar, diğerleri batar, oyun o anda biter
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
  // Dağıtan sırası indeksten türetilir; silmeden sonra kalan eller yeniden damgalanır.
  const hands = game.hands.filter((_, i) => i !== index).map((h, i) => ({ ...h, dealer: dealerForHand(game, i) }));
  return { ...game, hands };
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
    if (!t.ceza && r.noKozFirstRound && handIndex < PLAYER_COUNT) return { ...ok, enabled: false, reason: `İlk ${PLAYER_COUNT} elde koz seçilemez` };
    if (!r.enforceQuotas) return ok;
    if (t.ceza) {
      if (left <= 0) return { ...ok, enabled: false, reason: `${t.name} ${r.maxPerCezaType} kez oynandı` };
      if (q.cezaLeft[dealer] <= 0) return { ...ok, enabled: false, reason: `${name} için ceza hakkı kalmadı` };
    } else if (q.kozLeft[dealer] <= 0) {
      return { ...ok, enabled: false, reason: `${name} için koz hakkı kalmadı` };
    }
    return ok;
  });
}

// King: koz elinde eşiğe ulaşan ilk oyuncu. Kural kapalıysa null.
export function kingSeat(game) {
  const r = game.rules;
  if (r.kingEndsGame === false) return null;
  const threshold = r.kingThreshold ?? DEFAULT_RULES.kingThreshold;
  for (let i = 0; i < game.hands.length; i++) {
    const h = game.hands[i];
    if (h.type !== 'koz') continue;
    const seat = h.counts.findIndex(c => c >= threshold);
    if (seat !== -1) return { seat, handIndex: i };
  }
  return null;
}

export function isFinished(game) {
  return game.hands.length >= handsTotal(game.rules) || kingSeat(game) !== null;
}

// Sonuç: King yapan 'king', diğerleri 'sunk'; normal bitişte toplamı 0 ve üstü 'out' (çıktı), altı 'sunk' (battı).
export function outcomes(game) {
  const k = kingSeat(game);
  if (k) return { king: k.seat, bySeat: game.players.map((_, i) => (i === k.seat ? 'king' : 'sunk')) };
  return { king: null, bySeat: gameTotals(game).map(t => (t >= 0 ? 'out' : 'sunk')) };
}

export function standings(game) {
  const totals = gameTotals(game);
  const sorted = totals.map((total, seat) => ({ seat, total, rank: 0 })).sort((a, b) => b.total - a.total || a.seat - b.seat);
  let rank = 0;
  let prev = null;
  sorted.forEach((s, i) => {
    if (s.total !== prev) { rank = i + 1; prev = s.total; }
    s.rank = rank;
  });
  return sorted;
}

export function summaryText(game) {
  const st = standings(game);
  const date = new Date(game.finishedAt || game.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const lines = st.map(s => `${s.rank}. ${game.players[s.seat]}: ${formatPoints(s.total)}`);
  const o = outcomes(game);
  const names = kind => game.players.filter((_, i) => o.bySeat[i] === kind);
  const verdict = o.king !== null
    ? `${game.players[o.king]} King yaptı! ${names('sunk').join(', ')} battı.`
    : `Çıkanlar: ${names('out').join(', ') || 'yok'}. Batanlar: ${names('sunk').join(', ') || 'yok'}.`;
  return `King skoru, ${date} (${game.hands.length} el)\n${verdict}\n${lines.join('\n')}`;
}

export function speechText(game) {
  const totals = gameTotals(game);
  return game.players.map((name, i) => `${name} ${totals[i] < 0 ? 'eksi ' : ''}${Math.abs(totals[i])}.`).join(' ');
}

function nameKey(name) {
  return String(name).trim().toLocaleLowerCase('tr-TR');
}

export function playerStats(games) {
  const map = new Map();
  for (const g of games) {
    if (!isValidGame(g)) continue;
    const totals = gameTotals(g);
    const result = outcomes(g).bySeat; // kazanmak = çıkmak (King dahil)
    const threshold = g.rules.kingThreshold ?? DEFAULT_RULES.kingThreshold;
    g.players.forEach((name, seat) => {
      const key = nameKey(name);
      const p = map.get(key) || { name: String(name).trim(), games: 0, wins: 0, sum: 0, best: -Infinity, worst: Infinity, kings: 0 };
      p.games += 1;
      if (result[seat] !== 'sunk') p.wins += 1;
      p.sum += totals[seat];
      p.best = Math.max(p.best, totals[seat]);
      p.worst = Math.min(p.worst, totals[seat]);
      p.kings += g.hands.filter(h => h.type === 'koz' && h.counts[seat] >= threshold).length;
      map.set(key, p);
    });
  }
  return [...map.values()]
    .map(({ sum, ...p }) => ({ ...p, avgTotal: Math.round(sum / p.games) }))
    .sort((a, b) => b.wins - a.wins || b.avgTotal - a.avgTotal || a.name.localeCompare(b.name, 'tr-TR'));
}

export function expectedGameTotal(rules) {
  let cezaSet = 0;
  for (const t of HAND_TYPES) if (t.ceza) cezaSet += t.total * rules.pointsPer[t.id];
  return rules.maxPerCezaType * cezaSet + PLAYER_COUNT * rules.kozPerPlayer * TYPE_BY_ID.koz.total * rules.pointsPer.koz;
}

export function isValidGame(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (!Array.isArray(obj.players) || obj.players.length !== PLAYER_COUNT) return false;
  if (!obj.players.every(p => typeof p === 'string')) return false;
  if (!Number.isInteger(obj.firstDealer) || obj.firstDealer < 0 || obj.firstDealer >= PLAYER_COUNT) return false;
  if (!obj.rules || typeof obj.rules.pointsPer !== 'object') return false;
  if (!Array.isArray(obj.hands)) return false;
  return obj.hands.every(h => h && TYPE_BY_ID[h.type]
    && Number.isInteger(h.dealer) && h.dealer >= 0 && h.dealer < PLAYER_COUNT
    && validateCounts(h.type, h.counts).ok);
}

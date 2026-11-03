// analysis.js — grup analizi: sıralama ve kişisel ceza karnesi. Saf fonksiyonlar; uygulama ve sunucu aynı kodu kullanır.
// Sunucu her oyunun küçük bir özetini (summarizeGame) saklar ve analizi özetlerden hesaplar (aggregate).
import { HAND_TYPES, TYPE_BY_ID, DEFAULT_RULES, gameTotals, handScores, outcomes, isValidGame } from './rules.js';
import { nameKey, resolveAlias } from './names.js';

export const SUMMARY_VERSION = 1;
export const MIN_RANKED_GAMES = 3; // sıralamaya girmek için gereken oyun
export const MIN_TYPE_HANDS = 3;   // "en çok zorlandığın" için bir türde gereken el
export const FAIR_SHARE = 0.25;    // dört oyuncuda adil pay

// Oyun başına özet: koltuk başına toplam, sonuç, King sayısı ve tür başına [el, alınan birim, puan].
export function summarizeGame(game) {
  const totals = gameTotals(game);
  const { bySeat } = outcomes(game);
  const threshold = game.rules.kingThreshold ?? DEFAULT_RULES.kingThreshold;
  const seats = game.players.map((name, i) => ({
    name: String(name).trim(), key: nameKey(name), total: totals[i], outcome: bySeat[i], kings: 0, t: {},
  }));
  for (const h of game.hands) {
    const scores = handScores(h, game.rules);
    seats.forEach((s, i) => {
      const e = s.t[h.type] || (s.t[h.type] = [0, 0, 0]);
      e[0] += 1;
      e[1] += h.counts[i];
      e[2] += scores[i];
      if (h.type === 'koz' && h.counts[i] >= threshold) s.kings += 1;
    });
  }
  return { v: SUMMARY_VERSION, id: game.id, at: game.finishedAt || game.createdAt, seats };
}

const byTime = summaries => [...summaries].sort((a, b) => String(a.at).localeCompare(String(b.at)));

function newPlayer(key) {
  const types = {};
  for (const t of HAND_TYPES) types[t.id] = { hands: 0, units: 0, points: 0 };
  return { key, games: 0, wins: 0, sum: 0, best: -Infinity, worst: Infinity, kings: 0, keys: new Set(), spell: new Map(), types };
}

function pickType(p, better) {
  let pick = null;
  for (const t of HAND_TYPES) {
    const s = p.types[t.id];
    if (!t.ceza || s.hands < MIN_TYPE_HANDS || !better(s.share, FAIR_SHARE)) continue;
    if (pick === null || better(s.share, p.types[pick].share)) pick = t.id;
  }
  return pick;
}

function finish(p) {
  const spellings = [...p.spell.entries()].sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last).map(([n]) => n);
  const types = {};
  for (const t of HAND_TYPES) {
    const s = p.types[t.id];
    types[t.id] = { ...s, share: s.hands ? s.units / (s.hands * TYPE_BY_ID[t.id].total) : null };
  }
  // Elle birleştirilen adlarda hedefin yazımı görünür ("Memo" → "Mehmet" ise "Mehmet"); yoksa en sık kullanılan yazım.
  const name = spellings.find(n => nameKey(n) === p.key) || spellings[0];
  const out = {
    key: p.key, name, spellings, keys: [...p.keys].sort(),
    games: p.games, wins: p.wins, winRate: p.wins / p.games, avgTotal: Math.round(p.sum / p.games),
    best: p.best, worst: p.worst, kings: p.kings, rank: null, types,
  };
  out.weakest = pickType(out, (a, b) => a > b);
  out.strongest = pickType(out, (a, b) => a < b);
  return out;
}

export function aggregate(summaries, { aliases = {} } = {}) {
  const list = byTime(summaries);
  const map = new Map();
  list.forEach((g, order) => {
    for (const s of g.seats) {
      const key = resolveAlias(s.key, aliases);
      const p = map.get(key) || newPlayer(key);
      p.games += 1;
      if (s.outcome !== 'sunk') p.wins += 1; // kazanmak = çıkmak ya da King yapmak
      p.sum += s.total;
      p.best = Math.max(p.best, s.total);
      p.worst = Math.min(p.worst, s.total);
      p.kings += s.kings;
      p.keys.add(s.key);
      const sp = p.spell.get(s.name) || { count: 0, last: -1 };
      p.spell.set(s.name, { count: sp.count + 1, last: order });
      for (const [type, [hands, units, points]] of Object.entries(s.t)) {
        if (!Object.hasOwn(p.types, type)) continue; // bilinmeyen tür; "__proto__" Object.prototype'a yazmasın
        const e = p.types[type];
        e.hands += hands;
        e.units += units;
        e.points += points;
      }
      map.set(key, p);
    }
  });
  const all = [...map.values()].map(finish);
  const ranked = all.filter(p => p.games >= MIN_RANKED_GAMES)
    .sort((a, b) => b.winRate - a.winRate || b.avgTotal - a.avgTotal || b.games - a.games || a.name.localeCompare(b.name, 'tr-TR'));
  ranked.forEach((p, i) => {
    const prev = ranked[i - 1];
    p.rank = prev && prev.winRate === p.winRate && prev.avgTotal === p.avgTotal ? prev.rank : i + 1;
  });
  const unranked = all.filter(p => p.games < MIN_RANKED_GAMES)
    .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name, 'tr-TR'));
  return {
    games: list.length,
    firstAt: list.length ? list[0].at : null,
    lastAt: list.length ? list[list.length - 1].at : null,
    players: [...ranked, ...unranked],
  };
}

export function analyze(games, opts) {
  return aggregate(games.filter(isValidGame).map(summarizeGame), opts);
}

// İki ad aynı masada oturmuşsa farklı kişilerdir; birleştirilemezler.
export function playedTogether(summaries, keyA, keyB, aliases = {}) {
  const a = resolveAlias(keyA, aliases);
  const b = resolveAlias(keyB, aliases);
  return summaries.some(g => {
    const keys = g.seats.map(s => resolveAlias(s.key, aliases));
    return keys.includes(a) && keys.includes(b);
  });
}

// roster.js — kayıtlı oyuncu listesi ve koltuk seçimi için saf yardımcılar.
import { nameKey, resolveAlias } from './names.js';

export const SEATS = 4;
export const ROSTER_CAP = 50;

// Türkçe karakter ve büyük/küçük harf farkı yok sayılır: "Çağrı" ile "Cagri" aynı oyuncu.
export const nameKeyOf = nameKey;

export function toggleSeat(selected, name, max = SEATS) {
  const key = nameKeyOf(name);
  const idx = selected.findIndex(s => nameKeyOf(s) === key);
  if (idx !== -1) return selected.filter((_, i) => i !== idx);
  if (selected.length >= max) return selected;
  return [...selected, String(name).trim()];
}

export function seatOf(selected, name) {
  const key = nameKeyOf(name);
  const i = selected.findIndex(s => nameKeyOf(s) === key);
  return i === -1 ? 0 : i + 1;
}

export function addToRoster(roster, name, cap = ROSTER_CAP) {
  const n = String(name).trim();
  if (!n) return { roster, added: false, error: 'İsim boş olamaz' };
  if (roster.some(r => nameKeyOf(r) === nameKeyOf(n))) return { roster, added: false, error: 'Bu isim zaten listede' };
  if (roster.length >= cap) return { roster, added: false, error: `En fazla ${cap} oyuncu kaydedilebilir` };
  return { roster: [...roster, n], added: true, name: n };
}

export function removeFromRoster(roster, name) {
  const key = nameKeyOf(name);
  return roster.filter(r => nameKeyOf(r) !== key);
}

export function ensureInRoster(roster, names) {
  let r = roster;
  for (const n of names) r = addToRoster(r, n).roster;
  return r;
}

// Şaka avansı: anahtarı `exemptKey` olan oyuncu masadaysa onun dışındaki her koltuğa `points`; masada değilse null.
// Grupta birleştirilmiş adlar (aliases) çözülür: farklı yazılmış aynı kişi de tanınır.
export function avansExcept(players, exemptKey, points, aliases = {}) {
  const root = resolveAlias(exemptKey, aliases);
  const exempt = players.map(p => resolveAlias(nameKeyOf(p), aliases) === root);
  return exempt.some(Boolean) ? exempt.map(x => (x ? 0 : points)) : null;
}

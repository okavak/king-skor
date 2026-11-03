// names.js — oyuncu adlarını telefonlar arasında eşleştiren anahtar. Saf fonksiyonlar; uygulama ve sunucu aynı kodu kullanır.

const FOLD = { ı: 'i', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ç: 'c', â: 'a', î: 'i', û: 'u' };

// "Çağrı", "cagri", " ÇAĞRI ", "Cagrı" → "cagri": büyük/küçük harf, Türkçe karakter, boşluk ve noktalama farkı yok sayılır.
export function nameKey(name) {
  const lower = String(name).trim().toLocaleLowerCase('tr-TR');
  const key = lower
    .replace(/[ışğüöçâîû]/g, c => FOLD[c])
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
  return key || lower; // yalnızca simgeden oluşan ad boş anahtara düşmesin
}

// Elle birleştirilen adlar: { memo: 'mehmet' }. Zincir köke kadar izlenir; döngüde ilk tekrar öncesinde durulur.
export function resolveAlias(key, aliases = {}) {
  const seen = new Set([key]);
  let cur = key;
  for (let i = 0; i < 16; i++) {
    const next = Object.hasOwn(aliases, cur) ? aliases[cur] : undefined; // "constructor" gibi adlar miras özelliğe düşmesin
    if (next === undefined || seen.has(next)) break;
    seen.add(next);
    cur = next;
  }
  return cur;
}

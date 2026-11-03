// groupcode.js — grup kodu: 8 karakter Crockford base32 (I, L, O, U yok), "ABCD-2345" biçiminde gösterilir.

export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 8;

const VALID = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

function clean(text) {
  const c = String(text).toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return VALID.test(c) ? c : null;
}

// Küçük harf, tire/boşluk ve O/0, I/L/1 karışıklığı tolere edilir. Bütün girdi kod değilse metindeki her tireli
// "xxxx-xxxx" parçası sırayla aday olur (grup adı da kod gibi görünebilir: "Aile-King"); sunucu hangisinin var olduğunu söyler.
export function codeCandidates(input) {
  if (input === null || input === undefined) return [];
  const whole = clean(input);
  if (whole) return [whole];
  const out = [];
  for (const m of String(input).matchAll(/([0-9a-z]{4})-([0-9a-z]{4})/gi)) {
    const c = clean(m[1] + m[2]);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

export function normalizeCode(input) {
  return codeCandidates(input)[0] ?? null;
}

export function formatCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// Davet metni: kod en başta, böylece yapıştırılan metinde (tek satırlık alan satır sonlarını silse de) ilk aday gerçek koddur.
export function inviteText({ code, name }) {
  return `King Skor grup kodu: ${formatCode(code)}\nGrup: ${name}\nKatılmak için uygulamada Ayarlar → Grup → Gruba katıl'a bu mesajı yapıştırın.\nUygulama: https://okavak.github.io/king-skor/`;
}

// 256 bayt değeri 32'ye tam bölünür: her harf eşit olasılıklı.
export function generateCode(fill = bytes => crypto.getRandomValues(bytes)) {
  const bytes = fill(new Uint8Array(CODE_LENGTH));
  return Array.from(bytes, b => CODE_ALPHABET[b % 32]).join('');
}

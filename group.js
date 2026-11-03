// group.js — ortak grup kaydının uygulama tarafı: üyelik, gönderim sırası (outbox) ve son analizin çevrimdışı kopyası.
// Ağ hiçbir zaman beklenmez: her çağrı zaman aşımlıdır ve sonuç { ok, ... } olarak döner, istisna fırlatmaz.
import { codeCandidates, normalizeAdminKey } from './groupcode.js';

export const GROUP_KEYS = { group: 'king:v1:group', outbox: 'king:v1:outbox', analysis: 'king:v1:analysis', admin: 'king:v1:groupAdmin' };

const NETWORK_ERROR = 'İnternete bağlanılamadı';
const NOT_FOUND = 'Bu kodla bir grup bulunamadı';
const DROP = new Set([400, 413]); // sunucu bu kaydı hiç kabul etmeyecek: sırada tutmanın anlamı yok

export function createGroupClient({ storage, fetch, apiBase, timeoutMs = 10000 }) {
  const base = String(apiBase || '').replace(/\/+$/, '');
  const enabled = Boolean(base);

  function read(key, fallback) {
    try {
      const raw = storage.getItem(key);
      const v = raw === null || raw === undefined ? null : JSON.parse(raw);
      return v ?? fallback;
    } catch {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
    } catch { /* depolama dolu ya da kapalı: sıra bu oturumda kaybolabilir */ }
  }
  const outbox = () => {
    const list = read(GROUP_KEYS.outbox, []);
    return Array.isArray(list) ? list : [];
  };

  async function request(method, path, body, { auth } = {}) {
    if (!enabled) return { ok: false, status: 0, error: 'Grup sunucusu ayarlı değil' };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const init = { method, signal: ctrl.signal, headers: {} };
      if (auth) init.headers.Authorization = auth;
      if (body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      const res = await fetch(base + path, init);
      let data = null;
      try { data = await res.json(); } catch { /* gövdesiz yanıt */ }
      if (res.ok) return { ok: true, status: res.status, data };
      return { ok: false, status: res.status, error: data?.error || 'Sunucu hatası' };
    } catch {
      return { ok: false, status: 0, error: NETWORK_ERROR };
    } finally {
      clearTimeout(timer);
    }
  }

  function current() {
    const g = read(GROUP_KEYS.group, null);
    return g && typeof g.code === 'string' && typeof g.name === 'string' ? { code: g.code, name: g.name } : null;
  }
  const groupPath = () => `/groups/${current().code}`;

  // Yönetici anahtarı yalnızca kendi grubunda geçerli; başka gruba geçince kullanılmaz.
  function adminKey() {
    const a = read(GROUP_KEYS.admin, null);
    const g = current();
    return a && g && a.code === g.code && typeof a.key === 'string' ? a.key : null;
  }
  const adminAuth = () => (adminKey() ? `Bearer ${adminKey()}` : undefined);

  function updateCache(patch) {
    const c = cached();
    if (c) write(GROUP_KEYS.analysis, { ...c, ...patch });
  }

  function cached() {
    const c = read(GROUP_KEYS.analysis, null);
    const g = current();
    return c && g && c.group?.code === g.code ? c : null;
  }

  let inflight = null;
  async function sendAll(getGame) {
    let sent = 0;
    for (;;) {
      const [entry] = outbox();
      if (!entry || !current()) break;
      let res = null;
      if (entry.op === 'put') {
        const game = getGame(entry.id);
        if (game) res = await request('PUT', `${groupPath()}/games/${encodeURIComponent(entry.id)}`, game);
      } else {
        res = await request('DELETE', `${groupPath()}/games/${encodeURIComponent(entry.id)}`);
      }
      if (res && !res.ok && !DROP.has(res.status)) break; // ağ yok, sunucu hatası: sonra yeniden denenir
      if (res?.ok) sent += 1;
      // Yalnızca gönderilen kayıt düşer: istek sürerken aynı oyun yeniden sıraya girdiyse yeni kayıt kalır.
      write(GROUP_KEYS.outbox, outbox().filter(e => e.n !== entry.n));
    }
    return { sent, kept: outbox().length };
  }

  return {
    enabled,
    current,
    cached,
    pending: () => outbox().length,

    async create(name) {
      const r = await request('POST', '/groups', { name });
      if (!r.ok) return { ok: false, error: r.error };
      const group = { code: r.data.code, name: r.data.name };
      write(GROUP_KEYS.group, group);
      write(GROUP_KEYS.analysis, null);
      return { ok: true, group };
    },

    // Yapıştırılan metinde birden çok kod biçimli parça olabilir: bulunana kadar sırayla denenir (en fazla 4).
    async lookup(input) {
      const codes = codeCandidates(input).slice(0, 4);
      if (!codes.length) return { ok: false, error: 'Kod 8 karakter olmalı (ör. ABCD-2345)' };
      for (const code of codes) {
        const r = await request('GET', `/groups/${code}`);
        if (r.ok) return { ok: true, group: r.data };
        if (r.status !== 404) return { ok: false, error: r.error };
      }
      return { ok: false, error: NOT_FOUND };
    },

    join(group) {
      if (current()?.code !== group.code) write(GROUP_KEYS.admin, null);
      write(GROUP_KEYS.group, { code: group.code, name: group.name });
      write(GROUP_KEYS.analysis, null);
    },

    isAdmin: () => adminKey() !== null,

    async adminLogin(input) {
      const key = normalizeAdminKey(input);
      if (!key) return { ok: false, error: 'Anahtar 16 karakter olmalı (ör. ABCD-2345-EFGH-6789)' };
      if (!current()) return { ok: false, error: 'Bu telefon bir gruba katılmamış' };
      const r = await request('GET', `${groupPath()}/admin`, undefined, { auth: `Bearer ${key}` });
      if (r.ok) {
        write(GROUP_KEYS.admin, { code: current().code, key });
        return { ok: true };
      }
      return { ok: false, error: r.status === 401 || r.status === 403 ? 'Yönetici anahtarı yanlış' : r.error };
    },

    adminLogout() {
      write(GROUP_KEYS.admin, null);
    },

    async removeMember(key) {
      const r = await request('DELETE', `${groupPath()}/members/${encodeURIComponent(key)}`, undefined, { auth: adminAuth() });
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, members: r.data.members };
    },

    leave() {
      for (const k of Object.values(GROUP_KEYS)) write(k, null);
    },

    enqueue(op, id) {
      const list = outbox();
      const n = list.reduce((max, e) => Math.max(max, e.n || 0), 0) + 1;
      write(GROUP_KEYS.outbox, [...list.filter(e => e.id !== id), { op, id, n }]);
    },

    // Aynı anda tek gönderim; ikinci çağrı ilkinin sonucunu bekler.
    flush(getGame) {
      if (!enabled || !current()) return Promise.resolve({ sent: 0, kept: outbox().length });
      if (!inflight) inflight = sendAll(getGame).finally(() => { inflight = null; });
      return inflight;
    },

    async refresh() {
      if (!current()) return { ok: false, error: 'Bu telefon bir gruba katılmamış' };
      const r = await request('GET', `${groupPath()}/analysis`);
      if (!r.ok) return { ok: false, error: r.status === 404 ? NOT_FOUND : r.error };
      write(GROUP_KEYS.analysis, r.data);
      if (r.data?.group?.name) write(GROUP_KEYS.group, { code: current().code, name: r.data.group.name });
      return { ok: true, data: r.data };
    },

    async merge(fromKey, toKey) {
      const r = await request('PUT', `${groupPath()}/aliases`, { from: fromKey, to: toKey }, { auth: adminAuth() });
      if (!r.ok) return { ok: false, error: r.error };
      updateCache({ aliases: r.data.aliases });
      return { ok: true, aliases: r.data.aliases };
    },

    async split(fromKey) {
      const r = await request('DELETE', `${groupPath()}/aliases/${encodeURIComponent(fromKey)}`, undefined, { auth: adminAuth() });
      if (!r.ok) return { ok: false, error: r.error };
      updateCache({ aliases: r.data.aliases });
      return { ok: true, aliases: r.data.aliases };
    },
  };
}

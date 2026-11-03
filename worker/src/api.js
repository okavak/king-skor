// api.js — King Skor ortak grup kaydı (Cloudflare Worker + D1). Uygulamayla aynı saf modülleri kullanır.
// Grup kodu erişim anahtarıdır; hesap yok. Hata gövdeleri { error: "<Türkçe mesaj>" }.
import { HAND_TYPES, isValidGame } from '../../rules.js';
import { nameKey, resolveAlias } from '../../names.js';
import { normalizeCode, generateCode, normalizeAdminKey, ADMIN_KEY_LENGTH } from '../../groupcode.js';
import { summarizeGame, aggregate, playedTogether, SUMMARY_VERSION } from '../../analysis.js';

export const ALLOWED_ORIGINS = ['https://okavak.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080'];
const MAX_BODY = 65536;
const MAX_NAME = 40;
const GAME_ID = /^[a-z0-9]{6,40}$/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function corsHeaders(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (ALLOWED_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

export async function handle(request, env, { now = () => new Date() } = {}) {
  const origin = request.headers.get('Origin') || '';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  let status, body;
  try {
    ({ status, body } = await route(request, env, now));
  } catch (e) {
    if (e instanceof HttpError) ({ status, body } = { status: e.status, body: { error: e.message } });
    else {
      console.error(e);
      ({ status, body } = { status: 500, body: { error: 'Sunucu hatası' } });
    }
  }
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) } });
}

async function route(request, env, now) {
  let parts;
  try { parts = new URL(request.url).pathname.split('/').filter(Boolean).map(decodeURIComponent); }
  catch { throw new HttpError(400, 'Geçersiz adres'); }
  const method = request.method;
  if (parts[0] !== 'groups') throw new HttpError(404, 'Bulunamadı');
  if (parts.length === 1 && method === 'POST') return createGroup(request, env, now);

  const code = normalizeCode(parts[1] ?? '');
  const group = code && await env.DB.prepare('SELECT code, name FROM groups WHERE code = ?').bind(code).first();
  if (!group) throw new HttpError(404, 'Grup bulunamadı');
  const [, , section, item] = parts;

  if (parts.length === 2 && method === 'GET') return groupInfo(env, group);
  if (section === 'admin' && parts.length === 3 && method === 'GET') { await requireAdmin(request, env, group); return { status: 200, body: { ok: true } }; }
  if (section === 'members' && parts.length === 3 && method === 'PUT') { await requireAdmin(request, env, group); return putMembers(request, env, group, now); }
  if (section === 'members' && parts.length === 4 && method === 'DELETE') { await requireAdmin(request, env, group); return deleteMember(env, group, item); }
  if (section === 'games' && parts.length === 4 && method === 'PUT') return putGame(request, env, group, item, now);
  if (section === 'games' && parts.length === 4 && method === 'DELETE') return deleteGame(env, group, item, now);
  if (section === 'analysis' && parts.length === 3 && method === 'GET') return groupAnalysis(env, group, now);
  if (section === 'aliases' && parts.length === 3 && method === 'PUT') { await requireAdmin(request, env, group); return putAlias(request, env, group, now); }
  if (section === 'aliases' && parts.length === 4 && method === 'DELETE') { await requireAdmin(request, env, group); return deleteAlias(env, group, item); }
  throw new HttpError(404, 'Bulunamadı');
}

async function readJson(request) {
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) throw new HttpError(413, 'Kayıt çok büyük');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY) throw new HttpError(413, 'Kayıt çok büyük');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Geçersiz JSON'); }
}

async function sha256hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// İsim birleştirme ve resmi liste yalnızca yöneticinin: "Authorization: Bearer <anahtar>". Sunucu yalnızca özeti saklar.
async function requireAdmin(request, env, group) {
  const m = /^Bearer\s+(\S.*)$/i.exec(request.headers.get('Authorization') || '');
  if (!m) throw new HttpError(401, 'Bu işlemi yalnızca grup yöneticisi yapabilir');
  const key = normalizeAdminKey(m[1]);
  const row = await env.DB.prepare('SELECT admin_hash FROM groups WHERE code = ?').bind(group.code).first();
  if (!row?.admin_hash) throw new HttpError(403, 'Bu grubun yöneticisi tanımlı değil');
  if (!key || !sameText(await sha256hex(key), row.admin_hash)) throw new HttpError(403, 'Yönetici anahtarı yanlış');
}

// Yönetici anahtarı yalnızca bu yanıtta bir kez görünür.
async function createGroup(request, env, now) {
  const body = await readJson(request);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > MAX_NAME) throw new HttpError(400, 'Grup adı 1 ile 40 karakter arasında olmalı');
  const adminKey = generateCode(undefined, ADMIN_KEY_LENGTH);
  const adminHash = await sha256hex(adminKey);
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    const r = await env.DB.prepare('INSERT OR IGNORE INTO groups (code, name, created_at, admin_hash) VALUES (?, ?, ?, ?)')
      .bind(code, name, now().toISOString(), adminHash).run();
    if (r.meta.changes === 1) return { status: 201, body: { code, name, adminKey } };
  }
  throw new Error('grup kodu üretilemedi');
}

async function loadMembers(env, code) {
  const { results } = await env.DB.prepare('SELECT key, name FROM members WHERE group_code = ? ORDER BY key').bind(code).all();
  return results.map(r => ({ key: r.key, name: r.name }));
}

async function putMembers(request, env, group, now) {
  const body = await readJson(request);
  const names = Array.isArray(body?.names) ? body.names : null;
  if (!names || !names.length || names.length > 60) throw new HttpError(400, 'İsim listesi 1 ile 60 isim arasında olmalı');
  const clean = names.map(n => (typeof n === 'string' ? n.trim() : ''));
  if (clean.some(n => !n || n.length > MAX_NAME)) throw new HttpError(400, 'Her isim 1 ile 40 karakter arasında olmalı');
  const t = now().toISOString();
  await env.DB.batch(clean.map(n => env.DB.prepare(`INSERT INTO members (group_code, key, name, added_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (group_code, key) DO UPDATE SET name = excluded.name`).bind(group.code, nameKey(n), n, t)));
  return { status: 200, body: { members: await loadMembers(env, group.code) } };
}

async function deleteMember(env, group, key) {
  await env.DB.prepare('DELETE FROM members WHERE group_code = ? AND key = ?').bind(group.code, key).run();
  return { status: 200, body: { members: await loadMembers(env, group.code) } };
}

async function groupInfo(env, group) {
  const games = await env.DB.prepare('SELECT COUNT(*) AS n FROM games WHERE group_code = ? AND deleted = 0').bind(group.code).first('n');
  return { status: 200, body: { code: group.code, name: group.name, games } };
}

function validGame(game, id) {
  return isValidGame(game)
    && game.id === id
    && typeof game.finishedAt === 'string'
    && game.players.every(p => p.trim().length > 0 && p.trim().length <= MAX_NAME)
    && HAND_TYPES.every(t => Number.isFinite(game.rules.pointsPer[t.id]));
}

async function putGame(request, env, group, id, now) {
  if (!GAME_ID.test(id)) throw new HttpError(400, 'Geçersiz oyun kimliği');
  const game = await readJson(request);
  if (!validGame(game, id)) throw new HttpError(400, 'Geçersiz oyun kaydı');
  const summary = summarizeGame(game);
  // Aynı kimlik güncellenir ("Son eli düzelt", yeniden deneme, yedekten geri yükleme): ikinci kayıt oluşmaz.
  await env.DB.prepare(`INSERT INTO games (group_code, id, data, summary, summary_v, finished_at, updated_at, deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT (group_code, id) DO UPDATE SET data = excluded.data, summary = excluded.summary, summary_v = excluded.summary_v,
        finished_at = excluded.finished_at, updated_at = excluded.updated_at, deleted = 0`)
    .bind(group.code, id, JSON.stringify(game), JSON.stringify(summary), SUMMARY_VERSION, game.finishedAt, now().toISOString()).run();
  return { status: 200, body: { ok: true } };
}

async function deleteGame(env, group, id, now) {
  if (!GAME_ID.test(id)) throw new HttpError(400, 'Geçersiz oyun kimliği');
  await env.DB.prepare('UPDATE games SET deleted = 1, updated_at = ? WHERE group_code = ? AND id = ?')
    .bind(now().toISOString(), group.code, id).run();
  return { status: 200, body: { ok: true } };
}

async function loadAliases(env, code) {
  const { results } = await env.DB.prepare('SELECT from_key, to_key FROM aliases WHERE group_code = ? ORDER BY from_key').bind(code).all();
  return Object.fromEntries(results.map(r => [r.from_key, r.to_key]));
}

// Özetler küçük tutulur ki analiz Worker'ın CPU sınırına sığsın. Sürümü eski özetler tam kayıttan yeniden üretilir.
async function loadSummaries(env, code) {
  const { results } = await env.DB.prepare('SELECT id, summary, summary_v FROM games WHERE group_code = ? AND deleted = 0').bind(code).all();
  const summaries = results.filter(r => r.summary_v === SUMMARY_VERSION).map(r => JSON.parse(r.summary));
  if (summaries.length === results.length) return summaries;
  const stale = (await env.DB.prepare('SELECT id, data FROM games WHERE group_code = ? AND deleted = 0 AND summary_v != ?')
    .bind(code, SUMMARY_VERSION).all()).results;
  const rebuilt = stale.map(r => summarizeGame(JSON.parse(r.data)));
  await env.DB.batch(stale.map((r, i) => env.DB.prepare('UPDATE games SET summary = ?, summary_v = ? WHERE group_code = ? AND id = ?')
    .bind(JSON.stringify(rebuilt[i]), SUMMARY_VERSION, code, r.id)));
  return summaries.concat(rebuilt);
}

async function groupAnalysis(env, group, now) {
  const [summaries, aliases, members] = await Promise.all([loadSummaries(env, group.code), loadAliases(env, group.code), loadMembers(env, group.code)]);
  return {
    status: 200,
    body: {
      group: { code: group.code, name: group.name },
      analysis: aggregate(summaries, { aliases, members }),
      aliases, members, at: now().toISOString(),
    },
  };
}

async function putAlias(request, env, group, now) {
  const body = await readJson(request);
  const from = typeof body?.from === 'string' ? nameKey(body.from) : '';
  const to = typeof body?.to === 'string' ? nameKey(body.to) : '';
  if (!from || !to) throw new HttpError(400, 'İki isim de gerekli');
  if (from === to) throw new HttpError(400, 'Bu iki isim zaten aynı kişi');
  const aliases = await loadAliases(env, group.code);
  const root = resolveAlias(to, aliases);
  // Hedef köke çözülür; kökün dışa bağı olmadığından döngü oluşamaz. Zaten aynı kişiyse değişiklik yok.
  if (resolveAlias(from, aliases) === root) return { status: 200, body: { aliases } };
  // "from" (ve ona bağlı adlar) kökle aynı masada oturduysa farklı kişilerdir.
  const without = { ...aliases };
  delete without[from];
  if (playedTogether(await loadSummaries(env, group.code), from, root, without)) {
    throw new HttpError(409, 'Bu iki isim aynı oyunda birlikte oynamış; aynı kişi olamaz');
  }
  const t = now().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO aliases (group_code, from_key, to_key, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT (group_code, from_key) DO UPDATE SET to_key = excluded.to_key, updated_at = excluded.updated_at`)
      .bind(group.code, from, root, t),
    env.DB.prepare('UPDATE aliases SET to_key = ?, updated_at = ? WHERE group_code = ? AND to_key = ?').bind(root, t, group.code, from),
  ]);
  return { status: 200, body: { aliases: await loadAliases(env, group.code) } };
}

async function deleteAlias(env, group, from) {
  await env.DB.prepare('DELETE FROM aliases WHERE group_code = ? AND from_key = ?').bind(group.code, from).run();
  return { status: 200, body: { aliases: await loadAliases(env, group.code) } };
}

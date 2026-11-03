import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGroupClient } from '../group.js';

const API = 'https://api.test';
const GROUP = { code: 'ABCD2345', name: 'Cuma Kingcileri' };

function fakeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
}

// Sırayla yanıt veren sahte fetch: { status, body } | 'offline' | (url, init) => yanıt. İstekleri kaydeder.
function fakeFetch(...responses) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', body: init.body === undefined ? undefined : JSON.parse(init.body) });
    fn.auth.push(init.headers?.Authorization ?? null);
    let next = responses.shift();
    if (typeof next === 'function') next = await next(url, init);
    if (next === undefined) throw new Error(`unexpected request ${url}`);
    if (next === 'offline') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  };
  fn.calls = calls;
  fn.auth = [];
  return fn;
}

function client(fetch, opts = {}) {
  return createGroupClient({ storage: fakeStorage(), fetch, apiBase: API, ...opts });
}

const games = { g1: { id: 'g1', players: ['Ali'] }, g2: { id: 'g2', players: ['Veli'] } };
const getGame = id => games[id] || null;

test('lookup normalizes the code and reports unknown groups and malformed codes', async () => {
  const fetch = fakeFetch({ body: { ...GROUP, games: 3 } }, { status: 404, body: { error: 'Grup bulunamadı' } });
  const c = client(fetch);
  assert.deepEqual(await c.lookup('abcd-2345'), { ok: true, group: { ...GROUP, games: 3 } });
  assert.deepEqual(fetch.calls[0], { url: `${API}/groups/ABCD2345`, method: 'GET', body: undefined });
  assert.deepEqual(await c.lookup('zzzz-zzzz'), { ok: false, error: 'Bu kodla bir grup bulunamadı' });
  assert.deepEqual(await c.lookup('12'), { ok: false, error: 'Kod 8 karakter olmalı (ör. ABCD-2345)' });
  assert.equal(fetch.calls.length, 2, 'a malformed code never reaches the server');
  assert.equal(c.current(), null, 'looking a group up does not join it');
});

test('create saves membership; a refused name keeps the phone outside any group', async () => {
  const fetch = fakeFetch({ status: 400, body: { error: 'Grup adı 1 ile 40 karakter arasında olmalı' } }, { status: 201, body: GROUP });
  const c = client(fetch);
  assert.deepEqual(await c.create(''), { ok: false, error: 'Grup adı 1 ile 40 karakter arasında olmalı' });
  assert.equal(c.current(), null);
  assert.deepEqual(await c.create('Cuma Kingcileri'), { ok: true, group: GROUP });
  assert.deepEqual(fetch.calls[1], { url: `${API}/groups`, method: 'POST', body: { name: 'Cuma Kingcileri' } });
  assert.deepEqual(c.current(), GROUP);
});

test('flush sends queued puts and deletes in order, the latest op per game winning', async () => {
  const fetch = fakeFetch({}, {});
  const c = client(fetch);
  c.join(GROUP);
  c.enqueue('put', 'g1');
  c.enqueue('put', 'g2');
  c.enqueue('delete', 'g1');
  assert.equal(c.pending(), 2);
  assert.deepEqual(await c.flush(getGame), { sent: 2, kept: 0 });
  assert.deepEqual(fetch.calls, [
    { url: `${API}/groups/ABCD2345/games/g2`, method: 'PUT', body: games.g2 },
    { url: `${API}/groups/ABCD2345/games/g1`, method: 'DELETE', body: undefined },
  ]);
  assert.equal(c.pending(), 0);
});

test('flush keeps entries when offline or the server fails, and stops at the first failure', async () => {
  const fetch = fakeFetch('offline', { status: 500, body: { error: 'Sunucu hatası' } }, {}, {});
  const c = client(fetch);
  c.join(GROUP);
  c.enqueue('put', 'g1');
  c.enqueue('put', 'g2');
  assert.deepEqual(await c.flush(getGame), { sent: 0, kept: 2 });
  assert.deepEqual(await c.flush(getGame), { sent: 0, kept: 2 });
  assert.equal(fetch.calls.length, 2, 'each failed flush stopped after one request');
  assert.deepEqual(await c.flush(getGame), { sent: 2, kept: 0 });
});

test('flush drops entries the server rejects and puts whose game is gone', async () => {
  const fetch = fakeFetch({ status: 400, body: { error: 'Geçersiz oyun kaydı' } }, { status: 413, body: { error: 'Kayıt çok büyük' } }, {});
  const c = client(fetch);
  c.join(GROUP);
  for (const id of ['gone', 'bad', 'big', 'g1']) c.enqueue('put', id);
  const lookup = id => (id === 'gone' ? null : { id });
  assert.deepEqual(await c.flush(lookup), { sent: 1, kept: 0 });
  assert.deepEqual(fetch.calls.map(x => x.url.split('/').pop()), ['bad', 'big', 'g1']);
  assert.equal(c.pending(), 0);
});

test('a game queued again while its upload is in flight is sent again, not lost', async () => {
  let c;
  const fetch = fakeFetch(() => { c.enqueue('put', 'g1'); return {}; }, {});
  c = client(fetch);
  c.join(GROUP);
  c.enqueue('put', 'g1');
  assert.deepEqual(await c.flush(getGame), { sent: 2, kept: 0 });
  assert.equal(fetch.calls.length, 2);
  assert.equal(c.pending(), 0);
});

test('a hanging request is abandoned after the timeout and the entry stays queued', async () => {
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  const c = client(fakeFetch(hang), { timeoutMs: 20 });
  c.join(GROUP);
  c.enqueue('put', 'g1');
  assert.deepEqual(await c.flush(getGame), { sent: 0, kept: 1 });
});

test('refresh caches the analysis for offline use; leave clears group, queue and cache', async () => {
  const data = { group: GROUP, analysis: { games: 2, players: [] }, aliases: { memo: 'mehmet' }, at: '2026-11-03T12:00:00.000Z' };
  const c = client(fakeFetch({ body: data }, 'offline'));
  c.join(GROUP);
  assert.deepEqual(await c.refresh(), { ok: true, data });
  assert.deepEqual(c.cached(), data);
  assert.deepEqual(await c.refresh(), { ok: false, error: 'İnternete bağlanılamadı' });
  assert.deepEqual(c.cached(), data, 'the last analysis survives a failed refresh');
  c.enqueue('put', 'g1');
  c.leave();
  assert.deepEqual([c.current(), c.pending(), c.cached()], [null, 0, null]);
});

test('joining another group drops the previous group analysis', async () => {
  const data = { group: GROUP, analysis: { games: 2, players: [] }, aliases: {}, at: '2026-11-03T12:00:00.000Z' };
  const c = client(fakeFetch({ body: data }));
  c.join(GROUP);
  await c.refresh();
  c.join({ code: 'WXYZ6789', name: 'Pazar' });
  assert.equal(c.cached(), null);
});

test('merge and split call the alias endpoints with encoded keys and update the cached aliases', async () => {
  const data = { group: GROUP, analysis: { games: 0, players: [] }, aliases: {}, at: '2026-11-03T12:00:00.000Z' };
  const fetch = fakeFetch({ body: data }, { body: { aliases: { memo: 'mehmet' } } },
    { status: 409, body: { error: 'Bu iki isim aynı oyunda birlikte oynamış; aynı kişi olamaz' } }, { body: { aliases: {} } });
  const c = client(fetch);
  c.join(GROUP);
  await c.refresh();
  assert.deepEqual(await c.merge('memo', 'mehmet'), { ok: true, aliases: { memo: 'mehmet' } });
  assert.deepEqual(fetch.calls[1], { url: `${API}/groups/ABCD2345/aliases`, method: 'PUT', body: { from: 'memo', to: 'mehmet' } });
  assert.deepEqual(c.cached().aliases, { memo: 'mehmet' });
  assert.deepEqual(await c.merge('ali', 'veli'), { ok: false, error: 'Bu iki isim aynı oyunda birlikte oynamış; aynı kişi olamaz' });
  assert.deepEqual(await c.split('😀'), { ok: true, aliases: {} });
  assert.deepEqual(fetch.calls[3], { url: `${API}/groups/ABCD2345/aliases/%F0%9F%98%80`, method: 'DELETE', body: undefined });
  assert.deepEqual(c.cached().aliases, {});
});

test('a client without a server address never calls fetch', async () => {
  const fetch = () => { throw new Error('must not be called'); };
  const c = createGroupClient({ storage: fakeStorage(), fetch, apiBase: '' });
  assert.equal(c.enabled, false);
  assert.deepEqual(await c.lookup('ABCD-2345'), { ok: false, error: 'Grup sunucusu ayarlı değil' });
  c.join(GROUP);
  c.enqueue('put', 'g1');
  assert.deepEqual(await c.flush(getGame), { sent: 0, kept: 1 });
});

test('lookup tries each code in a pasted text until a group is found', async () => {
  const fetch = fakeFetch({ status: 404, body: { error: 'Grup bulunamadı' } }, { body: { ...GROUP, games: 3 } });
  const c = client(fetch);
  assert.deepEqual(await c.lookup('Aile-King grubu, kod: ABCD-2345'), { ok: true, group: { ...GROUP, games: 3 } });
  assert.deepEqual(fetch.calls.map(x => x.url), [`${API}/groups/A11EK1NG`, `${API}/groups/ABCD2345`]);
});

const KEY = 'ABCD2345EFGH6789';

test('adminLogin keeps the key only when the server accepts it, and merges send it', async () => {
  const fetch = fakeFetch({ status: 403, body: { error: 'Yönetici anahtarı yanlış' } }, { body: { ok: true } }, { body: { aliases: { memo: 'mehmet' } } });
  const c = client(fetch);
  c.join(GROUP);
  assert.deepEqual(await c.adminLogin('ZZZZ-ZZZZ-ZZZZ-ZZZZ'), { ok: false, error: 'Yönetici anahtarı yanlış' });
  assert.equal(c.isAdmin(), false);
  assert.deepEqual(await c.adminLogin('abcd-2345-efgh-6789'), { ok: true });
  assert.equal(c.isAdmin(), true);
  assert.deepEqual(fetch.calls[1], { url: `${API}/groups/ABCD2345/admin`, method: 'GET', body: undefined });
  assert.equal(fetch.auth[1], `Bearer ${KEY}`);
  await c.merge('memo', 'mehmet');
  assert.equal(fetch.auth[2], `Bearer ${KEY}`);
});

test('adminLogin rejects a malformed key without asking the server', async () => {
  const fetch = fakeFetch();
  const c = client(fetch);
  c.join(GROUP);
  assert.deepEqual(await c.adminLogin('1234'), { ok: false, error: 'Anahtar 16 karakter olmalı (ör. ABCD-2345-EFGH-6789)' });
  assert.equal(fetch.calls.length, 0);
});

test('without the admin key a merge reports that only the admin can do it, and no key is sent', async () => {
  const fetch = fakeFetch({ status: 401, body: { error: 'Bu işlemi yalnızca grup yöneticisi yapabilir' } });
  const c = client(fetch);
  c.join(GROUP);
  assert.deepEqual(await c.merge('memo', 'mehmet'), { ok: false, error: 'Bu işlemi yalnızca grup yöneticisi yapabilir' });
  assert.equal(fetch.auth[0], null);
});

test('removeMember deletes from the official list with the admin key', async () => {
  const fetch = fakeFetch({ body: { ok: true } }, { body: { members: [{ key: 'onur', name: 'Onur' }] } });
  const c = client(fetch);
  c.join(GROUP);
  await c.adminLogin(KEY);
  assert.deepEqual(await c.removeMember('zeynel'), { ok: true, members: [{ key: 'onur', name: 'Onur' }] });
  assert.deepEqual(fetch.calls[1], { url: `${API}/groups/ABCD2345/members/zeynel`, method: 'DELETE', body: undefined });
  assert.equal(fetch.auth[1], `Bearer ${KEY}`);
});

test('the admin key belongs to its group: leaving or joining another group drops it', async () => {
  const c = client(fakeFetch({ body: { ok: true } }));
  c.join(GROUP);
  await c.adminLogin(KEY);
  c.join({ code: 'WXYZ6789', name: 'Pazar' });
  assert.equal(c.isAdmin(), false);
  c.join(GROUP);
  c.leave();
  assert.equal(c.isAdmin(), false);
});


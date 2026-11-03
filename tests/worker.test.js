import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { handle } from '../worker/src/api.js';
import { createFakeD1 } from './helpers/fake-d1.js';
import { createGame, makeHand, withHand, DEFAULT_RULES } from '../rules.js';
import { SUMMARY_VERSION } from '../analysis.js';

const migrations = new URL('../worker/migrations/', import.meta.url);
const schema = readdirSync(migrations).filter(f => f.endsWith('.sql')).sort().map(f => readFileSync(new URL(f, migrations), 'utf8')).join('\n');
const NOW = new Date('2026-11-03T12:00:00.000Z');

function setup() {
  const DB = createFakeD1(schema);
  const env = { DB };
  const keys = new Map(); // grup kodu → yönetici anahtarı
  async function call(method, path, body, origin = 'http://localhost:8080', extra = {}) {
    const init = { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...extra } };
    if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
    const res = await handle(new Request(`https://api.test${path}`, init), env, { now: () => NOW });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  }
  async function group(name = 'Cuma Kingcileri') {
    const { code, adminKey } = (await call('POST', '/groups', { name })).body;
    keys.set(code, adminKey);
    return code;
  }
  // Yönetici isteği: grubun anahtarıyla
  const admin = (code, method, path, body) => call(method, `/groups/${code}${path}`, body, undefined, { Authorization: `Bearer ${keys.get(code)}` });
  return { DB, call, group, admin, keys };
}

function game(players, hands, finishedAt = '2026-11-02T22:00:00.000Z') {
  let g = createGame({ players, rules: { ...DEFAULT_RULES, enforceQuotas: false }, now: new Date('2026-11-02T20:00:00Z') });
  hands.forEach(([type, counts], i) => { g = withHand(g, makeHand(type, i % 4, counts)); });
  return { ...g, finishedAt };
}

test('creates a group and finds it by a loosely typed code', async () => {
  const { call } = setup();
  const created = await call('POST', '/groups', { name: '  Cuma Kingcileri  ' });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, 'Cuma Kingcileri');
  assert.match(created.body.code, /^[0-9A-HJKMNP-TV-Z]{8}$/);
  const loose = `${created.body.code.slice(0, 4)}-${created.body.code.slice(4)}`.toLowerCase();
  const found = await call('GET', `/groups/${loose}`);
  assert.equal(found.status, 200);
  assert.deepEqual(found.body, { code: created.body.code, name: 'Cuma Kingcileri', games: 0 });
  assert.equal((await call('GET', '/groups/ZZZZZZZZ')).status, 404);
  assert.equal((await call('GET', '/groups/ZZZZZZZZ')).body.error, 'Grup bulunamadı');
  assert.equal((await call('POST', '/groups', { name: '   ' })).status, 400);
  assert.equal((await call('POST', '/groups', { name: 'x'.repeat(41) })).status, 400);
});

test('PUT is an upsert: the same game twice counts once and the latest data wins', async () => {
  const { call, group } = setup();
  const code = await group();
  const first = game(['Ali', 'Ayşe', 'Mehmet', 'Zeynep'], [['kiz', [4, 0, 0, 0]]]);
  assert.equal((await call('PUT', `/groups/${code}/games/${first.id}`, first)).status, 200);
  assert.equal((await call('PUT', `/groups/${code}/games/${first.id}`, first)).status, 200);
  const fixed = { ...first, hands: [makeHand('kiz', 0, [0, 4, 0, 0])], finishedAt: '2026-11-02T22:05:00.000Z' };
  assert.equal((await call('PUT', `/groups/${code}/games/${first.id}`, fixed)).status, 200);
  assert.equal((await call('GET', `/groups/${code}`)).body.games, 1);
  const { analysis } = (await call('GET', `/groups/${code}/analysis`)).body;
  assert.equal(analysis.games, 1);
  assert.equal(analysis.players.find(p => p.key === 'ali').avgTotal, 0);
  assert.equal(analysis.players.find(p => p.key === 'ayse').avgTotal, -400);
});

test('PUT rejects invalid games, id mismatches, unfinished games, bad names or points, big bodies and unknown groups', async () => {
  const { call, group } = setup();
  const code = await group();
  const g = game(['Ali', 'Ayşe', 'Mehmet', 'Zeynep'], [['kiz', [4, 0, 0, 0]]]);
  const put = (body, id = g.id) => call('PUT', `/groups/${code}/games/${id}`, body);
  assert.equal((await put({ id: g.id, junk: true })).status, 400);
  assert.equal((await put('{nope')).status, 400);
  assert.equal((await put(g, 'zzzzzz1')).status, 400);
  assert.equal((await put(g, 'BAD ID!')).status, 400);
  assert.equal((await put({ ...g, finishedAt: null })).status, 400);
  assert.equal((await put({ ...g, players: ['x'.repeat(41), 'Ayşe', 'Mehmet', 'Zeynep'] })).status, 400);
  assert.equal((await put({ ...g, players: ['  ', 'Ayşe', 'Mehmet', 'Zeynep'] })).status, 400);
  assert.equal((await put({ ...g, rules: { ...g.rules, pointsPer: { ...g.rules.pointsPer, kiz: 'çok' } } })).status, 400);
  assert.equal((await put({ ...g, pad: 'x'.repeat(70000) })).status, 413);
  assert.equal((await call('PUT', `/groups/ZZZZZZZZ/games/${g.id}`, g)).status, 404);
  assert.equal((await call('GET', `/groups/${code}`)).body.games, 0);
});

test('DELETE hides a game from analysis and repeating it is harmless', async () => {
  const { call, group } = setup();
  const code = await group();
  const g = game(['Ali', 'Ayşe', 'Mehmet', 'Zeynep'], [['kiz', [4, 0, 0, 0]]]);
  await call('PUT', `/groups/${code}/games/${g.id}`, g);
  assert.equal((await call('DELETE', `/groups/${code}/games/${g.id}`)).status, 200);
  assert.equal((await call('DELETE', `/groups/${code}/games/${g.id}`)).status, 200);
  assert.equal((await call('DELETE', `/groups/${code}/games/neverexisted1`)).status, 200);
  assert.equal((await call('GET', `/groups/${code}/analysis`)).body.analysis.games, 0);
  assert.equal((await call('GET', `/groups/${code}`)).body.games, 0);
});

test('analysis combines games from different phones and applies aliases', async () => {
  const { call, group, admin } = setup();
  const code = await group();
  const phoneA = game(['Ali', 'Ayşe', 'Mehmet', 'Zeynep'], [['kiz', [4, 0, 0, 0]]]);
  const phoneB = game(['ALİ', 'Ayse', 'Memo', 'Zeynep'], [['kiz', [0, 0, 4, 0]]], '2026-11-03T21:00:00.000Z');
  await call('PUT', `/groups/${code}/games/${phoneA.id}`, phoneA);
  await call('PUT', `/groups/${code}/games/${phoneB.id}`, phoneB);
  assert.equal((await admin(code, 'PUT', '/aliases', { from: 'Memo', to: 'Mehmet' })).status, 200);
  const res = await call('GET', `/groups/${code}/analysis`);
  assert.equal(res.status, 200);
  const { group: g, analysis, aliases, at } = res.body;
  assert.deepEqual(g, { code, name: 'Cuma Kingcileri' });
  assert.deepEqual(aliases, { memo: 'mehmet' });
  assert.equal(at, NOW.toISOString());
  assert.equal(analysis.games, 2);
  assert.deepEqual(analysis.players.map(p => [p.key, p.games]).sort(), [['ali', 2], ['ayse', 2], ['mehmet', 2], ['zeynep', 2]]);
  const mehmet = analysis.players.find(p => p.key === 'mehmet');
  assert.deepEqual([mehmet.avgTotal, mehmet.types.kiz.units], [-200, 4]);
});

test('aliases never form cycles, reject co-players, repoint chains, and DELETE splits again', async () => {
  const { call, group, admin } = setup();
  const code = await group();
  const g1 = game(['Memo', 'Ali', 'Veli', 'Can'], [['kiz', [1, 1, 1, 1]]]);
  const g2 = game(['Mehmet', 'Deniz', 'Ece', 'Fatih'], [['kiz', [1, 1, 1, 1]]]);
  const g3 = game(['Mehmet K', 'Deniz', 'Ece', 'Fatih'], [['kiz', [1, 1, 1, 1]]]);
  for (const g of [g1, g2, g3]) await call('PUT', `/groups/${code}/games/${g.id}`, g);
  const alias = (from, to) => admin(code, 'PUT', '/aliases', { from, to });

  assert.deepEqual((await alias('Memo', 'Mehmet')).body, { aliases: { memo: 'mehmet' } });
  const again = await alias('Mehmet', 'memo');
  assert.deepEqual([again.status, again.body], [200, { aliases: { memo: 'mehmet' } }], 'already one person: no reverse link, no cycle');
  const together = await alias('Memo', 'Ali');
  assert.equal(together.status, 409);
  assert.match(together.body.error, /aynı oyunda/);
  assert.equal((await alias('Memo', 'memo')).status, 400);
  assert.equal((await alias('', 'Ali')).status, 400);

  assert.deepEqual((await alias('Mehmet', 'Mehmet K')).body, { aliases: { memo: 'mehmetk', mehmet: 'mehmetk' } });
  const split = await admin(code, 'DELETE', '/aliases/memo');
  assert.deepEqual(split.body, { aliases: { mehmet: 'mehmetk' } });
  const { analysis } = (await call('GET', `/groups/${code}/analysis`)).body;
  assert.deepEqual(analysis.players.filter(p => ['memo', 'mehmetk'].includes(p.key)).map(p => [p.key, p.games]).sort(), [['mehmetk', 2], ['memo', 1]]);
});

test('analysis rebuilds outdated summaries from the stored game record', async () => {
  const { call, group, DB } = setup();
  const code = await group();
  const g = game(['Ali', 'Ayşe', 'Mehmet', 'Zeynep'], [['kiz', [4, 0, 0, 0]]]);
  await call('PUT', `/groups/${code}/games/${g.id}`, g);
  DB.raw.prepare("UPDATE games SET summary = '{}', summary_v = 0").run();
  const { analysis } = (await call('GET', `/groups/${code}/analysis`)).body;
  assert.equal(analysis.players.find(p => p.key === 'ali').types.kiz.units, 4);
  assert.equal(DB.raw.prepare('SELECT summary_v FROM games').get().summary_v, SUMMARY_VERSION);
});

test('CORS echoes allowed origins, answers preflight with 204 and omits unknown origins', async () => {
  const { call, group } = setup();
  const code = await group();
  const ok = await call('GET', `/groups/${code}`, undefined, 'https://okavak.github.io');
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), 'https://okavak.github.io');
  const missing = await call('GET', '/groups/ZZZZZZZZ', undefined, 'http://127.0.0.1:8080');
  assert.equal(missing.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:8080', 'errors stay readable by the app');
  const pre = await call('OPTIONS', `/groups/${code}/games/abc123`, undefined, 'http://localhost:8080');
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('Access-Control-Allow-Methods'), /PUT/);
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Content-Type/);
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Authorization/);
  const evil = await call('GET', `/groups/${code}`, undefined, 'https://evil.example');
  assert.equal(evil.headers.get('Access-Control-Allow-Origin'), null);
});

test('PUT rejects a hand whose type is an inherited property name', async () => {
  const { call, group } = setup();
  const code = await group();
  const g = game(['Ali', 'Ayşe', 'Mehmet', 'Zeynep'], [['kiz', [4, 0, 0, 0]]]);
  for (const type of ['__proto__', 'constructor']) {
    const bad = JSON.parse(JSON.stringify(g));
    bad.hands.push({ type, dealer: 1, counts: [1, 0, 0, 0] });
    assert.equal((await call('PUT', `/groups/${code}/games/${g.id}`, JSON.stringify(bad))).status, 400, type);
  }
  assert.equal(({})[0], undefined, 'the shared prototype stays clean');
});

test('creating a group returns a one-time admin key; the admin check accepts it loosely typed and rejects others', async () => {
  const { call, keys, group } = setup();
  const code = await group();
  const key = keys.get(code);
  assert.match(key, /^[0-9A-HJKMNP-TV-Z]{16}$/);
  const check = auth => call('GET', `/groups/${code}/admin`, undefined, undefined, auth === undefined ? {} : { Authorization: auth });
  assert.equal((await check(`Bearer ${key}`)).status, 200);
  const loose = key.toLowerCase().replace(/(.{4})(?=.)/g, '$1-');
  assert.equal((await check(`Bearer ${loose}`)).status, 200, 'dashes and lowercase are fine');
  assert.equal((await check()).status, 401);
  assert.equal((await check('Bearer ZZZZZZZZZZZZZZZZ')).status, 403);
  const info = await call('GET', `/groups/${code}`);
  assert.deepEqual(Object.keys(info.body).sort(), ['code', 'games', 'name'], 'the public lookup never shows admin data');
});

test('merging names and editing the official list need the admin key', async () => {
  const { call, group, admin, keys } = setup();
  const code = await group();
  const other = await group('Başka grup');
  assert.equal((await call('PUT', `/groups/${code}/aliases`, { from: 'Memo', to: 'Mehmet' })).status, 401);
  assert.equal((await call('PUT', `/groups/${code}/members`, { names: ['Onur'] })).status, 401);
  assert.equal((await call('DELETE', `/groups/${code}/members/onur`)).status, 401);
  assert.equal((await call('DELETE', `/groups/${code}/aliases/memo`)).status, 401);
  assert.equal((await admin(other, 'GET', '/admin')).status, 200);
  const wrong = await call('PUT', `/groups/${code}/members`, { names: ['Onur'] }, undefined, { Authorization: `Bearer ${keys.get(other)}` });
  assert.equal(wrong.status, 403, "another group's admin key does not work here");
  assert.equal((await admin(code, 'PUT', '/aliases', { from: 'Memo', to: 'Mehmet' })).status, 200);
});

test('a group created before admin keys existed has no admin', async () => {
  const { call, DB } = setup();
  DB.raw.prepare("INSERT INTO groups (code, name, created_at) VALUES ('ABCD2345', 'Eski', '2026-11-01')").run();
  const r = await call('PUT', '/groups/ABCD2345/members', { names: ['Onur'] }, undefined, { Authorization: 'Bearer ABCD2345ABCD2345' });
  assert.equal(r.status, 403);
});

test('official members show in analysis with their spelling; removing one takes it off', async () => {
  const { call, group, admin } = setup();
  const code = await group();
  const g = game(['onur', 'Basbug', 'Zafer', 'Misafir'], [['kiz', [0, 4, 0, 0]]]);
  await call('PUT', `/groups/${code}/games/${g.id}`, g);
  const set = await admin(code, 'PUT', '/members', { names: ['Onur', 'Başbuğ', 'Zafer', 'Zeynel', '  Hayrullah Abi  '] });
  assert.equal(set.status, 200);
  assert.deepEqual(set.body.members.map(m => [m.key, m.name]), [['basbug', 'Başbuğ'], ['hayrullahabi', 'Hayrullah Abi'], ['onur', 'Onur'], ['zafer', 'Zafer'], ['zeynel', 'Zeynel']]);
  const { analysis, members } = (await call('GET', `/groups/${code}/analysis`)).body;
  assert.equal(members.length, 5);
  const by = k => analysis.players.find(p => p.key === k);
  assert.deepEqual([by('onur').name, by('basbug').name, by('basbug').member, by('misafir').member], ['Onur', 'Başbuğ', true, false]);
  assert.deepEqual([by('zeynel').games, by('zeynel').name], [0, 'Zeynel']);
  assert.equal((await admin(code, 'DELETE', '/members/zeynel')).status, 200);
  assert.equal((await call('GET', `/groups/${code}/analysis`)).body.analysis.players.some(p => p.key === 'zeynel'), false);
  assert.equal((await admin(code, 'PUT', '/members', { names: ['x'.repeat(41)] })).status, 400);
  assert.equal((await admin(code, 'PUT', '/members', { names: 'Onur' })).status, 400);
  assert.equal((await admin(code, 'PUT', '/members', { names: Array.from({ length: 61 }, (_, i) => `Kişi ${i}`) })).status, 400);
});


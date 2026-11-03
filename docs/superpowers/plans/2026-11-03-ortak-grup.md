# Ortak Grup ve Kişisel Analiz Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grubun bütün telefonlarındaki biten oyunlar Cloudflare'deki tek bir ortak kayıtta birikir. Sıralama ve kişisel
karne orada, herkesin oyunlarından hesaplanır. İsim farklılıkları birleştirilir.

**Architecture:** Saf paylaşılan modüller (`names.js`, `groupcode.js`, `analysis.js`, mevcut `rules.js`) hem PWA'da hem
Cloudflare Worker'da çalışır. Worker, D1'de oyunun tam kaydını ve analiz özetini saklar; analizi özetlerden hesaplar.
PWA'daki `group.js` gönderim sırasını (outbox) tutar, ağ gelince gönderir ve son analizi çevrimdışı gösterim için saklar.

**Tech Stack:** Vanilla ES modülleri (derleme yok), node:test, node:sqlite (yalnızca testte sahte D1 için),
Cloudflare Workers + D1, wrangler@4.151.2 (npx ile; repoya bağımlılık eklenmez).

**Spec:** `docs/superpowers/specs/2026-11-03-ortak-grup-design.md`

## Global Constraints

- Uygulamada derleme adımı ve npm bağımlılığı yok. wrangler yalnızca `npx --yes wrangler@4.151.2` ile çağrılır.
- Açılış ağı beklemez. Ağ çağrıları `render()` sonrasında başlar, en fazla 10 sn zaman aşımı vardır ve hatalar sessizce yutulur.
- Açılışta yüklenen her yerel dosya `sw.js` ASSETS listesinde olmalı (`tests/sw.test.js` bunu denetler).
- Arayüz metinleri Türkçe. Tanımlayıcılar İngilizce. Test adları İngilizce (mevcut düzen).
- Renk: çıkan/iyi `--green`, batan/kötü `--red`, sıfır/nötr `--muted`. Metin kontrastı her iki temada ≥ 4.5:1.
- Değerler: `MIN_RANKED_GAMES = 3`, `MIN_TYPE_HANDS = 3`, `FAIR_SHARE = 0.25`, `SUMMARY_VERSION = 1`, kod 8 karakter Crockford
  base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`), gövde sınırı 65536 bayt, grup adı 1–40 karakter, oyuncu adı ≤ 40 karakter.
- CORS izinli kökenler: `https://okavak.github.io`, `http://localhost:8080`, `http://127.0.0.1:8080`.
- Oturum kuralı: commit ve push yalnızca kullanıcı isteyince. Her görevin "Commit" adımı kullanıcı onayına kadar bekler.

## Review Focus

1. Masada internet yok: uygulama açılır ve oyun biter. Gönderim sırada kalır, hata ekrana taşmaz, internet gelince gider
   → Task 4 `flush keeps entries when offline…`, Task 5 uçtan uca çevrimdışı adımı.
2. Kod gevşek yazılır (küçük harf, tire yok, O yerine 0, davet metninin tamamı yapıştırılır) ve yine bulunur
   → Task 1 `normalizeCode tolerates case, separators, O/0, I/L/1 and pasted invitations`.
3. Aynı oyun iki kez gelir: zaman aşımı sonrası yeniden deneme, "Son eli düzelt", başka telefona yedekten geri yükleme.
   Analizde tek oyun sayılır → Task 3 `PUT is an upsert: the same game twice counts once and the latest data wins`.
4. İsim varyantları ve yanlış birleştirme: "Çağrı/cagri/ÇAĞRI" tek kişi olur; aynı masada oturmuş iki kişi birleştirilemez;
   döngü reddedilir → Task 1 `nameKey…`, Task 3 `aliases reject cycles and co-players…`.
5. Sunucu bir kaydı hiç kabul etmeyecekse (400/413) ya da oyun telefonda artık yoksa sıra sonsuza kadar tıkanmaz
   → Task 4 `flush drops entries the server rejects and puts whose game is gone`.

---

### Task 1: İsim anahtarı ve grup kodu yardımcıları

**Files:**
- Create: `names.js`, `groupcode.js`
- Modify: `roster.js` (`nameKeyOf`), `store.js` (`normName`)
- Test: `tests/names.test.js` (yeni), `tests/roster.test.js`, `tests/store.test.js`

**Interfaces:**
- Produces: `nameKey(name: string): string`, `resolveAlias(key: string, aliases?: Record<string,string>): string` (`names.js`).
- Produces: `CODE_ALPHABET`, `CODE_LENGTH = 8`, `normalizeCode(input: string): string|null`, `formatCode(code: string): string`
  (`"ABCD-2345"`), `generateCode(fill?: (bytes: Uint8Array) => Uint8Array): string` (`groupcode.js`; varsayılan
  `crypto.getRandomValues`; her bayt `% 32`).

- [ ] **Step 1: Write the failing tests** (`tests/names.test.js`)
  - `nameKey folds Turkish letters, case, spaces and punctuation`: `['Çağrı','cagri',' ÇAĞRI ','Cagrı','ÇAGRİ']` hepsi `'cagri'`;
    `'Işıl'`, `'ISIL'` → `'isil'`; `'Hayrullah Abi'` → `'hayrullahabi'`; `'Ali K.'` → `'alik'`; `'José'` → `'jose'`; `'😀'` → `'😀'`.
  - `resolveAlias follows chains and survives cycles`: `{a:'b', b:'c'}` → `'c'`; `{a:'b', b:'a'}` ile `resolveAlias('a')` → `'b'`; eşlemesiz anahtar kendisi.
  - `normalizeCode tolerates case, separators, O/0, I/L/1 and pasted invitations`: `'abcd-2345'`, `' ab cd 23 45 '` → `'ABCD2345'`;
    `'ABCD-23O5'` → `'ABCD2305'`; `'abcd-23i5'` ve `'abcd-23l5'` → `'ABCD2315'`; `'ABCD234'`, `'ABCU2345'`, `''` → `null`;
    `'Kod: K7QM-2XPA. Katıl!'` → `'K7QM2XPA'`.
  - `formatCode and generateCode`: `formatCode('ABCD2345')` → `'ABCD-2345'`; `generateCode(b => b.map((_, i) => i))` → `'01234567'`;
    `generateCode(b => b.fill(255))` → `'ZZZZZZZZ'`; varsayılan çağrı `normalizeCode`'dan geçer.
  - `tests/roster.test.js`'e ekle: `addToRoster(['Çağrı'], 'Cagri').added === false`; `toggleSeat(['Çağrı'], 'cagri')` → `[]`.
  - `tests/store.test.js`'e ekle: `saveNames(['Çağrı', 'cagri', 'Işıl', 'ISIL'])` → `['Çağrı', 'Işıl']`.
- [ ] **Step 2: Run** `node --test tests/names.test.js tests/roster.test.js tests/store.test.js` → FAIL (modül yok / yeni eşleşmeler tutmuyor).
- [ ] **Step 3: Implement** `names.js` (spec §4 adımları; `resolveAlias` en fazla 16 adım, ziyaret edileni tekrar görünce durur),
  `groupcode.js` (önce bütün girdi normalize edilir; geçersizse `/([0-9a-z]{4})-([0-9a-z]{4})/gi` eşleşmeleri sırayla denenir);
  `roster.js` `nameKeyOf = nameKey`; `store.js` `normName = nameKey`.
- [ ] **Step 4: Run** `node --test` → PASS (eski roster/store testleri de geçer).
- [ ] **Step 5: Commit** (kullanıcı onayıyla) `feat: isim anahtarı Türkçe karakterleri birleştirir, grup kodu yardımcıları`

### Task 2: Analiz modülü

**Files:**
- Create: `analysis.js`
- Modify: `rules.js` (`playerStats` ve özel `nameKey` kaldırılır), `tests/rules.test.js` (playerStats testleri taşınır)
- Test: `tests/analysis.test.js`

**Interfaces:**
- Consumes: `nameKey`, `resolveAlias` (Task 1); `HAND_TYPES`, `TYPE_BY_ID`, `PLAYER_COUNT`, `DEFAULT_RULES`, `gameTotals`,
  `handScores`, `outcomes`, `isValidGame` (`rules.js`).
- Produces (`analysis.js`):
  - `SUMMARY_VERSION = 1`, `MIN_RANKED_GAMES = 3`, `MIN_TYPE_HANDS = 3`, `FAIR_SHARE = 0.25`
  - `summarizeGame(game) → { v, id, at, seats: [{ name, key, total, outcome: 'out'|'sunk'|'king', kings, t: { [typeId]: [hands, units, points] } }] }`
    (`at = finishedAt || createdAt`; oynanmamış tür `t`'de yok)
  - `aggregate(summaries, { aliases = {} } = {}) → { games, firstAt, lastAt, players: Player[] }`
  - `Player = { key, name, spellings: string[], keys: string[], games, wins, winRate, avgTotal, best, worst, kings, rank: number|null,
    types: { [typeId]: { hands, units, points, share: number|null } } (7 türün hepsi), weakest: typeId|null, strongest: typeId|null }`
  - `analyze(games, opts) = aggregate(games.filter(isValidGame).map(summarizeGame), opts)`
  - `playedTogether(summaries, keyA, keyB, aliases = {}) → boolean` (alias çözülmüş anahtarlar aynı oyunda mı)

- [ ] **Step 1: Write the failing tests** (`tests/analysis.test.js`; `fullGame` kurucusu `tests/rules.test.js`'tekiyle aynı mantık)
  - `summarizeGame records totals, outcomes and per-type units`: fullGame → koltuk 0 `total 5200`, `outcome 'out'`, `t.koz = [8, 104, 5200]`;
    koltuk 3 `t.kiz = [2, 8, -800]`, `outcome 'sunk'`; koltuk 1 `total 0` → `'out'`.
  - `merges spellings via nameKey and aliases`: `'Ali'` ve `'ALİ'` iki oyunda → tek oyuncu `games 2, wins 2, avgTotal 5200, best 5200, kings 16`
    (eski playerStats testi); `{ memo: 'mehmet' }` ile `'Memo'` ve `'Mehmet'` tek oyuncu, `keys` ikisini içerir.
  - `share is units over hands×total; weakest/strongest need 3 hands and must cross fair share`: 3 Kız elinde 4'ün 3'ünü alan
    oyuncu → `types.kiz.share === 0.75`, `weakest === 'kiz'`; 2 elde aynı oran → `weakest === null`; payı 0 olan ceza (≥3 el) → `strongest`.
  - `rank needs 3 games; equal winRate and avgTotal share a rank; unranked go last`.
  - `King counts as a win; kings counts koz hands at or above the game threshold`.
  - `display name is the most frequent spelling, latest on ties`.
  - `unplayed types have hands 0 and share null`; `playedTogether detects co-players after aliases`; `analyze skips invalid games`.
- [ ] **Step 2: Run** `node --test tests/analysis.test.js` → FAIL (modül yok).
- [ ] **Step 3: Implement** `analysis.js`. Sıralama: rank'lılar `winRate ↓, avgTotal ↓, games ↓, name (tr-TR)`; rank'sızlar `games ↓, name`.
  `rules.js`'ten `playerStats` ve `nameKey`'i kaldır; `tests/rules.test.js`'teki playerStats testlerini sil (summaryText kısmı kalır).
- [ ] **Step 4: Run** `node --test` → PASS.
- [ ] **Step 5: Commit** (kullanıcı onayıyla) `feat: analiz modülü (sıralama, ceza karnesi, isim birleştirme)`

### Task 3: Worker ve D1

**Files:**
- Create: `worker/wrangler.jsonc`, `worker/migrations/0001_init.sql`, `worker/src/api.js`, `worker/src/index.js`, `tests/helpers/fake-d1.js`
- Test: `tests/worker.test.js`

**Interfaces:**
- Consumes: `isValidGame` (`rules.js`), `nameKey`, `resolveAlias` (Task 1), `normalizeCode`, `generateCode` (Task 1),
  `summarizeGame`, `aggregate`, `playedTogether`, `SUMMARY_VERSION` (Task 2).
- Produces: `handle(request: Request, env: { DB }, opts?: { now?: () => Date }): Promise<Response>` (`worker/src/api.js`);
  `export default { fetch(request, env) }` (`worker/src/index.js`); API sözleşmesi spec §6.
- Produces (test yardımcısı): `createFakeD1(sql: string): { prepare(sql) → { bind(...a), first(), all(), run() }, batch(stmts) }`
  (node:sqlite `DatabaseSync` üstünde; `batch` tek işlemde).
- Şema: `groups(code PK, name, created_at)`, `games(group_code, id, data, summary, summary_v, finished_at, updated_at,
  deleted DEFAULT 0, PK(group_code,id))`, `aliases(group_code, from_key, to_key, updated_at, PK(group_code,from_key))`.

- [ ] **Step 1: Write the failing tests** (`tests/worker.test.js`; istekler `new Request('https://api.test/…', { headers: { Origin: 'http://localhost:8080' } })`)
  - `creates a group and finds it by a loosely typed code`
  - `PUT is an upsert: the same game twice counts once and the latest data wins`
  - `PUT rejects invalid games, id mismatches, unfinished games, long names, oversized bodies and unknown groups` (400/400/400/400/413/404)
  - `DELETE hides a game from analysis and repeating it is harmless`
  - `analysis combines games from different phones and applies aliases`
  - `aliases reject cycles and co-players, repoint chains, and DELETE splits again` (400, 409, `{a:'c'}` zinciri)
  - `analysis rebuilds outdated summaries from stored data` (`summary_v = 0` yapılır → analiz doğru, satır güncellenmiş)
  - `CORS echoes allowed origins, answers preflight with 204, omits unknown origins`
- [ ] **Step 2: Run** `node --test tests/worker.test.js` → FAIL.
- [ ] **Step 3: Implement** migration SQL, `api.js` (yol eşleme, JSON yanıt + CORS, doğrulama spec §6, upsert
  `INSERT … ON CONFLICT(group_code,id) DO UPDATE … deleted=0`, alias'ta `root = resolveAlias(to)`; `root === from` → 400;
  `playedTogether` → 409; `batch([upsert, UPDATE aliases SET to_key=root WHERE to_key=from])`), `index.js`, `wrangler.jsonc`
  (`name: "king-skor"`, `main: "src/index.js"`, `compatibility_date: "2026-10-01"`, D1 binding `DB`, `database_name: "king-skor"`,
  `migrations_dir: "migrations"`; `database_id` yayında eklenir).
- [ ] **Step 4: Run** `node --test` → PASS. Ayrıca `cd worker && npx --yes wrangler@4.151.2 deploy --dry-run --outdir /tmp/…` paketin
  derlendiğini gösterir (ağ/giriş gerekmez).
- [ ] **Step 5: Commit** (kullanıcı onayıyla) `feat: ortak kayıt sunucusu (Cloudflare Worker + D1)`

### Task 4: Grup istemcisi

**Files:**
- Create: `group.js`, `config.js` (`export const API_BASE = ''`, yayında doldurulur)
- Test: `tests/group.test.js`

**Interfaces:**
- Consumes: `normalizeCode` (Task 1); Task 3 API sözleşmesi.
- Produces: `createGroupClient({ storage, fetch, apiBase, timeoutMs = 10000 })` →
  `{ enabled, current(), create(name), lookup(input), join(group), leave(), enqueue(op, id), pending(), flush(getGame), refresh(), cached(), merge(fromKey, toKey), split(fromKey) }`.
  - localStorage anahtarları: `king:v1:group` (`{ code, name }`), `king:v1:outbox` (`[{ op: 'put'|'delete', id }]`),
    `king:v1:analysis` (`{ at, group, analysis, aliases }`).
  - Sonuç biçimi: `{ ok: true, … } | { ok: false, error: string }`. Hata metinleri: ağ → `'İnternete bağlanılamadı'`,
    geçersiz kod → `'Kod 8 karakter olmalı (ör. ABCD-2345)'`, bulunamadı → `'Bu kodla bir grup bulunamadı'`, diğer → sunucunun `error`'u.
  - `flush(getGame: id → game|null) → { sent, kept }`: sırayla gönderir; 2xx → düşer; 400/413 → düşer; `put` için oyun yoksa → düşer;
    ağ hatası/5xx/404 → durur, kalanlar kalır. Aynı anda ikinci çağrı ilkinin sözünü döndürür.

- [ ] **Step 1: Write the failing tests** (sahte fetch istekleri kaydeder ve sırayla yanıt verir)
  - `lookup normalizes the code and reports unknown groups`; `create saves membership`
  - `enqueue dedupes by id and the latest op wins`; `flush sends puts and deletes in order and empties the outbox`
  - `flush keeps entries when offline and stops at the first failure`
  - `flush drops entries the server rejects and puts whose game is gone`
  - `refresh caches analysis for offline use; leave clears group, outbox and cache`
  - `merge and split call the alias endpoints with encoded keys`; `a client without apiBase never calls fetch`
- [ ] **Step 2: Run** `node --test tests/group.test.js` → FAIL.
- [ ] **Step 3: Implement** `group.js` (`AbortController` ile zaman aşımı; JSON gövde; `Content-Type: application/json`).
- [ ] **Step 4: Run** `node --test` → PASS.
- [ ] **Step 5: Commit** (kullanıcı onayıyla) `feat: grup istemcisi (gönderim sırası, çevrimdışı analiz önbelleği)`

### Task 5: Uygulama — grup kurma/katılma ve gönderim kancaları

**Files:**
- Modify: `app.js` (ayarlar, kancalar, açılış), `app.css`, `sw.js` (ASSETS: `./names.js`, `./groupcode.js`, `./analysis.js`, `./group.js`, `./config.js`)

**Interfaces:**
- Consumes: Task 4 `createGroupClient`; `formatCode` (Task 1); `API_BASE` (`config.js`). Geliştirmede adres
  `localStorage['king:v1:apiBase']` ile ezilebilir.
- Produces: `syncSoon()` (açılıştan sonra, `online`, görünür olunca ve her kancada çağrılır), `askText(message, { placeholder, okLabel, value })`
  diyaloğu, Ayarlar "Grup" bölümü (spec §7).

- [ ] **Step 1:** Kancalar: `archive` → `enqueue('put')`; `delete-history` → `enqueue('delete')`; `abandon` → `enqueue('delete', game.id)`;
  yedek geri yükleme → geçmişteki her oyun için `enqueue('put')`; `wipe` → `group.leave()` (onay metnine "Grubun ortak kaydı silinmez." eklenir).
  Hepsi yalnızca `group.current()` varken çalışır.
- [ ] **Step 2:** Ayarlar "Grup" bölümü, kurma/katılma/davet/çıkma akışları, ana ekran düğmesi "Analiz ve sıralama" ve grup satırı.
  Ayarlar alt bilgisi gruptayken "Biten oyunlar <ad> grubunun ortak kaydına da gönderilir."
- [ ] **Step 3: Run** `node --test` → PASS (sw.test yeni dosyaları ister).
- [ ] **Step 4: Uçtan uca doğrula:** `npm run worker:dev` (yerel D1, :8787) + `python3 -m http.server 8080`; iki köken
  (`localhost:8080` = telefon A, `127.0.0.1:8080` = telefon B), ikisinde de `king:v1:apiBase = http://localhost:8787`.
  A grup kurar; geçmişindeki oyunlarla katılır. B kodla (küçük harf, tiresiz) katılır. A bir oyunu bitirir → `wrangler d1 execute --local`
  ile satırlar görülür. Worker durdurulur → A açılır, oyun biter, gönderim bekler; Worker açılınca gider.
- [ ] **Step 5: Commit** (kullanıcı onayıyla) `feat: gruba katılma ve biten oyunların ortak kayda gönderilmesi`

### Task 6: Uygulama — analiz ve kişisel karne ekranları

**Files:**
- Modify: `app.js` (`views.stats` → analiz; yeni `views.player`), `app.css`

**Interfaces:**
- Consumes: `analyze` (Task 2, grupta değilken), `group.cached()/refresh()/merge()/split()` (Task 4), `resolveAlias`, `nameKey` (Task 1).
- Produces: `state.playerKey`; görünümler `stats` (sıralama) ve `player` (karne), spec §7.

- [ ] **Step 1:** frontend-design yönergesiyle ekran düzeni (mevcut panel/tablo dili, yeşil/kırmızı, ≥ 4.5:1).
- [ ] **Step 2:** Sıralama listesi ve kaynak satırı; açılınca `syncSoon()` → `refresh()` → yeniden çizim.
- [ ] **Step 3:** Kişisel karne: özet sayılar, vurgular, ceza karnesi (pay çubuğu + %25 işareti), birleşen yazımlar,
  "Başka bir isimle birleştir" (`choose` ile hedef seçimi + onay) ve "Ayır".
- [ ] **Step 4: Uçtan uca doğrula:** Task 5 ortamında iki telefonun oyunlarıyla sıralama; `Memo → Mehmet` birleştir/ayır; aynı oyunda
  oynamış iki isim için 409 mesajı; çevrimdışı açılışta son analiz ve "son güncelleme"; açık ve koyu temada ekran görüntüsü.
- [ ] **Step 5: Commit** (kullanıcı onayıyla) `feat: analiz ve kişisel karne ekranları`

### Task 7: Belgeler, betikler ve yayın

**Files:**
- Modify: `README.md`, `package.json` (`worker:dev`, `worker:deploy`), `tools/bundle.mjs` (dosya listesine `roster.js` ve yeni modüller),
  `.gitignore` (`.wrangler/`), `docs/superpowers/specs/2026-10-02-king-skor-design.md` (yeni tasarıma işaret eden bölüm), `config.js`

- [ ] **Step 1:** README "Grup" bölümü (kurma, katılma, analiz, isim birleştirme, verinin nereye gittiği) ve geliştirme komutları.
- [ ] **Step 2:** `node tools/bundle.mjs` hatasız çalışır; `node --test` PASS.
- [ ] **Step 3:** Bütün dalın bağımsız incelemesi (superpowers:requesting-code-review); bulgular düzeltilir.
- [ ] **Step 4: Yayın (kullanıcıyla):** `npx --yes wrangler@4.151.2 login` (kullanıcı) → `d1 create king-skor` → `database_id` yazılır →
  `d1 migrations apply king-skor --remote` → `deploy` → çıkan adres `config.js` `API_BASE`'e; commit'ler ve `./deploy.sh` kullanıcı onayıyla.

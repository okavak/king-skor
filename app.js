// app.js — King Skor arayüzü. Görünümler şablon dizgisi üretir; olaylar data-action ile delege edilir.
import {
  HAND_TYPES, TYPE_BY_ID, SUITS, PLAYER_COUNT, DEFAULT_RULES, cloneRules, handsTotal, createGame, makeHand,
  handScores, validateCounts, formatPoints, dealerForHand, currentDealer, gameTotals, quotaState, availableTypes,
  isFinished, withHand, withHandReplaced, withoutHand, standings, summaryText, speechText, playerStats, expectedGameTotal,
} from './rules.js';
import { createStore } from './store.js';
import { APP_VERSION } from './version.js';

// ---------- depolama ----------
function safeStorage() {
  try {
    const k = '__king_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return { impl: localStorage, memory: false };
  } catch {
    const m = new Map();
    return {
      impl: { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } },
      memory: true,
    };
  }
}
const storage = safeStorage();
const store = createStore(storage.impl);

// ---------- durum ----------
const state = {
  view: 'home',               // home | new | board | finish | settings | stats
  game: store.loadCurrent(),  // devam eden oyun
  viewGame: null,             // geçmişten salt okunur açılan oyun
  finishedGame: null,         // bitiş ekranı için
  boardMode: 'simple',        // simple | detail
  sheet: null,                // { step: 'type'|'counts', type, counts, trumpSuit, editIndex }
  menuOpen: false,
  draft: { names: ['', '', '', ''], firstDealer: 0 },
  settings: null,             // ayarlar ekranı taslağı
};

const $app = document.getElementById('app');
const $sheetRoot = document.getElementById('sheet-root');
const $toastRoot = document.getElementById('toast-root');

// ---------- yardımcılar ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cls = n => (n < 0 ? 'neg' : n > 0 ? 'pos' : 'zero');
const lower = s => String(s).trim().toLocaleLowerCase('tr-TR');
const fmtDate = iso => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
const activeGame = () => state.viewGame || state.game;
const isStandalone = () => Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone === true);
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function mcard(typeId, extra = '') {
  const t = TYPE_BY_ID[typeId];
  const textual = typeId === 'el' || typeId === 'koz';
  return `<span class="mcard${t.red ? ' red' : ''}${typeId === 'koz' ? ' koz' : ''}${textual ? ' text' : ''} ${extra}" aria-hidden="true">${esc(t.glyph)}</span>`;
}

function rights(game, seat) {
  const q = quotaState(game);
  const r = game.rules;
  const koz = Array.from({ length: r.kozPerPlayer }, (_, i) => (i < q.kozLeft[seat] ? '<span class="koz">○</span>' : '<span class="koz used">●</span>')).join('');
  const ceza = Array.from({ length: r.cezaPerPlayer }, (_, i) => (i < q.cezaLeft[seat] ? '<span class="ceza">△</span>' : '<span class="ceza used">▲</span>')).join('');
  return `<span class="rights" role="img" aria-label="${q.kozLeft[seat]} koz, ${q.cezaLeft[seat]} ceza hakkı kaldı">${koz}<span></span>${ceza}</span>`;
}

function toast(msg, opts = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>${opts.label ? `<button data-action="${esc(opts.action)}">${esc(opts.label)}</button>` : ''}`;
  $toastRoot.appendChild(el);
  setTimeout(() => el.remove(), opts.sticky ? 20000 : 2600);
}

function setView(view) {
  state.view = view;
  state.menuOpen = false;
  render();
  window.scrollTo(0, 0);
}

function render() {
  const fn = views[state.view] || views.home;
  $app.innerHTML = fn();
  $app.classList.toggle('readonly', Boolean(state.viewGame));
  renderSheet();
}

function renderSheet() {
  if (!state.sheet || !state.game) {
    $sheetRoot.innerHTML = '';
    document.body.style.overflow = '';
    return;
  }
  document.body.style.overflow = 'hidden';
  $sheetRoot.innerHTML = sheetMarkup(); // Task 7'de tanımlanır
}

function persist() {
  if (state.game && !store.saveCurrent(state.game)) toast('Kaydedilemedi: depolama alanı dolu ya da kapalı olabilir');
}

function archive(game) {
  const done = { ...game, finishedAt: new Date().toISOString() };
  store.addToHistory(done);
  store.clearCurrent();
  return done;
}

// ---------- görünümler ----------
const views = {};
const actions = {};

function installHint() {
  const text = isIOS()
    ? 'iPhone\'a kurmak için Safari\'de Paylaş düğmesine basın, "Ana Ekrana Ekle" seçin. Tam ekran ve çevrimdışı çalışır.'
    : 'Telefona kurmak için tarayıcı menüsünden "Ana ekrana ekle" ya da "Uygulamayı yükle" seçin.';
  return `<div class="install-hint"><span>${text}</span><button class="icon-btn" data-action="dismiss-hint" aria-label="İpucunu kapat">×</button></div>`;
}

function historyItem(g) {
  const st = standings(g);
  const top = st[0];
  const line = st.map(s => `${esc(g.players[s.seat])} ${formatPoints(s.total)}`).join(', ');
  return `<button class="history-item" data-action="open-history" data-id="${esc(g.id)}">
    <span><span class="date">${esc(fmtDate(g.finishedAt || g.createdAt))}, ${g.hands.length} el</span><br><span class="who">${esc(g.players[top.seat])} kazandı</span><br><span class="date">${line}</span></span>
    <span class="total num ${cls(top.total)}" style="font-size:20px">${formatPoints(top.total)}</span>
  </button>`;
}

views.home = () => {
  const g = state.game;
  const history = store.loadHistory();
  const showHint = !isStandalone() && !store.loadFlag('hintDismissed');
  return `<div class="screen">
  <header class="topbar"><h1 class="brand">King Skor</h1><button class="icon-btn" data-action="go" data-view="settings" aria-label="Ayarlar">⚙︎</button></header>
  ${g ? `<button class="panel continue" data-action="continue">
    <span><span class="title">${esc(g.players.join(', '))}</span><span class="sub">${g.hands.length}/${handsTotal(g.rules)} el oynandı, ${esc(g.players[currentDealer(g)])} konuşuyor</span></span>
    <span class="btn btn-primary" aria-hidden="true">Devam et</span></button>` : ''}
  <button class="btn ${g ? '' : 'btn-primary'} btn-block" data-action="new-game">Yeni oyun</button>
  ${showHint ? installHint() : ''}
  <section class="section"><h2>Geçmiş oyunlar</h2>
    ${history.length ? `<div class="panel">${history.map(historyItem).join('')}</div>` : '<div class="panel empty">Henüz biten oyun yok. İlk oyunu başlatın, sonucu burada görün.</div>'}
  </section>
  <div class="stack"><button class="btn btn-block" data-action="go" data-view="stats">İstatistikler</button></div>
  <p class="hint" style="text-align:center;margin-top:24px">Sürüm ${esc(APP_VERSION)}</p>
</div>`;
};

views.new = () => {
  const d = state.draft;
  const used = new Set(d.names.map(lower).filter(Boolean));
  const recent = store.loadNames().filter(n => !used.has(lower(n))).slice(0, 12);
  return `<div class="screen">
  <header class="topbar"><button class="icon-btn" data-action="go" data-view="home" aria-label="Geri">‹</button><h1>Yeni oyun</h1><span></span></header>
  <p class="hint">Oyuncuları masadaki oturma sırasıyla, saat yönünde yazın.</p>
  ${[0, 1, 2, 3].map(i => `<div class="field"><label for="name-${i}">${i + 1}. oyuncu</label><input class="input" id="name-${i}" data-field="name" data-index="${i}" value="${esc(d.names[i])}" placeholder="İsim" autocomplete="off" autocapitalize="words" enterkeyhint="next"></div>`).join('')}
  ${recent.length ? `<div class="chips">${recent.map(n => `<button class="chip" data-action="chip" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
  <div class="section"><h2>İlk dağıtan</h2>
    <div class="dealer-pick" id="dealer-pick">${[0, 1, 2, 3].map(i => `<button data-action="pick-dealer" data-index="${i}" aria-pressed="${d.firstDealer === i}">${esc(d.names[i].trim() || `${i + 1}. oyuncu`)}</button>`).join('')}</div>
    <div class="stack" style="margin-top:10px"><button class="btn btn-ghost" data-action="random-dealer">Rastgele seç</button></div>
    <p class="hint" style="margin-top:12px">Hatırlatma: ilk eli karo ikilisi olan oyuncu başlatır.</p>
  </div>
  <div class="stack"><button class="btn btn-primary btn-block" data-action="start-game">Oyunu başlat</button></div>
</div>`;
};

// ---------- eylemler (ana ekran, yeni oyun) ----------
Object.assign(actions, {
  go({ view }) {
    state.viewGame = null;
    if (view === 'settings') state.settings = store.loadSettings();
    setView(view);
  },
  continue() { state.viewGame = null; setView('board'); },
  'new-game'() {
    const last = state.game || store.loadHistory()[0];
    state.draft = { names: last ? [...last.players] : ['', '', '', ''], firstDealer: last ? (last.firstDealer + 1) % PLAYER_COUNT : 0 };
    setView('new');
  },
  chip({ name }) {
    const i = state.draft.names.findIndex(n => !n.trim());
    if (i === -1) return toast('Dört oyuncu da yazılı; önce birini silin');
    state.draft.names[i] = name;
    render();
  },
  'pick-dealer'({ index }) { state.draft.firstDealer = Number(index); render(); },
  'random-dealer'() {
    state.draft.firstDealer = Math.floor(Math.random() * PLAYER_COUNT);
    render();
    toast(`${state.draft.names[state.draft.firstDealer].trim() || `${state.draft.firstDealer + 1}. oyuncu`} dağıtıyor`);
  },
  'start-game'() {
    const names = state.draft.names.map(n => n.trim());
    if (names.some(n => !n)) return toast('Dört oyuncunun da adını yazın');
    if (new Set(names.map(lower)).size !== PLAYER_COUNT) return toast('İsimler birbirinden farklı olmalı');
    if (state.game && !confirm('Devam eden bir oyun var. Onu bitmiş sayıp geçmişe kaldıralım mı?')) return;
    if (state.game) archive(state.game);
    state.game = createGame({ players: names, firstDealer: state.draft.firstDealer, rules: store.loadSettings() });
    store.rememberNames(names);
    persist();
    state.boardMode = 'simple';
    state.viewGame = null;
    setView('board');
  },
  'dismiss-hint'() { store.setFlag('hintDismissed', true); render(); },
  reload() { location.reload(); },
});

// ---------- olaylar ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.hasAttribute('disabled')) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn(el.dataset, el);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && state.sheet) { actions['sheet-close']?.(); return; }
  if (e.key === 'Enter' && e.target.dataset?.field === 'name') {
    const next = document.getElementById(`name-${Number(e.target.dataset.index) + 1}`);
    if (next) next.focus(); else e.target.blur();
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"][data-action]')) {
    e.preventDefault();
    actions[e.target.dataset.action]?.(e.target.dataset, e.target);
  }
});

document.addEventListener('input', e => {
  const el = e.target;
  const field = el.dataset?.field;
  if (field === 'name') {
    const i = Number(el.dataset.index);
    state.draft.names[i] = el.value;
    const btn = document.querySelector(`#dealer-pick button[data-index="${i}"]`);
    if (btn) btn.textContent = el.value.trim() || `${i + 1}. oyuncu`;
  } else if (field === 'points' && state.settings) {
    state.settings.pointsPer[el.dataset.type] = el.value === '' ? NaN : Number(el.value);
  } else if (field === 'kingThreshold' && state.settings) {
    state.settings.kingThreshold = el.value === '' ? NaN : Number(el.value);
  }
});

// ---------- oyun tablosu ----------
function lastHandLine(g, readOnly) {
  const idx = g.hands.length - 1;
  const h = g.hands[idx];
  const t = TYPE_BY_ID[h.type];
  const parts = handScores(h, g.rules).map((s, i) => (s ? `${esc(g.players[i])} ${formatPoints(s)}` : null)).filter(Boolean).join(', ');
  return `<div class="hint" style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:12px">
    <span>${idx + 1}. el ${esc(t.name)}: ${parts || 'puan yok'}</span>
    ${readOnly ? '' : `<button class="btn btn-ghost" style="min-height:36px;padding:0 10px;flex:none" data-action="edit-hand" data-index="${idx}">Düzenle</button>`}
  </div>`;
}

views.board = () => {
  const g = activeGame();
  if (!g) { state.view = 'home'; return views.home(); }
  const readOnly = Boolean(state.viewGame);
  const done = Boolean(g.finishedAt) || isFinished(g);
  const totals = gameTotals(g);
  const dealer = currentDealer(g);
  const q = quotaState(g);
  const title = done ? `Bitti, ${g.hands.length} el` : `El ${g.hands.length + 1}/${handsTotal(g.rules)}`;
  const leader = Math.max(...totals);

  const simple = `<div class="panel players">${g.players.map((name, i) => `
    <div class="player-row${!done && i === dealer ? ' dealer' : ''}">
      ${rights(g, i)}
      <span><span class="player-name">${esc(name)}</span>${!done && i === dealer ? '<span class="player-sub">dağıtıyor</span>' : ''}</span>
      <span class="total num ${cls(totals[i])}"${g.hands.length && totals[i] === leader ? ' style="font-weight:800"' : ''}>${formatPoints(totals[i])}</span>
    </div>`).join('')}</div>
    ${g.hands.length ? lastHandLine(g, readOnly) : '<p class="hint" style="text-align:center;margin-top:14px">Henüz el oynanmadı.</p>'}`;

  const rows = g.hands.map((h, idx) => {
    const sc = handScores(h, g.rules);
    const t = TYPE_BY_ID[h.type];
    const attrs = readOnly ? '' : ` role="button" tabindex="0" data-action="edit-hand" data-index="${idx}" aria-label="${idx + 1}. eli düzenle"`;
    return `<div style="display:contents"${attrs}>
      <span class="cell label">${mcard(h.type, 'sm')}<span>${idx + 1}. ${esc(t.short)}${h.trumpSuit ? ` ${SUITS[h.trumpSuit]}` : ''}</span></span>
      ${sc.map((s, i) => `<span class="cell num ${cls(s)}${i === h.dealer ? ' dealer' : ''}">${s === 0 ? '–' : formatPoints(s)}</span>`).join('')}
    </div>`;
  }).join('');
  const detail = `<div class="panel">
    <div class="grid">
      <span class="cell head"></span>${g.players.map(n => `<span class="cell head" title="${esc(n)}">${esc(n)}</span>`).join('')}
      ${rows || '<span class="cell label" style="grid-column:1/-1;justify-content:center;color:var(--muted)">Henüz el oynanmadı</span>'}
    </div>
    <div class="grid totals"><span class="cell label">Toplam</span>${totals.map(t => `<span class="cell num ${cls(t)}">${formatPoints(t)}</span>`).join('')}</div>
  </div>`;

  const remaining = `<div class="remaining" role="img" aria-label="Kalan eller">${HAND_TYPES.map(t => {
    const left = q.typeLeft[t.id];
    return `<span class="item">${mcard(t.id, `sm${left <= 0 ? ' dim' : ''}`)}<span class="count">${left}</span><span>${esc(t.short)}</span></span>`;
  }).join('')}</div>`;

  const menu = state.menuOpen ? `<div class="menu-backdrop" data-action="menu-close"></div><div class="menu" role="menu">
    ${!readOnly && !done && g.hands.length ? '<button role="menuitem" data-action="undo-last">Son eli sil</button>' : ''}
    <button role="menuitem" data-action="speak">Skoru sesli oku</button>
    <button role="menuitem" data-action="share">Paylaş</button>
    ${!readOnly && !done && g.hands.length ? '<button role="menuitem" data-action="finish-early">Oyunu şimdi bitir</button>' : ''}
    ${readOnly
      ? `<button role="menuitem" class="danger" data-action="delete-history" data-id="${esc(g.id)}">Bu oyunu geçmişten sil</button>`
      : '<button role="menuitem" class="danger" data-action="abandon">Oyunu sil</button>'}
  </div>` : '';

  return `<div class="screen${!readOnly && !done ? ' has-bar' : ''}">
  <header class="topbar"><button class="icon-btn" data-action="exit-board" aria-label="Geri">‹</button><h1>${esc(title)}</h1><button class="icon-btn" data-action="menu-toggle" aria-label="Menü" aria-expanded="${state.menuOpen}">⋯</button>${menu}</header>
  <div style="text-align:center"><div class="segmented" role="group" aria-label="Görünüm">
    <button aria-pressed="${state.boardMode === 'simple'}" data-action="board-mode" data-mode="simple">Basit</button>
    <button aria-pressed="${state.boardMode === 'detail'}" data-action="board-mode" data-mode="detail">Detaylı</button></div></div>
  ${state.boardMode === 'simple' ? simple : detail}
  ${remaining}
</div>
${!readOnly && !done ? `<div class="bottom-bar"><div class="inner"><button class="btn btn-primary btn-block" data-action="open-sheet">El ekle</button><span class="who">${esc(g.players[dealer])} konuşuyor</span></div></div>` : ''}`;
};

// ---------- El Ekle paneli ----------
function sheetMarkup() {
  const sh = state.sheet;
  const g = state.game;
  const editing = sh.editIndex !== null;
  const handIndex = editing ? sh.editIndex : g.hands.length;
  const dealer = dealerForHand(g, handIndex);
  const q = quotaState(editing ? withoutHand(g, sh.editIndex) : g);
  const who = `${esc(g.players[dealer])} konuşuyor`;
  const rightsLine = g.rules.enforceQuotas ? `kalan hakkı ${q.cezaLeft[dealer]} ceza, ${q.kozLeft[dealer]} koz` : 'haklar serbest';
  let title, body, foot, back = false;

  if (sh.step === 'type') {
    const list = availableTypes(g, dealer, { handIndex, excludeIndex: editing ? sh.editIndex : null });
    title = editing ? `${handIndex + 1}. eli düzenle` : `${handIndex + 1}. el`;
    body = `<div class="type-list">${list.map(a => {
      const t = TYPE_BY_ID[a.type];
      return `<button class="type-item" data-action="pick-type" data-type="${t.id}"${a.enabled ? '' : ' disabled'}>
        ${mcard(t.id)}<span><span class="name">${esc(t.name)}</span>${a.enabled ? '' : `<br><span class="why">${esc(a.reason)}</span>`}</span>
        <span class="left">kalan ${a.left}</span></button>`;
    }).join('')}</div>`;
    foot = editing ? `<button class="btn btn-danger btn-block" data-action="delete-hand" data-index="${sh.editIndex}">Bu eli sil</button>` : '';
  } else {
    back = true;
    const t = TYPE_BY_ID[sh.type];
    const v = validateCounts(sh.type, sh.counts);
    const sum = sh.counts.reduce((a, b) => a + b, 0);
    const remaining = t.total - sum;
    const per = g.rules.pointsPer[sh.type];
    title = editing ? `${handIndex + 1}. eli düzenle: ${t.name}` : t.name;
    const suits = sh.type === 'koz' ? `<div class="suits" role="group" aria-label="Koz rengi (isteğe bağlı)">${Object.entries(SUITS).map(([k, s]) =>
      `<button class="${k === 'h' || k === 'd' ? 'red' : ''}" data-action="pick-suit" data-suit="${k}" aria-pressed="${sh.trumpSuit === k}" aria-label="${s}">${s}</button>`).join('')}</div>` : '';
    const rows = sh.type === 'rifki'
      ? `<p class="hint" style="text-align:center;margin-top:12px">Rıfkıyı (kupa papazı) kim aldı?</p><div class="pick-grid">${g.players.map((n, i) =>
          `<button data-action="pick-rifki" data-index="${i}" aria-pressed="${sh.counts[i] === 1}">${esc(n)}</button>`).join('')}</div>`
      : g.players.map((n, i) => `<div class="count-row">
          <span class="who"><span class="n">${esc(n)}${i === dealer ? ' <span style="color:var(--muted);font-weight:400;font-size:13px">dağıtan</span>' : ''}</span>
            <span class="pts num ${cls(sh.counts[i] * per)}">${sh.counts[i] ? formatPoints(sh.counts[i] * per) : '–'}</span>
            ${remaining > 0 ? `<button class="fill-btn" data-action="fill" data-index="${i}">Kalanı ver (+${remaining})</button>` : ''}</span>
          <span class="stepper"><button data-action="dec" data-index="${i}" aria-label="${esc(n)} azalt"${sh.counts[i] <= 0 ? ' disabled' : ''}>−</button><span class="val num">${sh.counts[i]}</span><button data-action="inc" data-index="${i}" aria-label="${esc(n)} artır"${remaining <= 0 ? ' disabled' : ''}>+</button></span>
        </div>`).join('');
    body = suits + rows;
    const status = v.ok ? `<span class="status ok">Tamam, ${t.total} ${esc(t.unit)} dağıtıldı</span>` : `<span class="status${remaining < 0 ? ' err' : ''}">${esc(v.error)}</span>`;
    foot = `${status}<button class="btn btn-primary btn-block" data-action="save-hand"${v.ok ? '' : ' disabled'}>${editing ? 'Değişikliği kaydet' : 'Eli kaydet'}</button>`;
  }

  return `<div class="sheet-backdrop" data-action="sheet-close"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="handle"></div>
    <div class="sheet-head">${back ? '<button class="icon-btn" data-action="sheet-back" aria-label="Tür seçimine dön">‹</button>' : '<span></span>'}<h2>${esc(title)}</h2><button class="icon-btn" data-action="sheet-close" aria-label="Kapat">×</button></div>
    <p class="sheet-sub">${who}, ${rightsLine}</p>
    <div class="sheet-body">${body}</div>
    ${foot ? `<div class="sheet-foot">${foot}</div>` : ''}
  </div>`;
}

function finishGame(game) {
  const done = archive(game);
  state.game = null;
  state.finishedGame = done;
  state.sheet = null;
  setView('finish');
}

views.finish = () => {
  const g = state.finishedGame;
  if (!g) { state.view = 'home'; return views.home(); }
  const st = standings(g);
  const sum = gameTotals(g).reduce((a, b) => a + b, 0);
  const expected = expectedGameTotal(g.rules);
  const full = g.hands.length >= handsTotal(g.rules);
  const check = !full ? `${g.hands.length} el oynandı, oyun erken bitirildi.`
    : sum === expected ? `Toplam ${sum}, hesap tutuyor.`
      : `Toplam ${sum}, beklenen ${expected}: bir el eksik ya da hatalı girilmiş olabilir.`;
  return `<div class="screen">
  <header class="topbar"><span></span><h1>Oyun bitti</h1><span></span></header>
  <div class="panel podium">${st.map(s => `<div class="standing${s.rank === 1 ? ' first' : ''}"><span class="rank num">${s.rank}.</span><span class="name">${esc(g.players[s.seat])}</span><span class="total num ${cls(s.total)}">${formatPoints(s.total)}</span></div>`).join('')}</div>
  <p class="check${full && sum !== expected ? ' bad' : ''}">${esc(check)}</p>
  <div class="stack">
    <button class="btn btn-primary btn-block" data-action="share">Sonucu paylaş</button>
    <button class="btn btn-block" data-action="rematch">Aynı oyuncularla yeni oyun</button>
    <button class="btn btn-ghost btn-block" data-action="go" data-view="home">Ana ekran</button>
  </div>
</div>`;
};

// ---------- eylemler (tablo, panel) ----------
Object.assign(actions, {
  'board-mode'({ mode }) { state.boardMode = mode; render(); },
  'open-sheet'() { state.menuOpen = false; state.sheet = { step: 'type', type: null, counts: null, trumpSuit: null, editIndex: null }; render(); },
  'sheet-close'() { state.sheet = null; render(); },
  'sheet-back'() { state.sheet.step = 'type'; render(); },
  'pick-type'({ type }) {
    const sh = state.sheet;
    const prev = sh.editIndex !== null ? state.game.hands[sh.editIndex] : null;
    const keep = prev && prev.type === type;
    sh.type = type;
    sh.counts = keep ? [...prev.counts] : new Array(PLAYER_COUNT).fill(0);
    sh.trumpSuit = keep ? prev.trumpSuit || null : null;
    sh.step = 'counts';
    render();
  },
  inc({ index }) {
    const sh = state.sheet;
    const sum = sh.counts.reduce((a, b) => a + b, 0);
    if (sum < TYPE_BY_ID[sh.type].total) { sh.counts[Number(index)] += 1; renderSheet(); }
  },
  dec({ index }) {
    const sh = state.sheet;
    if (sh.counts[Number(index)] > 0) { sh.counts[Number(index)] -= 1; renderSheet(); }
  },
  fill({ index }) {
    const sh = state.sheet;
    const sum = sh.counts.reduce((a, b) => a + b, 0);
    sh.counts[Number(index)] += Math.max(0, TYPE_BY_ID[sh.type].total - sum);
    renderSheet();
  },
  'pick-rifki'({ index }) { state.sheet.counts = state.sheet.counts.map((_, i) => (i === Number(index) ? 1 : 0)); renderSheet(); },
  'pick-suit'({ suit }) { state.sheet.trumpSuit = state.sheet.trumpSuit === suit ? null : suit; renderSheet(); },
  'save-hand'() {
    const sh = state.sheet;
    const g = state.game;
    if (!sh || !g) return;
    const v = validateCounts(sh.type, sh.counts);
    if (!v.ok) return toast(v.error);
    const editing = sh.editIndex !== null;
    const handIndex = editing ? sh.editIndex : g.hands.length;
    const hand = makeHand(sh.type, dealerForHand(g, handIndex), sh.counts, sh.trumpSuit);
    const next = editing ? withHandReplaced(g, sh.editIndex, hand) : withHand(g, hand);
    state.game = next;
    state.sheet = null;
    persist();
    if (!editing && isFinished(next)) return finishGame(next);
    render();
    toast(editing ? 'El güncellendi' : `${handIndex + 1}. el kaydedildi`);
  },
  'edit-hand'({ index }) {
    if (state.viewGame) return;
    const h = state.game?.hands[Number(index)];
    if (!h) return;
    state.menuOpen = false;
    state.sheet = { step: 'counts', type: h.type, counts: [...h.counts], trumpSuit: h.trumpSuit || null, editIndex: Number(index) };
    render();
  },
  'delete-hand'({ index }) {
    if (!confirm(`${Number(index) + 1}. el silinsin mi? Sonraki eller bir sıra öne kayar.`)) return;
    state.game = withoutHand(state.game, Number(index));
    state.sheet = null;
    persist();
    render();
    toast('El silindi');
  },
  'undo-last'() {
    state.menuOpen = false;
    const n = state.game.hands.length;
    if (!n || !confirm(`Son el (${n}.) silinsin mi?`)) return render();
    state.game = withoutHand(state.game, n - 1);
    persist();
    render();
    toast('Son el silindi');
  },
  'menu-toggle'() { state.menuOpen = !state.menuOpen; render(); },
  'menu-close'() { state.menuOpen = false; render(); },
  'finish-early'() {
    state.menuOpen = false;
    if (!confirm('Oyun şimdi bitirilsin mi? Kalan eller oynanmamış sayılır.')) return render();
    finishGame(state.game);
  },
  abandon() {
    state.menuOpen = false;
    if (!confirm('Bu oyun tamamen silinsin mi? Skorlar geçmişe kaydedilmez.')) return render();
    state.game = null;
    store.clearCurrent();
    setView('home');
    toast('Oyun silindi');
  },
  'exit-board'() { state.viewGame = null; setView('home'); },
  'open-history'({ id }) {
    const g = store.loadHistory().find(x => x.id === id);
    if (!g) return;
    state.viewGame = g;
    state.boardMode = 'detail';
    setView('board');
  },
  'delete-history'({ id }) {
    state.menuOpen = false;
    if (!confirm('Bu oyun geçmişten silinsin mi?')) return render();
    store.removeFromHistory(id);
    state.viewGame = null;
    setView('home');
    toast('Oyun geçmişten silindi');
  },
  rematch() {
    const g = state.finishedGame;
    state.draft = { names: [...g.players], firstDealer: (g.firstDealer + 1) % PLAYER_COUNT };
    setView('new');
  },
});

// ---------- ayarlar ve istatistik ----------
views.settings = () => {
  const s = state.settings || (state.settings = store.loadSettings());
  const row = (key, label, desc) => `<div class="toggle-row"><span><span class="t">${label}</span><br><span class="d">${desc}</span></span><button class="switch" role="switch" aria-checked="${Boolean(s[key])}" data-action="toggle" data-key="${key}" aria-label="${label}"></button></div>`;
  return `<div class="screen">
  <header class="topbar"><button class="icon-btn" data-action="go" data-view="home" aria-label="Geri">‹</button><h1>Ayarlar</h1><span></span></header>
  <p class="hint">Değişiklikler yeni oyunlarda geçerli olur; devam eden oyun kendi kurallarıyla sürer.</p>
  <div class="section"><h2>Puanlar (birim başına)</h2><div class="panel" style="padding:8px 14px"><div class="points-grid">
    ${HAND_TYPES.map(t => `${mcard(t.id)}<label for="pt-${t.id}">${esc(t.name)} <span style="color:var(--muted);font-size:13px">/ ${esc(t.unit)}</span></label><input class="input num" id="pt-${t.id}" type="number" inputmode="numeric" step="10" data-field="points" data-type="${t.id}" value="${Number.isFinite(s.pointsPer[t.id]) ? s.pointsPer[t.id] : ''}">`).join('')}
  </div></div></div>
  <div class="section"><h2>Kurallar</h2><div class="panel" style="padding:0 14px">
    ${row('enforceQuotas', 'Hakları zorunlu tut', 'Oyuncu başına 3 ceza, 2 koz; her ceza en fazla 2 kez')}
    ${row('noKozFirstRound', 'İlk 4 elde koz yok', 'Ev kuralı: ilk turda koz seçilemez')}
    <div class="toggle-row" style="border-bottom:0"><span><span class="t">King eşiği</span><br><span class="d">Koz elinde bu kadar ve üstü el alan "King yapmış" sayılır</span></span><input class="input num" type="number" inputmode="numeric" min="1" max="13" style="width:76px;text-align:right" aria-label="King eşiği" data-field="kingThreshold" value="${Number.isFinite(s.kingThreshold) ? s.kingThreshold : ''}"></div>
  </div></div>
  <div class="stack"><button class="btn btn-primary btn-block" data-action="settings-save">Ayarları kaydet</button><button class="btn btn-ghost" data-action="settings-reset">Varsayılanlara dön</button></div>
  <div class="section"><h2>Veriler</h2><div class="stack" style="margin-top:0">
    <button class="btn btn-block" data-action="export">Yedek al</button>
    <label class="btn btn-block" for="import-file">Yedekten geri yükle</label><input id="import-file" type="file" accept="application/json,.json" data-field="import-file" hidden>
    <button class="btn btn-danger btn-block" data-action="wipe">Tüm verileri sil</button>
  </div></div>
  <p class="hint" style="text-align:center;margin-top:24px">King Skor ${esc(APP_VERSION)}. Veriler yalnızca bu cihazda saklanır.</p>
</div>`;
};

views.stats = () => {
  const stats = playerStats(store.loadHistory());
  const threshold = store.loadSettings().kingThreshold;
  return `<div class="screen">
  <header class="topbar"><button class="icon-btn" data-action="go" data-view="home" aria-label="Geri">‹</button><h1>İstatistikler</h1><span></span></header>
  ${stats.length ? `<div class="panel" style="padding:4px 10px;overflow-x:auto"><table class="table"><thead><tr><th>Oyuncu</th><th>Oyun</th><th>Galibiyet</th><th>Ortalama</th><th>En iyi</th><th>En kötü</th><th>King</th></tr></thead><tbody>
    ${stats.map(p => `<tr><td>${esc(p.name)}</td><td class="num">${p.games}</td><td class="num">${p.wins}</td><td class="num ${cls(p.avgTotal)}">${formatPoints(p.avgTotal)}</td><td class="num ${cls(p.best)}">${formatPoints(p.best)}</td><td class="num ${cls(p.worst)}">${formatPoints(p.worst)}</td><td class="num">${p.kings}</td></tr>`).join('')}
  </tbody></table></div><p class="hint" style="margin-top:12px">King: koz elinde ${threshold} ve üstü el almak.</p>`
    : '<div class="panel empty">Biten oyun olunca oyuncu istatistikleri burada toplanır.</div>'}
</div>`;
};

function speak(text) {
  if (!('speechSynthesis' in window)) return toast('Bu cihazda sesli okuma desteklenmiyor');
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'tr-TR';
  const voice = speechSynthesis.getVoices().find(v => v.lang?.toLowerCase().startsWith('tr'));
  if (voice) u.voice = voice;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

async function share(text) {
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
  } catch (e) {
    if (e?.name === 'AbortError') return;
  }
  try { await navigator.clipboard.writeText(text); toast('Sonuç panoya kopyalandı'); }
  catch { toast('Paylaşım bu tarayıcıda desteklenmiyor'); }
}

function exportBackup() {
  const json = store.exportAll();
  const name = `king-skor-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) { navigator.share({ files: [file], title: 'King Skor yedeği' }).catch(() => {}); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

Object.assign(actions, {
  speak() { state.menuOpen = false; render(); speak(speechText(activeGame())); },
  share() {
    state.menuOpen = false;
    render();
    const g = state.view === 'finish' ? state.finishedGame : activeGame();
    if (g) share(summaryText(g));
  },
  toggle({ key }) { state.settings[key] = !state.settings[key]; render(); },
  'settings-save'() {
    const s = state.settings;
    const bad = HAND_TYPES.find(t => !Number.isInteger(s.pointsPer[t.id]));
    if (bad) return toast(`${bad.name} puanı tam sayı olmalı`);
    if (!Number.isInteger(s.kingThreshold) || s.kingThreshold < 1 || s.kingThreshold > 13) return toast('King eşiği 1 ile 13 arasında olmalı');
    store.saveSettings(s);
    toast('Ayarlar kaydedildi');
  },
  'settings-reset'() { state.settings = cloneRules(DEFAULT_RULES); render(); toast('Varsayılanlar yüklendi, kaydetmeyi unutmayın'); },
  export() { exportBackup(); },
  wipe() {
    if (!confirm('Tüm oyunlar, geçmiş ve ayarlar silinsin mi? Bu işlem geri alınamaz.')) return;
    store.wipeAll();
    state.game = null;
    state.settings = null;
    setView('home');
    toast('Tüm veriler silindi');
  },
});

document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset?.field !== 'import-file') return;
  const file = el.files?.[0];
  el.value = '';
  if (!file) return;
  const text = await file.text();
  if (!confirm('Bu cihazdaki tüm veriler yedektekilerle değiştirilecek. Devam edilsin mi?')) return;
  const r = store.importAll(text);
  if (!r.ok) return toast(r.error);
  state.game = store.loadCurrent();
  state.settings = null;
  setView('home');
  toast('Yedek geri yüklendi');
});

// ---------- başlat ----------
if ('serviceWorker' in navigator && !window.__KING_BUNDLE__) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) toast('Yeni sürüm hazır', { label: 'Yenile', action: 'reload', sticky: true });
        });
      });
    }).catch(() => {});
  });
}
if (storage.memory) toast('Tarayıcı depolamayı engelliyor: uygulama kapanınca oyun kaybolur.', { sticky: true });
render();

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
    <span><span class="title">${esc(g.players.join(', '))}</span><span class="sub">El ${g.hands.length}/${handsTotal(g.rules)}, ${esc(g.players[currentDealer(g)])} konuşuyor</span></span>
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

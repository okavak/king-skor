// store.js — localStorage üstünde kalıcılık. Tüm okuma/yazmalar try/catch ile korunur.
import { DEFAULT_RULES, cloneRules, isValidGame } from './rules.js';

const PREFIX = 'king:v1:';
const KEYS = {
  current: PREFIX + 'current',
  history: PREFIX + 'history',
  settings: PREFIX + 'settings',
  names: PREFIX + 'names',
  flags: PREFIX + 'flags',
};
const HISTORY_CAP = 200;
const NAMES_CAP = 50;
const EXPORT_VERSION = 1;

const normName = n => String(n).trim().toLocaleLowerCase('tr-TR');

export function createStore(storage) {
  function read(key, fallback) {
    try {
      const raw = storage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      const v = JSON.parse(raw);
      return v === null || v === undefined ? fallback : v;
    } catch {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
  const isPlainObject = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

  function loadCurrent() {
    const g = read(KEYS.current, null);
    return isValidGame(g) ? g : null;
  }
  function loadHistory() {
    const h = read(KEYS.history, []);
    return Array.isArray(h) ? h.filter(isValidGame) : [];
  }
  function saveHistory(list) { return write(KEYS.history, list.slice(0, HISTORY_CAP)); }
  function loadSettings() {
    const s = read(KEYS.settings, {});
    const base = cloneRules(DEFAULT_RULES);
    if (!isPlainObject(s)) return base;
    return { ...base, ...s, pointsPer: { ...base.pointsPer, ...(isPlainObject(s.pointsPer) ? s.pointsPer : {}) } };
  }
  function loadNames() {
    const n = read(KEYS.names, []);
    return Array.isArray(n) ? n.filter(x => typeof x === 'string') : [];
  }
  function loadFlags() {
    const f = read(KEYS.flags, {});
    return isPlainObject(f) ? f : {};
  }

  return {
    loadCurrent,
    saveCurrent: game => write(KEYS.current, game),
    clearCurrent: () => write(KEYS.current, null),
    loadHistory,
    addToHistory(game) {
      const list = loadHistory().filter(g => g.id !== game.id);
      list.unshift(game);
      return saveHistory(list);
    },
    removeFromHistory(id) { return saveHistory(loadHistory().filter(g => g.id !== id)); },
    loadSettings,
    saveSettings: settings => write(KEYS.settings, settings),
    loadNames,
    saveNames(names) {
      const clean = [];
      for (const n of names) {
        if (typeof n !== 'string' || !n.trim()) continue;
        if (!clean.some(c => normName(c) === normName(n))) clean.push(n.trim());
      }
      return write(KEYS.names, clean.slice(0, NAMES_CAP));
    },
    wipeAll() { for (const k of Object.values(KEYS)) write(k, null); },
    loadFlag: name => Boolean(loadFlags()[name]),
    setFlag(name, value) { return write(KEYS.flags, { ...loadFlags(), [name]: Boolean(value) }); },
    exportAll() {
      return JSON.stringify({
        version: EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        current: loadCurrent(),
        history: loadHistory(),
        settings: loadSettings(),
        names: loadNames(),
      }, null, 2);
    },
    importAll(json) {
      let data;
      try { data = JSON.parse(json); } catch { return { ok: false, error: 'Dosya okunamadı: geçerli JSON değil' }; }
      if (!isPlainObject(data) || data.version !== EXPORT_VERSION) return { ok: false, error: 'Bu dosya King Skor yedeği değil' };
      const history = Array.isArray(data.history) ? data.history : [];
      if (!history.every(isValidGame)) return { ok: false, error: 'Yedekteki oyun kayıtları bozuk' };
      if (data.current !== null && data.current !== undefined && !isValidGame(data.current)) return { ok: false, error: 'Yedekteki devam eden oyun bozuk' };
      const names = Array.isArray(data.names) ? data.names.filter(x => typeof x === 'string') : [];
      const settings = isPlainObject(data.settings) ? data.settings : {};
      write(KEYS.current, data.current ?? null);
      saveHistory(history);
      write(KEYS.names, names.slice(0, NAMES_CAP));
      write(KEYS.settings, settings);
      return { ok: true };
    },
  };
}

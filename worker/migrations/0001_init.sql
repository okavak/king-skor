-- 0001_init.sql — ortak grup kaydı. Grup kodu erişim anahtarıdır; silme yumuşaktır (deleted = 1), veri kaybolmaz.
CREATE TABLE groups (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- data: oyunun tam kaydı (JSON), gelecekteki analizlerin kaynağı.
-- summary: analysis.js summarizeGame çıktısı; summary_v eskiyse data'dan yeniden üretilir.
CREATE TABLE games (
  group_code TEXT NOT NULL REFERENCES groups(code),
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  summary TEXT NOT NULL,
  summary_v INTEGER NOT NULL,
  finished_at TEXT,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_code, id)
);

-- Elle birleştirilen adlar: from_key → to_key (to_key her zaman köktür).
CREATE TABLE aliases (
  group_code TEXT NOT NULL REFERENCES groups(code),
  from_key TEXT NOT NULL,
  to_key TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (group_code, from_key)
);

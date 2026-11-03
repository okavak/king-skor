-- 0002_admin_members.sql — grup yöneticisi ve resmi oyuncu listesi.
-- admin_hash: yönetici anahtarının SHA-256 özeti (anahtarın kendisi saklanmaz). Boşsa grubun yöneticisi yoktur.
ALTER TABLE groups ADD COLUMN admin_hash TEXT;

-- Resmi liste: sıralamada bu yazımla görünür; oyunu olmayanlar da listelenir.
CREATE TABLE members (
  group_code TEXT NOT NULL REFERENCES groups(code),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (group_code, key)
);

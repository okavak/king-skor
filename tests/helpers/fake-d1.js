// Cloudflare D1 bağlamasının testte kullanılan kısmı, node:sqlite üstünde. Gerçek D1 gibi:
// prepare().bind().first()/all()/run(), batch() tek işlemde (biri düşerse hepsi geri alınır), yabancı anahtarlar açık.
import { DatabaseSync } from 'node:sqlite';

export function createFakeD1(schemaSql) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(schemaSql);
  const plain = row => (row ? { ...row } : null);

  const statement = (query, args = []) => ({
    bind: (...values) => statement(query, values),
    async first(column) {
      const row = plain(db.prepare(query).get(...args));
      return column ? (row ? row[column] : null) : row;
    },
    async all() {
      return { success: true, meta: {}, results: db.prepare(query).all(...args).map(plain) };
    },
    async run() {
      const info = db.prepare(query).run(...args);
      return { success: true, meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) }, results: [] };
    },
  });

  return {
    prepare: query => statement(query),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        db.exec('COMMIT');
        return results;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    raw: db,
  };
}

'use strict';

/**
 * ToolQuiver local store — better-sqlite3 backed library + settings.
 */

const path = require('path');
const Database = require('better-sqlite3');

let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical TEXT UNIQUE NOT NULL,
  source_type TEXT NOT NULL,
  platform TEXT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  url TEXT DEFAULT '',
  images TEXT DEFAULT '[]',
  cover_path TEXT,
  category TEXT DEFAULT 'Utilities',
  category_id TEXT DEFAULT 'utilities',
  confidence REAL DEFAULT 0,
  tags TEXT DEFAULT '[]',
  setup TEXT DEFAULT '{}',
  stats TEXT DEFAULT '{}',
  meta TEXT DEFAULT '{}',
  note TEXT DEFAULT '',
  favorite INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_items_created ON items(created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);
`;

function init(dbPath) {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  return api;
}

const row = (r) => {
  if (!r) return null;
  for (const k of ['images', 'tags', 'setup', 'stats', 'meta']) {
    try { r[k] = JSON.parse(r[k] || (k === 'setup' || k === 'stats' || k === 'meta' ? '{}' : '[]')); }
    catch { r[k] = k === 'images' || k === 'tags' ? [] : {}; }
  }
  r.favorite = !!r.favorite;
  return r;
};

const api = {
  addItem(item, coverPath = null) {
    const stmt = db.prepare(`
      INSERT INTO items (canonical, source_type, platform, name, description, url, images, cover_path,
        category, category_id, confidence, tags, setup, stats, meta)
      VALUES (@canonical, @source_type, @platform, @name, @description, @url, @images, @cover_path,
        @category, @category_id, @confidence, @tags, @setup, @stats, @meta)
      ON CONFLICT(canonical) DO UPDATE SET
        name=excluded.name, description=excluded.description, url=excluded.url,
        images=excluded.images, cover_path=COALESCE(excluded.cover_path, cover_path),
        category=excluded.category, category_id=excluded.category_id,
        confidence=excluded.confidence, tags=excluded.tags, setup=excluded.setup,
        stats=excluded.stats, meta=excluded.meta
    `);
    stmt.run({
      canonical: item.canonical, source_type: item.sourceType, platform: item.platform || null,
      name: item.name, description: item.description || '', url: item.url || '',
      images: JSON.stringify(item.images || []), cover_path: coverPath,
      category: item.category, category_id: item.categoryId, confidence: item.confidence || 0,
      tags: JSON.stringify(item.tags || []), setup: JSON.stringify(item.setup || {}),
      stats: JSON.stringify(item.stats || {}), meta: JSON.stringify(item.meta || {}),
    });
    // Always retrieve by canonical URL: lastInsertRowid is unreliable on the
    // ON CONFLICT DO UPDATE path (it can return a stale rowid), while the
    // canonical column is UNIQUE and always identifies the right row.
    const row = db.prepare('SELECT id FROM items WHERE canonical = ?').get(item.canonical);
    return api.getItem(row.id);
  },

  getItem(id) { return row(db.prepare('SELECT * FROM items WHERE id = ?').get(id)); },

  listItems({ q = '', category = '', favoritesOnly = false, sort = 'newest' } = {}) {
    const where = [];
    const params = [];
    if (q) { where.push('(name LIKE ? OR description LIKE ? OR tags LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (category) { where.push('category_id = ?'); params.push(category); }
    if (favoritesOnly) where.push('favorite = 1');
    const order = sort === 'name' ? 'name COLLATE NOCASE ASC' : sort === 'stars' ? 'json_extract(stats, "$.stars") DESC' : 'created_at DESC';
    const sql = `SELECT * FROM items ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT 500`;
    return db.prepare(sql).all(...params).map(row);
  },

  categories() {
    return db.prepare(`SELECT category_id AS id, category AS label, COUNT(*) AS count
      FROM items GROUP BY category_id ORDER BY count DESC`).all();
  },

  count() { return db.prepare('SELECT COUNT(*) AS n FROM items').get().n; },

  deleteItem(id) { db.prepare('DELETE FROM items WHERE id = ?').run(id); },

  toggleFavorite(id) {
    db.prepare('UPDATE items SET favorite = 1 - favorite WHERE id = ?').run(id);
    return api.getItem(id);
  },

  updateNote(id, note) {
    db.prepare('UPDATE items SET note = ? WHERE id = ?').run(note, id);
    return api.getItem(id);
  },

  updateCategory(id, categoryId, categoryLabel) {
    db.prepare('UPDATE items SET category_id = ?, category = ? WHERE id = ?').run(categoryId, categoryLabel, id);
    return api.getItem(id);
  },

  getSetting(key, fallback = '') {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return r ? r.value : fallback;
  },

  setSetting(key, value) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));
  },

  exportData() {
    return db.prepare('SELECT * FROM items ORDER BY created_at DESC').all().map(row);
  },
};

module.exports = { init };

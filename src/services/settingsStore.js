const { getDb } = require('../db');

function getAll() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const result = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

function get(key, defaultValue = '') {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
}

function set(key, value) {
  const now = new Date().toISOString();
  const db = getDb();
  const existing = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key);
  if (existing) {
    db.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?').run(value, now, key);
  } else {
    db.prepare('INSERT INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)').run(key, value, now, now);
  }
}

function setMany(map) {
  const now = new Date().toISOString();
  const db = getDb();
  const update = db.prepare('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?');
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value, created_at, updated_at) VALUES (?, ?, ?, ?)');

  const run = db.transaction(() => {
    for (const [key, value] of Object.entries(map)) {
      update.run(value, now, key);
      insert.run(key, value, now, now);
    }
  });

  run();
}

module.exports = {
  getAll,
  get,
  set,
  setMany
};

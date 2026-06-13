const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'gost17025.db');
const LEGACY_JSON = path.join(DATA_DIR, 'store.json');

const DEFAULT_DATA = {
  users: [{
    id: 'admin-1',
    email: 'admin@gost17025.pro',
    password: 'admin123',
    nickname: 'Администратор',
    role: 'admin',
    registeredAt: new Date().toISOString(),
    proPaidAt: null,
    proExpiresAt: null,
    blocked: false,
    lastActive: new Date().toISOString()
  }],
  proTopics: [],
  messages: { free: [], 'admin-support': [] },
  notifications: [],
  proRequests: []
};

let db;

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function initDb() {
  ensureDirs();
  db = new Database(DB_FILE);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_store (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL DEFAULT 1,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      data_url TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const row = db.prepare('SELECT version, data FROM app_store WHERE id = 1').get();
  if (!row) {
    migrateLegacyJson();
    if (!db.prepare('SELECT 1 FROM app_store WHERE id = 1').get()) {
      insertInitial();
    }
  }
}

function insertInitial() {
  db.prepare(`
    INSERT INTO app_store (id, version, data, updated_at)
    VALUES (1, 1, ?, datetime('now'))
  `).run(JSON.stringify(DEFAULT_DATA));
}

function migrateLegacyJson() {
  if (!fs.existsSync(LEGACY_JSON)) return;
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_JSON, 'utf8'));
    if (legacy?.data) {
      db.prepare(`
        INSERT INTO app_store (id, version, data, updated_at)
        VALUES (1, ?, ?, datetime('now'))
      `).run(legacy.version || 1, JSON.stringify(legacy.data));
      fs.renameSync(LEGACY_JSON, LEGACY_JSON + '.bak');
    }
  } catch (err) {
    console.warn('Legacy JSON migration skipped:', err.message);
  }
}

function getStore() {
  const row = db.prepare('SELECT version, data FROM app_store WHERE id = 1').get();
  return {
    version: row.version,
    data: JSON.parse(row.data)
  };
}

function saveStore(data) {
  const current = db.prepare('SELECT version FROM app_store WHERE id = 1').get();
  const version = (current?.version || 0) + 1;
  db.prepare(`
    UPDATE app_store
    SET version = ?, data = ?, updated_at = datetime('now')
    WHERE id = 1
  `).run(version, JSON.stringify(data));
  return version;
}

function getFile(id) {
  const row = db.prepare('SELECT data_url FROM files WHERE id = ?').get(id);
  return row ? row.data_url : null;
}

function saveFile(id, dataUrl) {
  db.prepare(`
    INSERT INTO files (id, data_url, created_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET data_url = excluded.data_url
  `).run(id, dataUrl);
}

function deleteFile(id) {
  db.prepare('DELETE FROM files WHERE id = ?').run(id);
}

module.exports = {
  initDb,
  getStore,
  saveStore,
  getFile,
  saveFile,
  deleteFile
};

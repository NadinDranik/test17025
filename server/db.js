const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { ensurePasswordHash, isPasswordHash } = require('./auth');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'gost17025.db');
const LEGACY_JSON = path.join(DATA_DIR, 'store.json');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@gost17025.pro').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

const DEFAULT_DATA = {
  users: [],
  proTopics: [],
  messages: { free: [], 'admin-support': [] },
  notifications: [],
  proRequests: []
};

let db;

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function createDefaultAdmin() {
  return {
    id: 'admin-1',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    nickname: 'Администратор',
    role: 'admin',
    registeredAt: new Date().toISOString(),
    proPaidAt: null,
    proExpiresAt: null,
    blocked: false,
    lastActive: new Date().toISOString()
  };
}

async function hashAllPasswords(data) {
  let changed = false;
  for (const user of data.users) {
    if (user.password && !isPasswordHash(user.password)) {
      user.password = await ensurePasswordHash(user.password);
      changed = true;
    }
  }
  return changed;
}

async function ensureAdminUser(data) {
  const idx = data.users.findIndex(u => u.email.toLowerCase() === ADMIN_EMAIL);
  if (idx === -1) {
    data.users.unshift(createDefaultAdmin());
    await hashAllPasswords(data);
    return true;
  }
  const admin = data.users[idx];
  let changed = false;
  if (admin.role !== 'admin') {
    admin.role = 'admin';
    changed = true;
  }
  if (admin.blocked) {
    admin.blocked = false;
    changed = true;
  }
  if (!admin.password || !isPasswordHash(admin.password)) {
    admin.password = await ensurePasswordHash(admin.password || ADMIN_PASSWORD);
    changed = true;
  }
  return changed;
}

async function initDb() {
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
      const data = { ...DEFAULT_DATA, users: [createDefaultAdmin()] };
      await hashAllPasswords(data);
      insertInitial(data);
    }
  } else {
    const store = JSON.parse(row.data);
    const changed = await ensureAdminUser(store);
    if (changed) {
      saveStore(store, false);
    } else {
      const hashed = await hashAllPasswords(store);
      if (hashed) saveStore(store, false);
    }
  }
}

function insertInitial(data) {
  db.prepare(`
    INSERT INTO app_store (id, version, data, updated_at)
    VALUES (1, 1, ?, datetime('now'))
  `).run(JSON.stringify(data));
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

function saveStore(data, bumpVersion = true) {
  const current = db.prepare('SELECT version FROM app_store WHERE id = 1').get();
  const version = bumpVersion ? (current?.version || 0) + 1 : (current?.version || 1);
  db.prepare(`
    UPDATE app_store
    SET version = ?, data = ?, updated_at = datetime('now')
    WHERE id = 1
  `).run(version, JSON.stringify(data));
  return version;
}

function updateStore(mutator) {
  const store = getStore();
  const next = mutator(store.data) || store.data;
  const version = saveStore(next);
  return { version, data: next };
}

function findUserById(id) {
  const { data } = getStore();
  return data.users.find(u => u.id === id) || null;
}

function findUserByEmail(email) {
  const { data } = getStore();
  return data.users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
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

function getDataDir() {
  return DATA_DIR;
}

module.exports = {
  initDb,
  getStore,
  saveStore,
  updateStore,
  findUserById,
  findUserByEmail,
  getFile,
  saveFile,
  deleteFile,
  getDataDir,
  ADMIN_EMAIL
};

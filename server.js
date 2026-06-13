/**
 * Локальный сервер с общим хранилищем для синхронизации между устройствами.
 * Запуск: npm install && npm start
 * Открыть с телефона: http://<IP-компьютера>:3000
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const FILES_DIR = path.join(DATA_DIR, 'files');
const PORT = process.env.PORT || 3000;

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

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
}

function readStore() {
  ensureDirs();
  if (!fs.existsSync(STORE_FILE)) {
    const initial = { version: 1, data: DEFAULT_DATA };
    fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch {
    const initial = { version: 1, data: DEFAULT_DATA };
    fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
}

function writeStore(store) {
  ensureDirs();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function safeFileId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

app.use(express.json({ limit: '50mb' }));

app.get('/api/data', (req, res) => {
  const store = readStore();
  res.json({ version: store.version, data: store.data });
});

app.put('/api/data', (req, res) => {
  const { data } = req.body || {};
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Некорректные данные' });
  }
  const store = readStore();
  store.version += 1;
  store.data = data;
  writeStore(store);
  res.json({ ok: true, version: store.version });
});

app.get('/api/files/:id', (req, res) => {
  const id = safeFileId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Некорректный id' });
  const filePath = path.join(FILES_DIR, id);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл не найден' });
  res.json({ dataUrl: fs.readFileSync(filePath, 'utf8') });
});

app.put('/api/files/:id', (req, res) => {
  const id = safeFileId(req.params.id);
  const { dataUrl } = req.body || {};
  if (!id || !dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ error: 'Некорректный файл' });
  }
  ensureDirs();
  fs.writeFileSync(path.join(FILES_DIR, id), dataUrl, 'utf8');
  res.json({ ok: true });
});

app.delete('/api/files/:id', (req, res) => {
  const id = safeFileId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Некорректный id' });
  const filePath = path.join(FILES_DIR, id);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ ok: true });
});

app.use(express.static(ROOT));

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  Гид PRO — сервер запущен');
  console.log('  На этом компьютере:  http://localhost:' + PORT);
  console.log('  С телефона (Wi‑Fi):  http://<IP-этого-ПК>:' + PORT);
  console.log('');
  console.log('  Важно: и телефон, и ПК должны открывать сайт по этому адресу.');
  console.log('');
});

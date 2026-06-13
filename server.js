/**
 * Сервер с SQLite и WebSocket для синхронизации между устройствами.
 * Запуск: npm install && npm start
 */
const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const db = require('./server/db');

const app = express();
const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

db.initDb();

function safeFileId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function broadcast(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(payload);
  });
}

app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, storage: 'sqlite' });
});

app.get('/api/data', (req, res) => {
  const store = db.getStore();
  res.json({ version: store.version, data: store.data });
});

app.put('/api/data', (req, res) => {
  const { data } = req.body || {};
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Некорректные данные' });
  }
  const version = db.saveStore(data);
  broadcast({ type: 'data-updated', version });
  res.json({ ok: true, version });
});

app.get('/api/files/:id', (req, res) => {
  const id = safeFileId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Некорректный id' });
  const dataUrl = db.getFile(id);
  if (!dataUrl) return res.status(404).json({ error: 'Файл не найден' });
  res.json({ dataUrl });
});

app.put('/api/files/:id', (req, res) => {
  const id = safeFileId(req.params.id);
  const { dataUrl } = req.body || {};
  if (!id || !dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ error: 'Некорректный файл' });
  }
  db.saveFile(id, dataUrl);
  res.json({ ok: true });
});

app.delete('/api/files/:id', (req, res) => {
  const id = safeFileId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Некорректный id' });
  db.deleteFile(id);
  res.json({ ok: true });
});

app.use(express.static(ROOT));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  const store = db.getStore();
  ws.send(JSON.stringify({ type: 'connected', version: store.version }));

  ws.on('error', () => {});
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  Гид PRO — сервер с базой данных SQLite');
  console.log('  Компьютер:  http://localhost:' + PORT);
  console.log('  Телефон:    http://<IP-этого-ПК>:' + PORT);
  console.log('');
  console.log('  Откройте этот адрес на телефоне и на ПК — данные синхронизируются мгновенно.');
  console.log('');
});

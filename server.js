/**
 * Сервер с SQLite и WebSocket для синхронизации между устройствами.
 * Запуск: npm install && npm start
 */
const express = require('express');
const http = require('http');
const path = require('path');
const session = require('express-session');
const { WebSocketServer } = require('ws');
const db = require('./server/db');
const { attachUser, requireAdminPage } = require('./server/middleware');
const {
  registerAuthRoutes,
  registerDataRoutes,
  registerFileRoutes,
  registerAdminRoutes,
  registerProRoutes,
  registerPublicRoutes
} = require('./server/routes');
const { registerAccountRoutes } = require('./server/account-routes');
const { registerPaymentRoutes } = require('./server/payment-routes');
const paymentsDb = require('./server/payments-db');
const { registerBlogRoutes } = require('./server/blog-routes');
const { sendHtmlWithMeta, createSiteMetaMiddleware } = require('./server/site-meta');

const app = express();
const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const cookieSecure = process.env.COOKIE_SECURE === 'true';

if (isProduction) {
  app.set('trust proxy', 1);
}

let wss;
let broadcast;

function safeFileId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

async function start() {
  await db.initDb();
  paymentsDb.initPaymentsDb();

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  app.use(session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: cookieSecure,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  }));

  app.use(attachUser);

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      storage: 'sqlite',
      dataDir: db.getDataDir()
    });
  });

  registerAuthRoutes(app);
  registerPublicRoutes(app, (msg) => broadcast(msg));
  registerBlogRoutes(app, (msg) => broadcast(msg));
  registerDataRoutes(app, (msg) => broadcast(msg));
  registerFileRoutes(app);
  registerAdminRoutes(app, (msg) => broadcast(msg));
  registerProRoutes(app);
  registerAccountRoutes(app, (msg) => broadcast(msg));
  registerPaymentRoutes(app, (msg) => broadcast(msg));

  app.get('/admin.html', requireAdminPage, (req, res) => {
    sendHtmlWithMeta(req, res, path.join(ROOT, 'admin.html'));
  });

  app.get('/site.webmanifest', (req, res) => {
    res.type('application/manifest+json');
    res.sendFile(path.join(ROOT, 'site.webmanifest'));
  });

  app.use(createSiteMetaMiddleware(ROOT));

  app.use(express.static(ROOT, {
    index: false
  }));

  const server = http.createServer(app);
  wss = new WebSocketServer({ server, path: '/ws' });

  broadcast = function broadcastMessage(message) {
    const payload = JSON.stringify(message);
    wss.clients.forEach(client => {
      if (client.readyState === 1) client.send(payload);
    });
  };

  wss.on('connection', (ws) => {
    const store = db.getStore();
    ws.send(JSON.stringify({ type: 'connected', version: store.version }));
    ws.on('error', () => {});
  });

  setInterval(() => {
    try {
      const store = db.getStore();
      const { processExpiredSubscriptions } = require('./server/subscriptions');
      if (processExpiredSubscriptions(store.data)) {
        const version = db.saveStore(store.data);
        broadcast({ type: 'data-updated', version });
      }
    } catch (err) {
      console.error('Subscription expiry check error:', err);
    }
  }, 60 * 60 * 1000);

  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('  Гид PRO — сервер с базой данных SQLite');
    console.log('  Порт:       ' + PORT);
    console.log('  База:       ' + path.join(db.getDataDir(), 'gost17025.db'));
    console.log('  Режим:      ' + (isProduction ? 'production' : 'development'));
    console.log('');
  });
}

start().catch(err => {
  console.error('Не удалось запустить сервер:', err);
  process.exit(1);
});

const express = require('express');
const { hashPassword, verifyPassword, sanitizeUser, sanitizeUsers } = require('./auth');
const db = require('./db');
const { mergeStore } = require('./validate-store');
const { expireSubscriptions } = require('./roles');
const { buildAccountProfile, appendProHistory } = require('./account');
const { filterMessagesForUser, getAdminInboxFromStore } = require('./dm');
const {
  requireAuth,
  requireAdmin,
  requirePro,
  sendSafeUser
} = require('./middleware');

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeNickname(nickname) {
  return (nickname || '').trim().replace(/\s+/g, ' ');
}

function isNicknameTaken(data, nickname, excludeUserId) {
  const n = normalizeNickname(nickname).toLowerCase();
  return data.users.some(u =>
    u.id !== excludeUserId && normalizeNickname(u.nickname).toLowerCase() === n
  );
}

function sanitizeStoreDataForUser(data, user) {
  return {
    ...data,
    users: sanitizeUsers(data.users),
    messages: filterMessagesForUser(data.messages, user)
  };
}

function sanitizeStoreData(data) {
  return sanitizeStoreDataForUser(data, { role: 'admin', id: 'admin' });
}

function registerAuthRoutes(app) {
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, nickname } = req.body || {};
      const emailNorm = (email || '').trim().toLowerCase();
      const nick = normalizeNickname(nickname);

      if (!emailNorm || !password || !nick) {
        return res.status(400).json({ error: 'Заполните все поля' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Пароль не менее 8 символов' });
      }
      if (nick.length < 2 || nick.length > 30) {
        return res.status(400).json({ error: 'Ник от 2 до 30 символов' });
      }
      if (emailNorm === db.ADMIN_EMAIL) {
        return res.status(400).json({ error: 'Этот email зарезервирован для администратора' });
      }

      const store = db.getStore();
      if (store.data.users.some(u => u.email.toLowerCase() === emailNorm)) {
        return res.status(400).json({ error: 'Пользователь с таким email уже зарегистрирован' });
      }
      if (isNicknameTaken(store.data, nick)) {
        return res.status(400).json({ error: 'Этот ник уже занят' });
      }

      const user = {
        id: uid(),
        email: emailNorm,
        password: await hashPassword(password),
        nickname: nick,
        role: 'user',
        registeredAt: new Date().toISOString(),
        proPaidAt: null,
        proExpiresAt: null,
        blocked: false,
        lastActive: new Date().toISOString()
      };

      store.data.users.push(user);
      db.saveStore(store.data);
      req.session.userId = user.id;
      res.json({ ok: true, user: sanitizeUser(user) });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Ошибка регистрации' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const emailNorm = (email || '').trim().toLowerCase();
      const user = db.findUserByEmail(emailNorm);

      if (!user || !(await verifyPassword(password, user.password))) {
        return res.status(401).json({ error: 'Неверный email или пароль' });
      }
      if (user.blocked) {
        return res.status(403).json({ error: 'Аккаунт заблокирован администратором' });
      }

      db.updateStore(data => {
        const u = data.users.find(x => x.id === user.id);
        if (u) u.lastActive = new Date().toISOString();
        expireSubscriptions(data.users);
        return data;
      });

      req.session.userId = user.id;
      const fresh = db.findUserById(user.id);
      res.json({ ok: true, user: sanitizeUser(fresh) });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Ошибка входа' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  app.get('/api/auth/me', sendSafeUser);
}

function registerDataRoutes(app, broadcast) {
  app.get('/api/data', requireAuth, (req, res) => {
    const store = db.getStore();
    expireSubscriptions(store.data.users);
    res.json({
      version: store.version,
      data: sanitizeStoreDataForUser(store.data, req.user)
    });
  });

  app.put('/api/data', requireAuth, (req, res) => {
    const { data } = req.body || {};
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Некорректные данные' });
    }

    const store = db.getStore();
    const serverData = store.data;
    const merged = mergeStore(serverData, data, req.user);

    merged.users = merged.users.map(mu => {
      const original = serverData.users.find(u => u.id === mu.id);
      return original ? { ...mu, password: original.password } : mu;
    });

    expireSubscriptions(merged.users);
    const version = db.saveStore(merged);
    broadcast({ type: 'data-updated', version });
    res.json({ ok: true, version });
  });

  app.delete('/api/messages', requireAuth, (req, res) => {
    const { chatId, messageId } = req.body || {};
    if (!chatId || !messageId) {
      return res.status(400).json({ error: 'chatId и messageId обязательны' });
    }

    const { canAccessChat } = require('./roles');
    const { isAdminDmChat, canAccessDmChat } = require('./dm');

    const canRead = isAdminDmChat(chatId)
      ? canAccessDmChat(req.user, chatId)
      : canAccessChat(req.user, chatId);
    if (!canRead) {
      return res.status(403).json({ error: 'Нет доступа к чату' });
    }

    const store = db.getStore();
    const msgs = store.data.messages[chatId];
    if (!msgs) return res.json({ ok: true });

    const msg = msgs.find(m => m.id === messageId);
    if (!msg) return res.json({ ok: true });

    if (msg.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Можно удалять только свои сообщения' });
    }

    (msg.files || []).forEach(f => {
      if (f.id) db.deleteFile(f.id);
    });

    const version = db.updateStore(data => {
      if (!data.messages[chatId]) return data;
      data.messages[chatId] = data.messages[chatId].filter(m => m.id !== messageId);
      return data;
    }).version;

    broadcast({ type: 'data-updated', version });
    res.json({ ok: true, version });
  });
}

function safeFileId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function registerFileRoutes(app) {
  app.get('/api/files/:id', requireAuth, (req, res) => {
    const id = safeFileId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Некорректный id' });
    const dataUrl = db.getFile(id);
    if (!dataUrl) return res.status(404).json({ error: 'Файл не найден' });
    res.json({ dataUrl });
  });

  app.put('/api/files/:id', requireAuth, (req, res) => {
    const id = safeFileId(req.params.id);
    const { dataUrl } = req.body || {};
    if (!id || !dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'Некорректный файл' });
    }
    db.saveFile(id, dataUrl);
    res.json({ ok: true });
  });

  app.delete('/api/files/:id', requireAuth, (req, res) => {
    const id = safeFileId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Некорректный id' });
    db.deleteFile(id);
    res.json({ ok: true });
  });
}

function registerAdminRoutes(app, broadcast) {
  const router = express.Router();
  router.use(requireAdmin);

  function notifyAndSave(mutator) {
    const { version, data } = db.updateStore(mutator);
    broadcast({ type: 'data-updated', version });
    return data;
  }

  router.post('/grant-pro', (req, res) => {
    const { userId, days } = req.body || {};
    const d = Number(days) || 30;
    if (!userId) return res.status(400).json({ error: 'userId обязателен' });

    const data = notifyAndSave(store => {
      const user = store.users.find(u => u.id === userId);
      if (!user || user.role === 'admin') return store;
      const now = new Date().toISOString();
      user.proPaidAt = now;
      user.proExpiresAt = new Date(Date.now() + d * 86400000).toISOString();
      appendProHistory(store, userId, {
        type: 'grant',
        days: d,
        proPaidAt: user.proPaidAt,
        proExpiresAt: user.proExpiresAt,
        note: `PRO выдан на ${d} дн.`
      });
      store.proRequests?.forEach(r => {
        if (r.userId === userId && r.status === 'pending') {
          r.status = 'processed';
          r.processedAt = now;
        }
      });
      store.notifications.unshift({
        id: uid(),
        userId,
        text: 'PRO-доступ активирован до ' + new Date(user.proExpiresAt).toLocaleDateString('ru-RU'),
        type: 'info',
        refId: null,
        read: false,
        createdAt: now
      });
      return store;
    });

    const user = data.users.find(u => u.id === userId);
    res.json({ ok: true, user: sanitizeUser(user) });
  });

  router.post('/extend-pro', (req, res) => {
    const { userId, days } = req.body || {};
    const d = Number(days) || 30;
    if (!userId) return res.status(400).json({ error: 'userId обязателен' });

    const data = notifyAndSave(store => {
      const user = store.users.find(u => u.id === userId);
      if (!user || user.role === 'admin') return store;
      const base = user.proExpiresAt && new Date(user.proExpiresAt) > new Date()
        ? new Date(user.proExpiresAt)
        : new Date();
      base.setDate(base.getDate() + d);
      user.proPaidAt = new Date().toISOString();
      user.proExpiresAt = base.toISOString();
      appendProHistory(store, userId, {
        type: 'extend',
        days: d,
        proPaidAt: user.proPaidAt,
        proExpiresAt: user.proExpiresAt,
        note: `PRO продлён на ${d} дн.`
      });
      store.notifications.unshift({
        id: uid(),
        userId,
        text: 'PRO-подписка продлена до ' + base.toLocaleDateString('ru-RU'),
        type: 'info',
        refId: null,
        read: false,
        createdAt: new Date().toISOString()
      });
      return store;
    });

    const user = data.users.find(u => u.id === userId);
    res.json({ ok: true, user: sanitizeUser(user) });
  });

  router.post('/set-pro-expiry', (req, res) => {
    const { userId, dateStr } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId обязателен' });

    const data = notifyAndSave(store => {
      const user = store.users.find(u => u.id === userId);
      if (!user || user.role === 'admin') return store;
      if (dateStr) {
        user.proExpiresAt = new Date(dateStr).toISOString();
        user.proPaidAt = new Date().toISOString();
      } else {
        user.proExpiresAt = null;
        user.proPaidAt = null;
      }
      appendProHistory(store, userId, {
        type: 'set_expiry',
        days: null,
        proPaidAt: user.proPaidAt,
        proExpiresAt: user.proExpiresAt,
        note: dateStr ? `Дата окончания: ${dateStr}` : 'PRO отключён'
      });
      return store;
    });

    res.json({ ok: true, user: sanitizeUser(data.users.find(u => u.id === userId)) });
  });

  router.post('/revoke-pro', (req, res) => {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId обязателен' });

    notifyAndSave(store => {
      const user = store.users.find(u => u.id === userId);
      if (!user || user.role === 'admin') return store;
      user.proExpiresAt = null;
      user.proPaidAt = null;
      appendProHistory(store, userId, {
        type: 'revoke',
        days: null,
        proPaidAt: null,
        proExpiresAt: null,
        note: 'PRO-доступ отключён администратором'
      });
      return store;
    });

    res.json({ ok: true });
  });

  router.post('/block-user', (req, res) => {
    const { userId, blocked } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId обязателен' });

    notifyAndSave(store => {
      const user = store.users.find(u => u.id === userId);
      if (!user || user.role === 'admin') return store;
      user.blocked = !!blocked;
      return store;
    });

    res.json({ ok: true });
  });

  router.post('/pro-request/processed', (req, res) => {
    const { requestId } = req.body || {};
    if (!requestId) return res.status(400).json({ error: 'requestId обязателен' });

    notifyAndSave(store => {
      const reqItem = store.proRequests?.find(r => r.id === requestId);
      if (reqItem && reqItem.status === 'pending') {
        reqItem.status = 'processed';
        reqItem.processedAt = new Date().toISOString();
      }
      return store;
    });

    res.json({ ok: true });
  });

  router.post('/topics', (req, res) => {
    const { title, description } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: 'Название обязательно' });

    const data = notifyAndSave(store => {
      const topic = {
        id: uid(),
        title: title.trim(),
        description: (description || '').trim(),
        pinned: false,
        hidden: false,
        createdAt: new Date().toISOString()
      };
      store.proTopics.push(topic);
      store.messages[topic.id] = [];
      return store;
    });

    res.json({ ok: true, topics: data.proTopics });
  });

  router.patch('/topics/:id', (req, res) => {
    const { id } = req.params;
    const patch = req.body || {};

    notifyAndSave(store => {
      const idx = store.proTopics.findIndex(t => t.id === id);
      if (idx === -1) return store;
      store.proTopics[idx] = { ...store.proTopics[idx], ...patch };
      return store;
    });

    res.json({ ok: true });
  });

  router.delete('/topics/:id', (req, res) => {
    const { id } = req.params;

    notifyAndSave(store => {
      store.proTopics = store.proTopics.filter(t => t.id !== id);
      delete store.messages[id];
      return store;
    });

    res.json({ ok: true });
  });

  router.delete('/messages', (req, res) => {
    const { chatId, messageId } = req.body || {};
    if (!chatId || !messageId) {
      return res.status(400).json({ error: 'chatId и messageId обязательны' });
    }

    notifyAndSave(store => {
      if (!store.messages[chatId]) return store;
      store.messages[chatId] = store.messages[chatId].filter(m => m.id !== messageId);
      return store;
    });

    res.json({ ok: true });
  });

  router.get('/users/:userId/account', (req, res) => {
    const store = db.getStore();
    const profile = buildAccountProfile(req.params.userId, store.data);
    if (!profile) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(profile);
  });

  router.get('/inbox', (req, res) => {
    const store = db.getStore();
    res.json(getAdminInboxFromStore(store.data));
  });

  app.use('/api/admin', router);
}

function registerProRoutes(app) {
  app.get('/api/pro/status', requireAuth, (req, res) => {
    const { isProActive, getSubscriptionStatus } = require('./roles');
    res.json({
      status: getSubscriptionStatus(req.user),
      active: isProActive(req.user)
    });
  });

  app.get('/api/pro/topics', requirePro, (req, res) => {
    const store = db.getStore();
    const topics = store.data.proTopics.filter(t => !t.hidden);
    res.json({ topics });
  });
}

module.exports = {
  registerAuthRoutes,
  registerDataRoutes,
  registerFileRoutes,
  registerAdminRoutes,
  registerProRoutes
};

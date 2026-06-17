const express = require('express');
const { hashPassword, verifyPassword } = require('./auth');
const db = require('./db');
const { buildAccountProfile } = require('./account');
function requireAuthAllowBlocked(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  const user = db.findUserById(req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'Пользователь не найден' });
  }
  req.user = user;
  next();
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

function registerAccountRoutes(app, broadcast) {
  const router = express.Router();
  router.use(requireAuthAllowBlocked);

  router.get('/', (req, res) => {
    const store = db.getStore();
    const profile = buildAccountProfile(req.user.id, store.data);
    if (!profile) return res.status(404).json({ error: 'Профиль не найден' });
    res.json(profile);
  });

  router.patch('/nickname', (req, res) => {
    const nick = normalizeNickname(req.body?.nickname);
    if (!nick || nick.length < 2 || nick.length > 30) {
      return res.status(400).json({ error: 'Ник от 2 до 30 символов' });
    }

    const store = db.getStore();
    if (isNicknameTaken(store.data, nick, req.user.id)) {
      return res.status(400).json({ error: 'Этот ник уже занят' });
    }

    db.updateStore(data => {
      const u = data.users.find(x => x.id === req.user.id);
      if (u) u.nickname = nick;
      return data;
    });
    broadcast({ type: 'data-updated', version: db.getStore().version });

    const profile = buildAccountProfile(req.user.id, db.getStore().data);
    res.json({ ok: true, profile });
  });

  router.post('/password', async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Укажите текущий и новый пароль' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Новый пароль не менее 8 символов' });
      }

      const fresh = db.findUserById(req.user.id);
      if (!(await verifyPassword(currentPassword, fresh.password))) {
        return res.status(400).json({ error: 'Неверный текущий пароль' });
      }

      const hash = await hashPassword(newPassword);
      db.updateStore(data => {
        const u = data.users.find(x => x.id === req.user.id);
        if (u) u.password = hash;
        return data;
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('Password change error:', err);
      res.status(500).json({ error: 'Ошибка смены пароля' });
    }
  });

  app.use('/api/account', router);
}

module.exports = {
  registerAccountRoutes,
  requireAuthAllowBlocked
};

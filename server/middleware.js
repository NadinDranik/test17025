const db = require('./db');
const { sanitizeUser } = require('./auth');
const { isProActive } = require('./roles');

function getSessionUser(req) {
  if (!req.session?.userId) return null;
  const user = db.findUserById(req.session.userId);
  if (!user || user.blocked) return null;
  return user;
}

function attachUser(req, res, next) {
  req.user = getSessionUser(req);
  next();
}

function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ только для администратора' });
  }
  req.user = user;
  next();
}

function requirePro(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  if (!isProActive(user)) {
    return res.status(403).json({ error: 'Требуется активная PRO-подписка' });
  }
  req.user = user;
  next();
}

function requireAdminPage(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    return res.redirect('/login.html?next=admin.html');
  }
  if (user.role !== 'admin') {
    return res.status(403).send('Доступ запрещён. Эта страница только для администратора.');
  }
  next();
}

function sendSafeUser(req, res) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Не авторизован' });
  }
  res.json({ user: sanitizeUser(user) });
}

module.exports = {
  getSessionUser,
  attachUser,
  requireAuth,
  requireAdmin,
  requirePro,
  requireAdminPage,
  sendSafeUser
};

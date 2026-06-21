function isProActive(user) {
  if (!user || user.blocked) return false;
  if (user.role === 'admin') return true;
  if (!user.proExpiresAt) return false;
  return new Date(user.proExpiresAt) > new Date();
}

function getSubscriptionStatus(user) {
  if (!user) return 'guest';
  if (user.role === 'admin') return 'admin';
  if (user.blocked) return 'blocked';
  if (isProActive(user)) return 'pro';
  if (user.proExpiresAt && new Date(user.proExpiresAt) <= new Date()) return 'expired';
  return 'free';
}

function expireSubscriptions(users, store) {
  if (store) {
    const { processExpiredSubscriptions } = require('./subscriptions');
    return processExpiredSubscriptions(store);
  }
  const now = new Date();
  return (users || []).some(u =>
    u.role !== 'admin' && u.proExpiresAt && new Date(u.proExpiresAt) <= now
  );
}

function canAccessProChat(user) {
  return isProActive(user);
}

function canAccessChat(user, chatId) {
  if (!user || user.blocked) return false;
  if (chatId === 'free') return true;
  const { isAdminDmChat, canAccessDmChat } = require('./dm');
  if (isAdminDmChat(chatId)) return canAccessDmChat(user, chatId);
  if (chatId === 'admin-support') return false;
  return canAccessProChat(user);
}

module.exports = {
  isProActive,
  getSubscriptionStatus,
  expireSubscriptions,
  canAccessProChat,
  canAccessChat
};

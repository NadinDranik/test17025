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

function expireSubscriptions(users) {
  const now = new Date();
  let changed = false;
  (users || []).forEach(u => {
    if (u.role !== 'admin' && u.proExpiresAt && new Date(u.proExpiresAt) <= now) {
      changed = true;
    }
  });
  return changed;
}

function canAccessProChat(user) {
  return isProActive(user);
}

function canAccessChat(user, chatId) {
  if (!user || user.blocked) return false;
  if (chatId === 'free' || chatId === 'admin-support') return true;
  return canAccessProChat(user);
}

module.exports = {
  isProActive,
  getSubscriptionStatus,
  expireSubscriptions,
  canAccessProChat,
  canAccessChat
};

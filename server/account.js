const { sanitizeUser } = require('./auth');
const { isProActive, getSubscriptionStatus, expireSubscriptions } = require('./roles');

const STATUS_LABELS = {
  admin: 'Администратор',
  pro: 'PRO',
  free: 'Free',
  expired: 'Free',
  blocked: 'Заблокирован',
  guest: 'Гость'
};

const PRO_HISTORY_LABELS = {
  grant: 'Выдача PRO',
  extend: 'Продление PRO',
  revoke: 'Отключение PRO',
  set_expiry: 'Изменение даты окончания'
};

function formatDateRu(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

function calcDaysLeft(proExpiresAt) {
  if (!proExpiresAt) return null;
  const days = Math.ceil((new Date(proExpiresAt) - new Date()) / 86400000);
  return days > 0 ? days : 0;
}

function buildAccountProfile(userId, storeData) {
  const data = storeData;
  expireSubscriptions(data.users || []);

  const user = data.users.find(u => u.id === userId);
  if (!user) return null;

  const status = getSubscriptionStatus(user);
  const displayStatus = status === 'expired' ? 'free' : status;
  const proActive = isProActive(user);
  const daysLeft = proActive && user.proExpiresAt ? calcDaysLeft(user.proExpiresAt) : null;

  const proHistory = (data.proHistory || [])
    .filter(h => h.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(h => ({
      ...h,
      typeLabel: PRO_HISTORY_LABELS[h.type] || h.type,
      proPaidAtFormatted: formatDateRu(h.proPaidAt),
      proExpiresAtFormatted: formatDateRu(h.proExpiresAt),
      createdAtFormatted: formatDateRu(h.createdAt)
    }));

  const proRequests = (data.proRequests || [])
    .filter(r => r.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(r => ({
      id: r.id,
      status: r.status,
      text: r.text || '',
      createdAt: r.createdAt,
      processedAt: r.processedAt || null,
      createdAtFormatted: formatDateRu(r.createdAt),
      processedAtFormatted: formatDateRu(r.processedAt)
    }));

  const adminUser = data.users.find(u => u.role === 'admin');
  const { getAdminDmChatId } = require('./dm');
  const dmChat = data.messages?.[getAdminDmChatId(userId)] || [];
  const adminMessages = dmChat
    .filter(m => adminUser && m.userId === adminUser.id && m.systemType !== 'pro_welcome')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10)
    .map(m => ({
      id: m.id,
      text: m.text || '',
      authorName: m.authorName || 'Администратор',
      createdAt: m.createdAt,
      createdAtFormatted: formatDateRu(m.createdAt)
    }));

  return {
    user: sanitizeUser(user),
    status: displayStatus,
    statusLabel: STATUS_LABELS[displayStatus] || STATUS_LABELS.free,
    proActive,
    registeredAt: user.registeredAt,
    registeredAtFormatted: formatDateRu(user.registeredAt),
    proPaidAt: user.proPaidAt,
    proPaidAtFormatted: formatDateRu(user.proPaidAt),
    proExpiresAt: user.proExpiresAt,
    proExpiresAtFormatted: formatDateRu(user.proExpiresAt),
    daysLeft,
    blocked: !!user.blocked,
    proHistory,
    proRequests,
    adminMessages
  };
}

function appendProHistory(store, userId, entry) {
  if (!store.proHistory) store.proHistory = [];
  store.proHistory.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    userId,
    type: entry.type,
    days: entry.days ?? null,
    proPaidAt: entry.proPaidAt ?? null,
    proExpiresAt: entry.proExpiresAt ?? null,
    createdAt: new Date().toISOString(),
    note: entry.note || ''
  });
  if (store.proHistory.length > 500) {
    store.proHistory = store.proHistory.slice(0, 500);
  }
}

module.exports = {
  buildAccountProfile,
  appendProHistory,
  STATUS_LABELS,
  PRO_HISTORY_LABELS
};

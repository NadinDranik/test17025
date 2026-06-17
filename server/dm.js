const { canAccessProChat } = require('./roles');
const DM_PREFIX = 'dm:';

function getAdminDmChatId(userId) {
  return DM_PREFIX + userId;
}

function isAdminDmChat(chatId) {
  return typeof chatId === 'string' && chatId.startsWith(DM_PREFIX);
}

function getDmUserId(chatId) {
  if (!isAdminDmChat(chatId)) return null;
  return chatId.slice(DM_PREFIX.length);
}

function canAccessDmChat(user, chatId) {
  if (!user || user.blocked) return false;
  if (user.role === 'admin') return true;
  return getDmUserId(chatId) === user.id;
}

function filterMessagesForUser(messages, user) {
  const all = messages || {};
  if (user.role === 'admin') {
    const filtered = { ...all };
    delete filtered['admin-support'];
    return filtered;
  }

  const result = {};
  if (all.free) result.free = all.free;

  const ownDm = getAdminDmChatId(user.id);
  if (all[ownDm]) result[ownDm] = all[ownDm];

  Object.keys(all).forEach(chatId => {
    if (chatId === 'free' || chatId === 'admin-support' || isAdminDmChat(chatId)) return;
    if (canAccessProChat(user)) result[chatId] = all[chatId];
  });

  return result;
}

function getAdminInboxFromStore(storeData) {
  const users = storeData.users || [];
  const messages = storeData.messages || {};
  const admin = users.find(u => u.role === 'admin');
  const conversations = [];

  users.forEach(u => {
    if (u.role === 'admin') return;
    const chatId = getAdminDmChatId(u.id);
    const msgs = (messages[chatId] || []).slice().sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
    );
    if (!msgs.length) return;
    const last = msgs[msgs.length - 1];
    const lastFromUser = last.userId === u.id;
    conversations.push({
      userId: u.id,
      userEmail: u.email,
      userNickname: u.nickname || u.email.split('@')[0],
      chatId,
      messageCount: msgs.length,
      lastMessage: last.text || (last.files?.length ? '📎 ' + last.files.map(f => f.name).join(', ') : ''),
      lastAt: last.createdAt,
      lastFromUser,
      needsReply: lastFromUser
    });
  });

  conversations.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
  return { adminId: admin?.id || null, conversations };
}

module.exports = {
  DM_PREFIX,
  getAdminDmChatId,
  isAdminDmChat,
  getDmUserId,
  canAccessDmChat,
  filterMessagesForUser,
  getAdminInboxFromStore
};

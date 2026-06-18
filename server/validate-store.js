const { canAccessChat, canAccessProChat } = require('./roles');
const { isAdminDmChat, canAccessDmChat } = require('./dm');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeUserRecord(serverUser, clientUser, actor) {
  const merged = { ...serverUser };

  if (actor.role === 'admin') {
    merged.nickname = clientUser.nickname ?? merged.nickname;
    merged.email = clientUser.email ?? merged.email;
    merged.role = clientUser.role ?? merged.role;
    merged.blocked = !!clientUser.blocked;
    merged.proPaidAt = clientUser.proPaidAt ?? merged.proPaidAt;
    merged.proExpiresAt = clientUser.proExpiresAt ?? merged.proExpiresAt;
    merged.lastActive = clientUser.lastActive ?? merged.lastActive;
    merged.registeredAt = clientUser.registeredAt ?? merged.registeredAt;
    merged.avatarFileId = clientUser.avatarFileId ?? merged.avatarFileId;
    return merged;
  }

  if (actor.id === serverUser.id) {
    merged.nickname = clientUser.nickname ?? merged.nickname;
    merged.lastActive = clientUser.lastActive ?? merged.lastActive;
    merged.avatarFileId = clientUser.avatarFileId ?? merged.avatarFileId;
  }

  return merged;
}

function mergeUsers(serverUsers, clientUsers, actor) {
  const byId = new Map(serverUsers.map(u => [u.id, u]));
  const clientIds = new Set();

  clientUsers.forEach(cu => {
    clientIds.add(cu.id);
    const su = byId.get(cu.id);
    if (!su) return;
    byId.set(cu.id, mergeUserRecord(su, cu, actor));
  });

  return Array.from(byId.values());
}

function mergeProRequests(serverList, clientList, actor) {
  const server = serverList || [];
  const client = clientList || [];

  if (actor.role === 'admin') {
    const byId = new Map(server.map(r => [r.id, r]));
    client.forEach(cr => {
      const sr = byId.get(cr.id);
      if (sr) byId.set(cr.id, { ...sr, ...cr });
      else byId.set(cr.id, cr);
    });
    return Array.from(byId.values());
  }

  const byId = new Map(server.map(r => [r.id, r]));
  client.forEach(cr => {
    if (!byId.has(cr.id) && cr.userId === actor.id) {
      byId.set(cr.id, cr);
    }
  });
  return Array.from(byId.values());
}

function mergeReactions(serverReactions, clientReactions, actorId) {
  const server = serverReactions || {};
  const client = clientReactions || {};
  const result = {};
  const emojis = new Set([...Object.keys(server), ...Object.keys(client)]);

  emojis.forEach(emoji => {
    const users = new Set(server[emoji] || []);
    const clientUsers = new Set(client[emoji] || []);
    if (users.has(actorId) && !clientUsers.has(actorId)) users.delete(actorId);
    if (!users.has(actorId) && clientUsers.has(actorId)) users.add(actorId);
    if (users.size) result[emoji] = [...users];
  });

  return result;
}

function mergeMessagesForChat(serverMsgs, clientMsgs, actor, chatId) {
  const server = serverMsgs || [];
  const client = clientMsgs || [];

  if (isAdminDmChat(chatId)) {
    if (!canAccessDmChat(actor, chatId)) return server;
  } else if (!canAccessChat(actor, chatId)) {
    return server;
  }

  const byId = new Map(server.map(m => [m.id, m]));

  client.forEach(cm => {
    const sm = byId.get(cm.id);
    if (!sm) {
      if (cm.userId === actor.id || actor.role === 'admin') {
        byId.set(cm.id, cm);
      }
      return;
    }

    if (actor.role === 'admin') {
      byId.set(cm.id, cm);
      return;
    }

    let merged = { ...sm };

    if (sm.userId === actor.id && cm.userId === actor.id) {
      merged = {
        ...sm,
        text: cm.text,
        editedAt: cm.editedAt,
        files: cm.files,
        pinned: sm.pinned
      };
    }

    if (cm.reactions) {
      merged.reactions = mergeReactions(sm.reactions, cm.reactions, actor.id);
    }

    byId.set(cm.id, merged);
  });

  if (actor.role === 'admin') {
    const clientIds = new Set(client.map(m => m.id));
    server.forEach(sm => {
      if (!clientIds.has(sm.id)) byId.delete(sm.id);
    });
  } else {
    const clientIds = new Set(client.map(m => m.id));
    server.forEach(sm => {
      if (sm.userId === actor.id && !clientIds.has(sm.id)) {
        byId.delete(sm.id);
      }
    });
  }

  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
}

function mergeMessages(serverMessages, clientMessages, actor) {
  const result = { ...(serverMessages || {}) };
  const chatIds = new Set([
    ...Object.keys(serverMessages || {}),
    ...Object.keys(clientMessages || {})
  ]);

  chatIds.forEach(chatId => {
    result[chatId] = mergeMessagesForChat(
      serverMessages?.[chatId],
      clientMessages?.[chatId],
      actor,
      chatId
    );
  });

  return result;
}

function mergeNotifications(serverList, clientList, actor) {
  const server = serverList || [];
  const client = clientList || [];

  if (actor.role === 'admin') {
    const byId = new Map(server.map(n => [n.id, n]));
    client.forEach(cn => {
      const sn = byId.get(cn.id);
      if (sn) byId.set(cn.id, { ...sn, read: cn.read });
      else if (cn.userId === actor.id) byId.set(cn.id, cn);
    });
    return Array.from(byId.values());
  }

  const byId = new Map(server.map(n => [n.id, n]));
  client.forEach(cn => {
    if (cn.userId !== actor.id) return;
    const sn = byId.get(cn.id);
    if (sn) {
      byId.set(cn.id, { ...sn, read: cn.read });
    }
  });
  return Array.from(byId.values());
}

function mergeProTopics(serverTopics, clientTopics, actor) {
  if (actor.role === 'admin') {
    return clone(clientTopics || []);
  }
  return clone(serverTopics || []);
}

function mergeStore(serverData, clientData, actor) {
  return {
    users: mergeUsers(serverData.users || [], clientData.users || [], actor),
    proTopics: mergeProTopics(serverData.proTopics, clientData.proTopics, actor),
    messages: mergeMessages(serverData.messages, clientData.messages, actor),
    notifications: mergeNotifications(serverData.notifications, clientData.notifications, actor),
    proRequests: mergeProRequests(serverData.proRequests, clientData.proRequests, actor),
    proHistory: serverData.proHistory || []
  };
}

module.exports = { mergeStore };

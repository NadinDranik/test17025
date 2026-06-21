const db = require('./db');

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeGuestName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').slice(0, 30);
}

function publicProTopics(proTopics) {
  return (proTopics || [])
    .filter(t => !t.hidden)
    .map(t => ({
      id: t.id,
      title: t.title,
      description: t.description || '',
      pinned: !!t.pinned,
      hidden: false,
      createdAt: t.createdAt
    }))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
}

function registerPublicRoutes(app, broadcast) {
  app.get('/api/public/chats', (req, res) => {
    const store = db.getStore();
    res.json({
      version: store.version,
      messages: { free: store.data.messages?.free || [] },
      proTopics: publicProTopics(store.data.proTopics)
    });
  });

  app.post('/api/public/free/messages', (req, res) => {
    try {
      const { text, guestName, replyTo } = req.body || {};
      const trimmed = String(text || '').trim();
      const name = normalizeGuestName(guestName);

      if (!trimmed) {
        return res.status(400).json({ error: 'Введите текст сообщения' });
      }
      if (!name || name.length < 2) {
        return res.status(400).json({ error: 'Укажите имя (от 2 символов)' });
      }
      if (trimmed.length > 4000) {
        return res.status(400).json({ error: 'Слишком длинное сообщение' });
      }

      if (!req.session.guestId) {
        req.session.guestId = uid();
      }
      const guestUserId = 'guest:' + req.session.guestId;

      const store = db.getStore();
      const freeMsgs = store.data.messages?.free || [];
      if (replyTo && !freeMsgs.some(m => m.id === replyTo)) {
        return res.status(400).json({ error: 'Сообщение для ответа не найдено' });
      }

      const msg = {
        id: uid(),
        userId: guestUserId,
        authorEmail: '',
        authorName: name,
        text: trimmed,
        replyTo: replyTo || null,
        files: [],
        createdAt: new Date().toISOString(),
        editedAt: null,
        pinned: false,
        reactions: {},
        views: {},
        guest: true
      };

      const version = db.updateStore(data => {
        if (!data.messages.free) data.messages.free = [];
        data.messages.free.push(msg);
        return data;
      }).version;

      broadcast({ type: 'data-updated', version });
      res.json({ ok: true, version, msg });
    } catch (err) {
      console.error('Guest message error:', err);
      res.status(500).json({ error: 'Не удалось отправить сообщение' });
    }
  });
}

function isFileInFreeChat(fileId, storeData) {
  const free = storeData?.messages?.free || [];
  return free.some(m => (m.files || []).some(f => f.id === fileId));
}

module.exports = {
  registerPublicRoutes,
  isFileInFreeChat,
  publicProTopics
};

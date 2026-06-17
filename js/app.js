/**
 * Гид PRO — хранилище данных (localStorage + синхронизация через сервер)
 */
const App = (function () {
  const STORAGE_KEY = 'gost17025_data';
  const SESSION_KEY = 'gost17025_session';
  let syncEnabled = false;
  let serverAvailable = false;
  let syncVersion = 0;
  let syncPollTimer = null;
  let syncSocket = null;
  let syncSocketTimer = null;
  let lastPushPromise = Promise.resolve();
  let _currentUser = null;
  const ADMIN_EMAIL = 'admin@gost17025.pro';
  const API_OPTS = { credentials: 'include' };
  const CHAT_FREE = 'free';
  const CHAT_ADMIN_SUPPORT = 'admin-support';
  const CHAT_DM_PREFIX = 'dm:';

  function getAdminDmChatId(userId) {
    return CHAT_DM_PREFIX + userId;
  }

  function isAdminDmChat(chatId) {
    return typeof chatId === 'string' && chatId.startsWith(CHAT_DM_PREFIX);
  }

  function getDmUserId(chatId) {
    if (!isAdminDmChat(chatId)) return null;
    return chatId.slice(CHAT_DM_PREFIX.length);
  }

  const PRO_PAYMENT_INFO = {
    price: '1000',
    priceLabel: '1000 ₽ в месяц',
    phone: '89824586893',
    bank: 'Альфа банк',
    recipient: 'Надежда Николаевна Д.',
    text: 'Для получения PRO-доступа необходимо оплатить 1000 рублей в месяц по номеру телефона 89824586893 на Альфа банк, Надежда Николаевна Д. Пришлите чек или скрин об оплате — и вам предоставят доступ.'
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function defaultData() {
    return {
      users: [createAdminUser()],
      proTopics: [],
      messages: { free: [], [CHAT_ADMIN_SUPPORT]: [] },
      notifications: [],
      proRequests: [],
      proHistory: []
    };
  }

  function createAdminUser() {
    return {
      id: 'admin-1',
      email: ADMIN_EMAIL,
      nickname: 'Администратор',
      role: 'admin',
      registeredAt: new Date().toISOString(),
      proPaidAt: null,
      proExpiresAt: null,
      blocked: false,
      lastActive: new Date().toISOString()
    };
  }

  /** Администратор управляется только на сервере */
  function ensureAdmin() {
    /* no-op: роль admin и пароль хранятся на сервере */
  }

  function migrateUsers() {
    const data = load();
    let changed = false;
    data.users.forEach(u => {
      if (!u.nickname) {
        u.nickname = u.email ? u.email.split('@')[0] : 'Пользователь';
        changed = true;
      }
      if (u.proPaidAt === undefined) {
        u.proPaidAt = u.proExpiresAt && isProActive(u) ? u.registeredAt : null;
        changed = true;
      }
    });
    if (changed) save(data);
  }

  function getDisplayName(user) {
    if (!user) return 'Гость';
    return (user.nickname || '').trim() || user.email.split('@')[0];
  }

  function getStatusLabel(user) {
    const s = getSubscriptionStatus(user);
    const map = {
      admin: 'Администратор',
      pro: 'PRO',
      free: 'Free',
      expired: 'PRO истёк',
      blocked: 'Заблокирован',
      guest: 'Гость'
    };
    return map[s] || 'Free';
  }

  function normalizeNickname(nickname) {
    return (nickname || '').trim().replace(/\s+/g, ' ');
  }

  function isNicknameTaken(nickname, excludeUserId) {
    const n = normalizeNickname(nickname).toLowerCase();
    return load().users.some(u =>
      u.id !== excludeUserId && normalizeNickname(u.nickname).toLowerCase() === n
    );
  }

  function getAdminWelcomeText() {
    return 'Здравствуйте! Это ваш личный диалог с администратором. Задайте вопрос или, для получения PRO-доступа, отправьте чек об оплате.\n\n' +
      PRO_PAYMENT_INFO.text;
  }

  function migrateAdminSupportToDm() {
    const data = load();
    const shared = data.messages[CHAT_ADMIN_SUPPORT];
    if (!shared || !shared.length) return;
    let changed = false;
    shared.forEach(msg => {
      const user = data.users.find(u => u.id === msg.userId);
      if (!user || user.role === 'admin') return;
      const chatId = getAdminDmChatId(user.id);
      if (!data.messages[chatId]) data.messages[chatId] = [];
      if (!data.messages[chatId].some(m => m.id === msg.id)) {
        data.messages[chatId].push({ ...msg, chatId });
        changed = true;
      }
    });
    shared.filter(m => {
      const author = data.users.find(u => u.id === m.userId);
      return author && author.role === 'admin';
    }).forEach(adminMsg => {
      const userIds = new Set(
        shared.filter(m => {
          const author = data.users.find(u => u.id === m.userId);
          return author && author.role !== 'admin';
        }).map(m => m.userId)
      );
      userIds.forEach(uid => {
        const chatId = getAdminDmChatId(uid);
        if (!data.messages[chatId]) data.messages[chatId] = [];
        if (!data.messages[chatId].some(m => m.id === adminMsg.id)) {
          data.messages[chatId].push({ ...adminMsg });
          changed = true;
        }
      });
    });
    if (changed) save(data);
    delete data.messages[CHAT_ADMIN_SUPPORT];
    save(data);
  }

  function ensureAdminDmWelcome(userId) {
    ensureAdmin();
    const data = load();
    const chatId = getAdminDmChatId(userId);
    if (!data.messages[chatId]) data.messages[chatId] = [];
    const welcomeText = getAdminWelcomeText();
    const admin = data.users.find(u => u.role === 'admin');
    if (!admin) return;

    const existing = data.messages[chatId].find(m => m.systemType === 'pro_welcome');
    if (existing) {
      if (existing.text !== welcomeText) {
        existing.text = welcomeText;
        save(data);
      }
      return;
    }

    data.messages[chatId].unshift({
      id: '__pro_welcome__' + userId,
      userId: admin.id,
      authorEmail: admin.email,
      authorName: 'Администратор',
      text: welcomeText,
      replyTo: null,
      files: [],
      createdAt: new Date().toISOString(),
      editedAt: null,
      pinned: true,
      systemType: 'pro_welcome'
    });
    save(data);
  }

  function ensureProRequestWelcomeMessage() {
    const user = getCurrentUser();
    if (user && user.role !== 'admin') ensureAdminDmWelcome(user.id);
  }

  function ensureAdminSupportChat() {
    const data = load();
    if (!data.proRequests) {
      data.proRequests = [];
      save(data);
    }
    migrateAdminSupportToDm();
    migrateProRequestsFromChat();
  }

  function messagePreview(msg) {
    if (msg.text) return msg.text.slice(0, 80) + (msg.text.length > 80 ? '…' : '');
    if (msg.files && msg.files.length) return '📎 ' + msg.files.map(f => f.name).join(', ');
    return 'новое сообщение';
  }

  function notifyAdminNewMessage(chatId, user, msg) {
    const admin = load().users.find(u => u.role === 'admin');
    if (!admin) return;
    if (isAdminDmChat(chatId)) {
      addNotification(
        admin.id,
        '✉️ ' + getDisplayName(user) + ' (' + user.email + '): ' + messagePreview(msg),
        'private_message',
        msg.id
      );
      if (msg.files && msg.files.length) {
        addProRequest(user, msg);
        addNotification(
          admin.id,
          '🔔 Чек об оплате: ' + getDisplayName(user) + ' (' + user.email + ')',
          'pro_request',
          msg.id
        );
      }
    } else if (chatId === CHAT_FREE) {
      addNotification(
        admin.id,
        '💬 ' + getDisplayName(user) + ' в общем чате: ' + messagePreview(msg),
        'chat_message',
        msg.id
      );
    }
  }

  function migrateProRequestsFromChat() {
    const data = load();
    if (!data.proRequests) data.proRequests = [];
    const chatIds = Object.keys(data.messages || {}).filter(
      id => isAdminDmChat(id) || id === CHAT_ADMIN_SUPPORT
    );
    let changed = false;
    chatIds.forEach(chatId => {
      (data.messages[chatId] || []).forEach(msg => {
        const user = data.users.find(u => u.id === msg.userId);
        if (!user || user.role === 'admin') return;
        if (data.proRequests.some(r => r.messageId === msg.id)) return;
        data.proRequests.push({
          id: uid(),
          userId: user.id,
          userEmail: user.email,
          userNickname: msg.authorName || getDisplayName(user),
          messageId: msg.id,
          text: msg.text || '',
          files: msg.files || [],
          createdAt: msg.createdAt,
          status: isProActive(user) ? 'processed' : 'pending',
          processedAt: isProActive(user) ? new Date().toISOString() : null
        });
        changed = true;
      });
    });
    if (changed) save(data);
  }

  function addProRequest(user, msg) {
    const data = load();
    if (!data.proRequests) data.proRequests = [];
    data.proRequests.unshift({
      id: uid(),
      userId: user.id,
      userEmail: user.email,
      userNickname: getDisplayName(user),
      messageId: msg.id,
      text: msg.text || '',
      files: msg.files || [],
      createdAt: msg.createdAt,
      status: 'pending',
      processedAt: null
    });
    save(data);
  }

  function getProRequests(status) {
    const list = (load().proRequests || []).slice();
    if (status) return list.filter(r => r.status === status)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  function getPendingProRequestCount() {
    return getProRequests('pending').length;
  }

  function getAdminInboxConversations() {
    const data = load();
    const admin = (data.users || []).find(u => u.role === 'admin');
    const adminId = admin?.id;
    const conversations = [];
    (data.users || []).forEach(u => {
      if (u.role === 'admin') return;
      const chatId = getAdminDmChatId(u.id);
      const msgs = (data.messages[chatId] || []).slice().sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );
      if (!msgs.length) return;
      const last = msgs[msgs.length - 1];
      const unreadCount = adminId ? getChatUnreadCount(adminId, chatId) : 0;
      conversations.push({
        userId: u.id,
        userEmail: u.email,
        userNickname: getDisplayName(u),
        chatId,
        messageCount: msgs.length,
        lastMessage: messagePreview(last),
        lastAt: last.createdAt,
        lastFromUser: last.userId === u.id,
        unreadCount,
        needsReply: unreadCount > 0
      });
    });
    return conversations.sort((a, b) => {
      if ((b.unreadCount || 0) !== (a.unreadCount || 0)) {
        return (b.unreadCount || 0) - (a.unreadCount || 0);
      }
      return new Date(b.lastAt) - new Date(a.lastAt);
    });
  }

  function getPendingPrivateMessageCount() {
    const admin = load().users.find(u => u.role === 'admin');
    if (!admin) return 0;
    return getAdminInboxConversations().reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  }

  function getChatLabel(chatId, user) {
    if (chatId === CHAT_FREE) return 'Общий чат';
    if (isAdminDmChat(chatId)) {
      if (user?.role === 'admin') {
        const uid = getDmUserId(chatId);
        const u = load().users.find(x => x.id === uid);
        return u ? getDisplayName(u) : 'Личный диалог';
      }
      return 'Вопрос администратору';
    }
    const topic = load().proTopics.find(t => t.id === chatId);
    return topic ? topic.title : 'Чат';
  }

  function getChatHref(chatId, user) {
    if (chatId === CHAT_FREE) return 'chat.html';
    if (isAdminDmChat(chatId)) {
      if (user?.role === 'admin') {
        return 'admin.html#dm-' + encodeURIComponent(getDmUserId(chatId));
      }
      return 'admin-chat.html';
    }
    return 'pro.html#t=' + encodeURIComponent(chatId);
  }

  function getUnreadChatsSummary(userId) {
    const user = load().users.find(u => u.id === userId);
    if (!user) return [];
    return getAccessibleChatIds(user)
      .map(chatId => ({
        chatId,
        label: getChatLabel(chatId, user),
        href: getChatHref(chatId, user),
        count: getChatUnreadCount(userId, chatId)
      }))
      .filter(item => item.count > 0);
  }

  async function markProRequestProcessed(requestId) {
    await adminRequest('pro-request/processed', 'POST', { requestId });
    return load().proRequests?.find(r => r.id === requestId) || null;
  }

  function markProRequestsProcessedByUser(userId) {
    const data = load();
    let changed = false;
    data.proRequests?.forEach(r => {
      if (r.userId === userId && r.status === 'pending') {
        r.status = 'processed';
        r.processedAt = new Date().toISOString();
        changed = true;
      }
    });
    if (changed) save(data);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const data = defaultData();
        save(data);
        return data;
      }
      return JSON.parse(raw);
    } catch {
      const data = defaultData();
      save(data);
      return data;
    }
  }

  function hasStoredActivity(data) {
    if (!data) return false;
    const msgCount = Object.values(data.messages || {}).reduce((n, arr) => n + (arr?.length || 0), 0);
    return (data.users && data.users.length > 1) || msgCount > 0 || (data.proRequests?.length > 0);
  }

  async function fetchAuthMe() {
    try {
      const res = await fetch('/api/auth/me', { ...API_OPTS, cache: 'no-store' });
      if (res.ok) {
        const payload = await res.json();
        _currentUser = payload.user || null;
        if (_currentUser) setSession(_currentUser.id);
        return _currentUser;
      }
      _currentUser = null;
      setSession(null);
    } catch {
      _currentUser = null;
    }
    return null;
  }

  async function pullFromServer() {
    const res = await fetch('/api/data', { ...API_OPTS, cache: 'no-store' });
    if (res.status === 401) {
      _currentUser = null;
      setSession(null);
      throw new Error('Unauthorized');
    }
    if (!res.ok) throw new Error('API unavailable');
    const payload = await res.json();
    if (payload.version !== syncVersion && payload.data) {
      syncVersion = payload.version || 0;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.data));
      window.dispatchEvent(new CustomEvent('gost-data-synced'));
    } else if (payload.data) {
      syncVersion = payload.version || 0;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.data));
    }
    return payload;
  }

  async function pushToServer(data, wait) {
    if (!syncEnabled) return;
    const task = fetch('/api/data', {
      method: 'PUT',
      ...API_OPTS,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data })
    }).then(res => {
      if (res.status === 401) {
        _currentUser = null;
        return null;
      }
      return res.ok ? res.json() : null;
    }).then(result => {
      if (result?.version) syncVersion = result.version;
    }).catch(err => console.warn('Sync push failed:', err));
    lastPushPromise = task;
    if (wait) await task;
  }

  function awaitSync() {
    return lastPushPromise;
  }

  function applyRemoteVersion(version) {
    if (!version || version === syncVersion) return;
    pullFromServer().catch(() => {});
  }

  function connectSyncSocket() {
    if (!syncEnabled || typeof WebSocket === 'undefined') return;
    if (syncSocket) {
      try { syncSocket.close(); } catch { /* ignore */ }
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    syncSocket = new WebSocket(protocol + '//' + window.location.host + '/ws');

    syncSocket.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data-updated') applyRemoteVersion(msg.version);
        if (msg.type === 'connected' && msg.version) applyRemoteVersion(msg.version);
      } catch { /* ignore */ }
    });

    syncSocket.addEventListener('close', () => {
      if (!syncEnabled) return;
      clearTimeout(syncSocketTimer);
      syncSocketTimer = setTimeout(connectSyncSocket, 2000);
    });

    syncSocket.addEventListener('error', () => {
      try { syncSocket.close(); } catch { /* ignore */ }
    });
  }

  async function activateUserSync() {
    const payload = await pullFromServer();
    const localRaw = localStorage.getItem(STORAGE_KEY);
    const localData = localRaw ? JSON.parse(localRaw) : null;
    if (!hasStoredActivity(payload.data) && hasStoredActivity(localData)) {
      await pushToServer(localData, true);
      await pullFromServer();
    }
    syncEnabled = true;
    connectSyncSocket();
    startSyncPolling();
    window.dispatchEvent(new CustomEvent('gost-sync-ready'));
  }

  async function initSync() {
    if (typeof window === 'undefined' || window.location.protocol === 'file:') return;
    try {
      const health = await fetch('/api/health', { cache: 'no-store' });
      if (!health.ok) throw new Error('API unavailable');
      serverAvailable = true;
      await fetchAuthMe();
      if (_currentUser) {
        await activateUserSync();
      }
    } catch {
      serverAvailable = false;
      syncEnabled = false;
    }
  }

  function startSyncPolling() {
    if (!syncEnabled || syncPollTimer) return;
    syncPollTimer = setInterval(() => {
      pullFromServer().catch(() => {});
    }, 30000);
  }

  function isSyncEnabled() {
    return syncEnabled;
  }

  function isServerAvailable() {
    return serverAvailable;
  }

  /* Хранилище файлов (IndexedDB + сервер при синхронизации) */
  const FileDB = (function () {
    const DB_NAME = 'gost17025_files';
    const STORE = 'files';
    let dbPromise = null;

    function open() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = e => {
          if (!e.target.result.objectStoreNames.contains(STORE)) {
            e.target.result.createObjectStore(STORE);
          }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = () => reject(req.error);
      });
      return dbPromise;
    }

    function tx(store, mode) {
      return open().then(db => db.transaction(STORE, mode).objectStore(STORE));
    }

    function saveLocal(id, dataUrl) {
      return tx(STORE, 'readwrite').then(s => new Promise((resolve, reject) => {
        const req = s.put(dataUrl, id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }));
    }

    function save(id, dataUrl) {
      const local = saveLocal(id, dataUrl);
      if (!syncEnabled) return local;
      return local.then(() =>
        fetch('/api/files/' + encodeURIComponent(id), {
          method: 'PUT',
          ...API_OPTS,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl })
        }).catch(() => {})
      );
    }

    function getLocal(id) {
      return tx(STORE, 'readonly').then(s => new Promise((resolve, reject) => {
        const req = s.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      }));
    }

    function get(id) {
      if (!syncEnabled) return getLocal(id);
      return fetch('/api/files/' + encodeURIComponent(id), { ...API_OPTS })
        .then(res => (res.ok ? res.json() : null))
        .then(payload => {
          if (payload?.dataUrl) {
            return saveLocal(id, payload.dataUrl).then(() => payload.dataUrl);
          }
          return getLocal(id);
        })
        .catch(() => getLocal(id));
    }

    function remove(id) {
      const local = tx(STORE, 'readwrite').then(s => new Promise((resolve, reject) => {
        const req = s.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }));
      if (!syncEnabled) return local;
      return local.then(() =>
        fetch('/api/files/' + encodeURIComponent(id), { method: 'DELETE', ...API_OPTS }).catch(() => {})
      );
    }

    return { save, get, remove };
  })();

  function save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      if (syncEnabled) pushToServer(data);
      return true;
    } catch (e) {
      console.error('Save failed:', e);
      return false;
    }
  }

  function getData() {
    return load();
  }

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch {
      return null;
    }
  }

  function setSession(userId) {
    if (userId) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  function getCurrentUser() {
    return _currentUser;
  }

  function updateUser(userId, patch) {
    const data = load();
    const idx = data.users.findIndex(u => u.id === userId);
    if (idx === -1) return null;
    data.users[idx] = { ...data.users[idx], ...patch };
    save(data);
    return data.users[idx];
  }

  function touchActivity(userId) {
    updateUser(userId, { lastActive: new Date().toISOString() });
  }

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

  function expireSubscriptions() {
    const data = load();
    let changed = false;
    data.users.forEach(u => {
      if (u.role !== 'admin' && u.proExpiresAt && new Date(u.proExpiresAt) <= new Date()) {
        changed = true;
      }
    });
    if (changed) save(data);
  }

  async function register(email, password, nickname) {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        ...API_OPTS,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, nickname })
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || 'Ошибка регистрации' };
      _currentUser = data.user;
      setSession(data.user.id);
      serverAvailable = true;
      await activateUserSync();
      return { ok: true, user: data.user };
    } catch {
      return { ok: false, error: 'Сервер недоступен' };
    }
  }

  async function login(email, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        ...API_OPTS,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || 'Ошибка входа' };
      _currentUser = data.user;
      setSession(data.user.id);
      expireSubscriptions();
      serverAvailable = true;
      await activateUserSync();
      touchActivity(data.user.id);
      return { ok: true, user: data.user };
    } catch {
      return { ok: false, error: 'Сервер недоступен' };
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', ...API_OPTS });
    } catch { /* ignore */ }
    _currentUser = null;
    setSession(null);
    syncEnabled = false;
    if (syncSocket) {
      try { syncSocket.close(); } catch { /* ignore */ }
      syncSocket = null;
    }
  }

  async function adminRequest(path, method, body) {
    const opts = {
      method: method || 'POST',
      ...API_OPTS,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body !== undefined && opts.method !== 'DELETE') {
      opts.body = JSON.stringify(body);
    }
    const res = await fetch('/api/admin/' + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
    await pullFromServer();
    return data;
  }

  async function grantPro(userId, days) {
    await adminRequest('grant-pro', 'POST', { userId, days });
    return load().users.find(u => u.id === userId) || null;
  }

  async function extendPro(userId, days) {
    await adminRequest('extend-pro', 'POST', { userId, days });
    return load().users.find(u => u.id === userId) || null;
  }

  async function setProExpiry(userId, dateStr) {
    await adminRequest('set-pro-expiry', 'POST', { userId, dateStr: dateStr || null });
    return load().users.find(u => u.id === userId) || null;
  }

  async function revokePro(userId) {
    await adminRequest('revoke-pro', 'POST', { userId });
    return load().users.find(u => u.id === userId) || null;
  }

  async function blockUser(userId, blocked) {
    await adminRequest('block-user', 'POST', { userId, blocked });
    return load().users.find(u => u.id === userId) || null;
  }

  /* PRO Topics */
  function getProTopics(includeHidden) {
    const data = load();
    let topics = data.proTopics.filter(t => includeHidden || !t.hidden);
    topics.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    return topics;
  }

  async function createProTopic(title, description) {
    await adminRequest('topics', 'POST', { title, description });
    const topics = load().proTopics;
    return topics[topics.length - 1] || null;
  }

  async function updateProTopic(id, patch) {
    await adminRequest('topics/' + encodeURIComponent(id), 'PATCH', patch);
    return load().proTopics.find(t => t.id === id) || null;
  }

  async function deleteProTopic(id) {
    await adminRequest('topics/' + encodeURIComponent(id), 'DELETE');
  }

  /* Messages */
  function getMessages(chatId) {
    const data = load();
    if (!data.messages[chatId]) data.messages[chatId] = [];
    return data.messages[chatId].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  function addMessage(chatId, userId, text, replyTo, files) {
    const trimmed = (text || '').trim();
    const attachments = files || [];
    if (!trimmed && !attachments.length) {
      return Promise.resolve({ ok: false, error: 'Введите текст или прикрепите файл' });
    }

    const user = load().users.find(u => u.id === userId);
    if (!user) return Promise.resolve({ ok: false, error: 'Пользователь не найден' });

    const msgId = uid();
    const fileMeta = attachments.map(f => ({
      id: f.id || uid(),
      name: f.name,
      size: f.size,
      type: f.type || ''
    }));

    const saveFiles = attachments.map((f, i) =>
      FileDB.save(fileMeta[i].id, f.dataUrl).catch(err => {
        throw new Error('Не удалось сохранить файл «' + f.name + '»');
      })
    );

    return Promise.all(saveFiles).then(async () => {
      const data = load();
      if (!data.messages[chatId]) data.messages[chatId] = [];
      const msg = {
        id: msgId,
        userId,
        authorEmail: user.email,
        authorName: getDisplayName(user),
        text: trimmed,
        replyTo: replyTo || null,
        files: fileMeta,
        createdAt: new Date().toISOString(),
        editedAt: null,
        pinned: false
      };
      data.messages[chatId].push(msg);
      if (!save(data)) {
        fileMeta.forEach(f => FileDB.remove(f.id));
        return { ok: false, error: 'Не удалось сохранить сообщение. Очистите старые данные браузера.' };
      }
      await awaitSync();
      touchActivity(userId);
      return { ok: true, msg };
    }).catch(err => ({
      ok: false,
      error: err.message || 'Ошибка при отправке'
    })).then(result => {
      if (result.ok && user.role !== 'admin') {
        notifyAdminNewMessage(chatId, user, result.msg);
      }
      return result;
    });
  }

  function editMessage(chatId, msgId, userId, newText) {
    const data = load();
    const msgs = data.messages[chatId];
    if (!msgs) return null;
    const msg = msgs.find(m => m.id === msgId);
    if (!msg) return null;
    const user = data.users.find(u => u.id === userId);
    if (!user) return null;
    if (msg.userId !== userId && user.role !== 'admin') return null;
    msg.text = newText.trim();
    msg.editedAt = new Date().toISOString();
    save(data);
    return msg;
  }

  function deleteMessage(chatId, msgId) {
    const data = load();
    if (!data.messages[chatId]) return;
    const msg = data.messages[chatId].find(m => m.id === msgId);
    if (msg && msg.files) {
      msg.files.forEach(f => {
        if (f.id) FileDB.remove(f.id);
      });
    }
    data.messages[chatId] = data.messages[chatId].filter(m => m.id !== msgId);
    save(data);
  }

  function pinMessage(chatId, msgId, pinned) {
    const data = load();
    const msg = data.messages[chatId]?.find(m => m.id === msgId);
    if (msg) {
      msg.pinned = pinned;
      save(data);
    }
  }

  function searchMessages(query, chatIds) {
    const q = query.toLowerCase();
    const results = [];
    chatIds.forEach(chatId => {
      getMessages(chatId).forEach(m => {
        const fileMatch = (m.files || []).some(f => f.name.toLowerCase().includes(q));
        if ((m.text || '').toLowerCase().includes(q) || fileMatch) {
          results.push({ ...m, chatId });
        }
      });
    });
    return results;
  }

  /* Notifications */
  function addNotification(userId, text, type, refId) {
    const data = load();
    data.notifications.unshift({
      id: uid(),
      userId,
      text,
      type: type || 'info',
      refId: refId || null,
      read: false,
      createdAt: new Date().toISOString()
    });
    if (data.notifications.length > 100) data.notifications = data.notifications.slice(0, 100);
    save(data);
  }

  function getNotifications(userId) {
    return load().notifications.filter(n => n.userId === userId);
  }

  function getUnreadNotificationCount(userId) {
    return getNotifications(userId).filter(n => !n.read).length;
  }

  function markNotificationsRead(userId) {
    const data = load();
    let changed = false;
    data.notifications.forEach(n => {
      if (n.userId === userId && !n.read) {
        n.read = true;
        changed = true;
      }
    });
    if (changed) save(data);
  }

  /* Прочитанные чаты (localStorage, per user) */
  const CHAT_READ_KEY = 'gost17025_chat_read';

  function loadChatReadMap() {
    try {
      return JSON.parse(localStorage.getItem(CHAT_READ_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveChatReadMap(map) {
    localStorage.setItem(CHAT_READ_KEY, JSON.stringify(map));
  }

  function getLastReadAt(userId, chatId) {
    return loadChatReadMap()[userId]?.[chatId] || null;
  }

  function markChatRead(userId, chatId) {
    if (!userId || !chatId) return;
    const msgs = getMessages(chatId);
    const at = msgs.length ? msgs[msgs.length - 1].createdAt : new Date().toISOString();
    const map = loadChatReadMap();
    if (!map[userId]) map[userId] = {};
    if (map[userId][chatId] === at) return;
    map[userId][chatId] = at;
    saveChatReadMap(map);
    window.dispatchEvent(new CustomEvent('gost-unread-changed'));
  }

  function getChatUnreadCount(userId, chatId) {
    if (!userId || !chatId) return 0;
    const lastRead = getLastReadAt(userId, chatId);
    return getMessages(chatId).filter(m =>
      m.userId !== userId && (!lastRead || m.createdAt > lastRead)
    ).length;
  }

  function getAccessibleChatIds(user) {
    if (!user) return [];
    const ids = [CHAT_FREE];
    if (user.role === 'admin') {
      const data = load();
      Object.keys(data.messages || {}).forEach(chatId => {
        if (isAdminDmChat(chatId)) ids.push(chatId);
      });
      getProTopics(false).forEach(t => ids.push(t.id));
    } else {
      ids.push(getAdminDmChatId(user.id));
      if (isProActive(user)) {
        getProTopics(false).forEach(t => ids.push(t.id));
      }
    }
    return [...new Set(ids)];
  }

  function getTotalUnreadMessages(userId) {
    const user = load().users.find(u => u.id === userId);
    if (!user) return 0;
    return getAccessibleChatIds(user).reduce((sum, id) => sum + getChatUnreadCount(userId, id), 0);
  }

  function getBellUnreadCount(userId) {
    return getTotalUnreadMessages(userId) + getUnreadNotificationCount(userId);
  }

  function checkSubscriptionWarnings() {
    const data = load();
    const now = new Date();
    data.users.forEach(u => {
      if (!u.proExpiresAt || u.role === 'admin') return;
      const exp = new Date(u.proExpiresAt);
      const daysLeft = Math.ceil((exp - now) / 86400000);
      if (daysLeft > 0 && daysLeft <= 7) {
        addNotification(u.id, 'PRO-подписка истекает через ' + daysLeft + ' дн. (' + formatDate(u.proExpiresAt) + ')');
      }
      if (daysLeft <= 0) {
        addNotification(u.id, 'PRO-подписка истекла. Доступ к PRO-разделу закрыт.');
      }
    });
  }

  /* Helpers */
  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' КБ';
    return (bytes / 1048576).toFixed(1) + ' МБ';
  }

  const ALLOWED_EXT = [
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
    'rtf', 'txt', 'csv', 'xml', 'json', 'log', 'md',
    'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg',
    'mp4', 'webm', 'mov', 'avi', 'mkv',
    'zip', 'rar', '7z'
  ];

  const MAX_FILE_SIZE = 25 * 1024 * 1024; /* 25 МБ на файл */

  function getFileExt(name) {
    const parts = name.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  }

  function isAllowedFile(name) {
    return ALLOWED_EXT.includes(getFileExt(name));
  }

  function isImageExt(ext) {
    return ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(ext);
  }

  function isVideoExt(ext) {
    return ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Ошибка чтения файла'));
      reader.readAsDataURL(file);
    });
  }

  function compressImageIfNeeded(file, dataUrl) {
    if (!isImageExt(getFileExt(file.name)) || file.size < 1024 * 1024) {
      return Promise.resolve(dataUrl);
    }
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1600;
        let w = img.width;
        let h = img.height;
        if (w > maxW) {
          h = Math.round(h * maxW / w);
          w = maxW;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async function readFilesAsAttachments(fileList) {
    const files = [];
    const errors = [];

    for (const file of Array.from(fileList || [])) {
      if (!isAllowedFile(file.name)) {
        errors.push('«' + file.name + '» — формат не поддерживается');
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push('«' + file.name + '» — больше ' + formatFileSize(MAX_FILE_SIZE));
        continue;
      }
      try {
        let dataUrl = await readFileAsDataUrl(file);
        dataUrl = await compressImageIfNeeded(file, dataUrl);
        files.push({
          id: uid(),
          name: file.name,
          size: file.size,
          type: file.type || '',
          dataUrl
        });
      } catch {
        errors.push('«' + file.name + '» — не удалось прочитать');
      }
    }

    if (!files.length) {
      return {
        ok: false,
        error: errors.length ? errors.join('\n') : 'Не выбрано ни одного файла'
      };
    }

    return { ok: true, files, warnings: errors };
  }

  function resolveFileData(file) {
    if (file.dataUrl) return Promise.resolve(file.dataUrl);
    if (file.id) return FileDB.get(file.id);
    return Promise.resolve(null);
  }

  async function hydrateMessageFiles(msg) {
    if (!msg.files || !msg.files.length) return msg;
    const files = await Promise.all(msg.files.map(async f => {
      const dataUrl = await resolveFileData(f);
      return { ...f, dataUrl: dataUrl || '' };
    }));
    return { ...msg, files };
  }

  function getLoginUrl(nextPage) {
    const next = nextPage || (typeof window !== 'undefined'
      ? window.location.pathname.split('/').pop() || 'index.html'
      : 'index.html');
    if (next === 'login.html' || next === 'index.html') {
      return 'login.html';
    }
    return 'login.html?next=' + encodeURIComponent(next);
  }

  function getRedirectAfterLogin(user, nextPage) {
    if (user.role === 'admin') return 'admin.html';
    const safeNext = nextPage && !nextPage.includes('login.html') ? nextPage : '';
    if (isProActive(user)) {
      if (!safeNext || safeNext === 'pro-request.html') return 'pro.html';
      return safeNext;
    }
    if (safeNext) return safeNext;
    return 'pro-request.html';
  }

  function requireAuth(silent) {
    expireSubscriptions();
    migrateUsers();
    const user = getCurrentUser();
    if (!user) {
      if (!silent && typeof window !== 'undefined') {
        window.location.href = getLoginUrl();
      }
      return null;
    }
    if (user.blocked) {
      if (!silent) {
        alert('Ваш аккаунт заблокирован.');
        logout();
        window.location.href = 'index.html';
      }
      return null;
    }
    touchActivity(user.id);
    return user;
  }

  function requireAdmin() {
    ensureAdmin();
    const user = getCurrentUser();
    if (!user) return null;
    if (user.blocked) {
      logout();
      return null;
    }
    if (user.role !== 'admin') return null;
    touchActivity(user.id);
    return user;
  }

  function requirePro() {
    const user = requireAuth();
    if (!user) return null;
    if (isProActive(user)) return user;
    window.location.href = 'pro-request.html';
    return null;
  }

  async function fetchAccountProfile() {
    const res = await fetch('/api/account', { ...API_OPTS, cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Не удалось загрузить профиль');
    if (data.user) _currentUser = data.user;
    return data;
  }

  async function fetchUserAccountProfile(userId) {
    const res = await fetch('/api/admin/users/' + encodeURIComponent(userId) + '/account', { ...API_OPTS, cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Не удалось загрузить профиль');
    return data;
  }

  async function updateAccountNickname(nickname) {
    const res = await fetch('/api/account/nickname', {
      method: 'PATCH',
      ...API_OPTS,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка сохранения');
    if (data.profile?.user) _currentUser = data.profile.user;
    return data.profile;
  }

  async function changeAccountPassword(currentPassword, newPassword) {
    const res = await fetch('/api/account/password', {
      method: 'POST',
      ...API_OPTS,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка смены пароля');
    return data;
  }

  function toastAccount(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  function isUserBlocked(user) {
    return !!(user && user.blocked);
  }

  const ready = initSync().finally(() => {
    expireSubscriptions();
    ensureAdmin();
    ensureAdminSupportChat();
    migrateUsers();
  });

  return {
    ready,
    isSyncEnabled,
    isServerAvailable,
    getData, getCurrentUser, getSession, login, logout, register,
    ensureAdmin, ensureAdminSupportChat, ensureProRequestWelcomeMessage, ensureAdminDmWelcome, migrateUsers,
    ADMIN_EMAIL,
    CHAT_FREE, CHAT_ADMIN_SUPPORT, CHAT_DM_PREFIX, PRO_PAYMENT_INFO,
    getAdminDmChatId, isAdminDmChat, getDmUserId,
    getDisplayName, getStatusLabel, normalizeNickname, getLoginUrl, getRedirectAfterLogin,
    isProActive, getSubscriptionStatus, grantPro, extendPro, revokePro,
    setProExpiry, blockUser, updateUser,
    getProTopics, createProTopic, updateProTopic, deleteProTopic,
    getMessages, addMessage, editMessage, deleteMessage, pinMessage,
    searchMessages, getNotifications, getUnreadNotificationCount, markNotificationsRead,
    getChatUnreadCount, getTotalUnreadMessages, getBellUnreadCount, getAccessibleChatIds, markChatRead,
    getChatLabel, getChatHref, getUnreadChatsSummary,
    checkSubscriptionWarnings,
    getProRequests, getPendingProRequestCount, getAdminInboxConversations, getPendingPrivateMessageCount,
    markProRequestProcessed, markProRequestsProcessedByUser,
    formatDate, formatDateTime, formatFileSize, readFilesAsAttachments,
    hydrateMessageFiles, isImageExt, isVideoExt, getFileExt, ALLOWED_EXT, MAX_FILE_SIZE,
    requireAuth, requireAdmin, requirePro, isAllowedFile,
    fetchAccountProfile, fetchUserAccountProfile, updateAccountNickname,
    changeAccountPassword, toastAccount, isUserBlocked
  };
})();

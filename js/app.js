/**
 * Гид PRO — клиентское хранилище данных (localStorage)
 */
const App = (function () {
  const STORAGE_KEY = 'gost17025_data';
  const SESSION_KEY = 'gost17025_session';
  const ADMIN_EMAIL = 'admin@gost17025.pro';
  const ADMIN_PASSWORD = 'admin123';

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function defaultData() {
    return {
      users: [createAdminUser()],
      proTopics: [],
      messages: { free: [] },
      notifications: []
    };
  }

  function createAdminUser() {
    return {
      id: 'admin-1',
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'admin',
      registeredAt: new Date().toISOString(),
      proExpiresAt: null,
      blocked: false,
      lastActive: new Date().toISOString()
    };
  }

  /** Гарантирует наличие администратора (исправляет типичную ошибку после регистрации) */
  function ensureAdmin() {
    const data = load();
    const idx = data.users.findIndex(u => u.email.toLowerCase() === ADMIN_EMAIL);
    if (idx === -1) {
      data.users.unshift(createAdminUser());
      save(data);
      return;
    }
    const admin = data.users[idx];
    if (admin.role !== 'admin' || admin.password !== ADMIN_PASSWORD || admin.blocked) {
      data.users[idx] = {
        ...createAdminUser(),
        id: admin.id,
        registeredAt: admin.registeredAt || new Date().toISOString(),
        lastActive: admin.lastActive || new Date().toISOString()
      };
      save(data);
    }
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

  /* Хранилище файлов (IndexedDB — без лимита localStorage) */
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

    function save(id, dataUrl) {
      return tx(STORE, 'readwrite').then(s => new Promise((resolve, reject) => {
        const req = s.put(dataUrl, id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }));
    }

    function get(id) {
      return tx(STORE, 'readonly').then(s => new Promise((resolve, reject) => {
        const req = s.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      }));
    }

    function remove(id) {
      return tx(STORE, 'readwrite').then(s => new Promise((resolve, reject) => {
        const req = s.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }));
    }

    return { save, get, remove };
  })();

  function save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
    const session = getSession();
    if (!session) return null;
    const data = load();
    return data.users.find(u => u.id === session.userId) || null;
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

  function register(email, password) {
    if (email.toLowerCase() === ADMIN_EMAIL) {
      return { ok: false, error: 'Этот email зарезервирован для администратора. Используйте форму входа.' };
    }
    const data = load();
    const exists = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (exists) return { ok: false, error: 'Пользователь с таким email уже зарегистрирован' };

    const user = {
      id: uid(),
      email: email.toLowerCase(),
      password,
      role: 'user',
      registeredAt: new Date().toISOString(),
      proExpiresAt: null,
      blocked: false,
      lastActive: new Date().toISOString()
    };
    data.users.push(user);
    save(data);
    setSession(user.id);
    return { ok: true, user };
  }

  function login(email, password) {
    expireSubscriptions();
    const data = load();
    const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user || user.password !== password) {
      return { ok: false, error: 'Неверный email или пароль' };
    }
    if (user.blocked) return { ok: false, error: 'Аккаунт заблокирован администратором' };
    touchActivity(user.id);
    setSession(user.id);
    return { ok: true, user };
  }

  function logout() {
    setSession(null);
  }

  function grantPro(userId, days) {
    const user = updateUser(userId, {
      proExpiresAt: new Date(Date.now() + days * 86400000).toISOString()
    });
    addNotification(userId, 'PRO-доступ активирован до ' + formatDate(user.proExpiresAt));
    return user;
  }

  function extendPro(userId, days) {
    const data = load();
    const user = data.users.find(u => u.id === userId);
    if (!user) return null;
    const base = user.proExpiresAt && new Date(user.proExpiresAt) > new Date()
      ? new Date(user.proExpiresAt)
      : new Date();
    base.setDate(base.getDate() + days);
    const updated = updateUser(userId, { proExpiresAt: base.toISOString() });
    addNotification(userId, 'PRO-подписка продлена до ' + formatDate(updated.proExpiresAt));
    return updated;
  }

  function setProExpiry(userId, dateStr) {
    const user = updateUser(userId, { proExpiresAt: dateStr ? new Date(dateStr).toISOString() : null });
    if (user) {
      const msg = dateStr
        ? 'Дата окончания PRO подписки: ' + formatDate(user.proExpiresAt)
        : 'PRO-доступ отключён';
      addNotification(userId, msg);
    }
    return user;
  }

  function revokePro(userId) {
    return setProExpiry(userId, null);
  }

  function blockUser(userId, blocked) {
    return updateUser(userId, { blocked });
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

  function createProTopic(title, description) {
    const data = load();
    const topic = {
      id: uid(),
      title,
      description: description || '',
      pinned: false,
      hidden: false,
      createdAt: new Date().toISOString()
    };
    data.proTopics.push(topic);
    data.messages[topic.id] = [];
    save(data);
    return topic;
  }

  function updateProTopic(id, patch) {
    const data = load();
    const idx = data.proTopics.findIndex(t => t.id === id);
    if (idx === -1) return null;
    data.proTopics[idx] = { ...data.proTopics[idx], ...patch };
    save(data);
    return data.proTopics[idx];
  }

  function deleteProTopic(id) {
    const data = load();
    data.proTopics = data.proTopics.filter(t => t.id !== id);
    delete data.messages[id];
    save(data);
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

    const data = load();
    const user = data.users.find(u => u.id === userId);
    if (!user) return Promise.resolve({ ok: false, error: 'Пользователь не найден' });
    if (!data.messages[chatId]) data.messages[chatId] = [];

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

    return Promise.all(saveFiles).then(() => {
      const msg = {
        id: msgId,
        userId,
        authorEmail: user.email,
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
      touchActivity(userId);
      return { ok: true, msg };
    }).catch(err => ({
      ok: false,
      error: err.message || 'Ошибка при отправке'
    }));
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
  function addNotification(userId, text) {
    const data = load();
    data.notifications.unshift({
      id: uid(),
      userId,
      text,
      read: false,
      createdAt: new Date().toISOString()
    });
    if (data.notifications.length > 100) data.notifications = data.notifications.slice(0, 100);
    save(data);
  }

  function getNotifications(userId) {
    return load().notifications.filter(n => n.userId === userId);
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

  function requireAuth(redirect) {
    expireSubscriptions();
    const user = getCurrentUser();
    if (!user) {
      window.location.href = 'index.html#login';
      return null;
    }
    if (user.blocked) {
      alert('Ваш аккаунт заблокирован.');
      logout();
      window.location.href = 'index.html';
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
    if (!isProActive(user)) {
      alert('PRO-доступ недоступен. Обратитесь к администратору для оформления подписки.');
      window.location.href = 'index.html#pro';
      return null;
    }
    return user;
  }

  expireSubscriptions();
  ensureAdmin();

  return {
    getData, getCurrentUser, getSession, login, logout, register,
    ensureAdmin, ADMIN_EMAIL, ADMIN_PASSWORD,
    isProActive, getSubscriptionStatus, grantPro, extendPro, revokePro,
    setProExpiry, blockUser, updateUser,
    getProTopics, createProTopic, updateProTopic, deleteProTopic,
    getMessages, addMessage, editMessage, deleteMessage, pinMessage,
    searchMessages, getNotifications, checkSubscriptionWarnings,
    formatDate, formatDateTime, formatFileSize, readFilesAsAttachments,
    hydrateMessageFiles, isImageExt, isVideoExt, getFileExt, ALLOWED_EXT, MAX_FILE_SIZE,
    requireAuth, requireAdmin, requirePro, isAllowedFile
  };
})();

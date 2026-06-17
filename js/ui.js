/**
 * Общий UI: шапка, авторизация, уведомления, тема
 */
const UI = (function () {
  const THEME_KEY = 'gost17025_theme';

  function applyTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    updateThemeButton();
  }

  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    localStorage.setItem(THEME_KEY, isDark ? 'light' : 'dark');
    applyTheme();
  }

  function updateThemeButton() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const icon = isDark ? '☀️' : '🌙';
    const title = isDark ? 'Светлая тема' : 'Тёмная тема';
    document.querySelectorAll('#btn-theme .btn-theme__icon, #btn-theme-mobile .mobile-bottom-nav__icon').forEach(el => {
      el.textContent = icon;
    });
    const btn = document.getElementById('btn-theme');
    if (btn) {
      btn.title = title;
      btn.setAttribute('aria-label', title);
    }
    const btnMobile = document.getElementById('btn-theme-mobile');
    if (btnMobile) btnMobile.setAttribute('aria-label', title);
  }

  function mountThemeToggle(container) {
    if (!container || container.querySelector('#btn-theme')) return;
    if (typeof Mobile !== 'undefined' && Mobile.isMobile()) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-theme';
    btn.id = 'btn-theme';
    btn.innerHTML = '<span class="btn-theme__icon">🌙</span>';
    const burger = container.querySelector('.burger');
    if (burger) container.insertBefore(btn, burger);
    else container.appendChild(btn);
    updateThemeButton();
    btn.addEventListener('click', toggleTheme);
  }

  function initHeader(activePage) {
    const user = App.getCurrentUser();
    const header = document.querySelector('.header__inner');
    if (!header) return;

    const dmChatId = user ? App.getAdminDmChatId(user.id) : '';
    const chatUnread = user ? App.getTotalUnreadMessages(user.id) : 0;
    const dmUnread = user ? App.getChatUnreadCount(user.id, dmChatId) : 0;
    const proUnread = user ? App.getProUnreadTotal(user.id) : 0;

    const navLinks = [
      { href: 'index.html', label: 'Главная', id: 'home' },
      { href: 'chats.html', label: 'Чаты', id: 'chats', unread: chatUnread }
    ];

    if (user) {
      navLinks.push({ href: 'account.html', label: 'Личный кабинет', id: 'account' });
      navLinks.push({ href: 'admin-chat.html', label: 'Администратор', id: 'admin-chat', unread: dmUnread });
    }

    if (user && App.isProActive(user)) {
      navLinks.push({ href: 'pro.html', label: 'PRO-раздел', id: 'pro', unread: proUnread });
    } else if (user) {
      navLinks.push({ href: 'pro-request.html', label: 'Оформить PRO', id: 'pro-request' });
    } else {
      navLinks.push({ href: 'login.html?next=pro-request.html', label: 'PRO-доступ', id: 'pro-request' });
    }

    if (user && user.role === 'admin') {
      const adminBadge = App.getPendingProRequestCount() + App.getPendingPrivateMessageCount();
      navLinks.push({ href: 'admin.html', label: 'Админ-панель', id: 'admin', unread: adminBadge });
    }

    const navHtml = navLinks.map(l => {
      const count = l.unread || 0;
      const badge = count > 0 ? `<span class="nav-badge">${count > 99 ? '99+' : count}</span>` : '';
      return `<a href="${l.href}" class="nav__link${activePage === l.id ? ' nav__link--active' : ''}" data-nav-id="${l.id}">${l.label}${badge}</a>`;
    }).join('');

    let actionsHtml;
    if (user) {
      const status = App.getSubscriptionStatus(user);
      const badge = status === 'pro' || status === 'admin'
        ? '<span class="user-badge user-badge--pro">' + (status === 'admin' ? 'Админ' : 'PRO') + '</span>'
        : status === 'expired'
          ? '<span class="user-badge user-badge--expired">Истекла</span>'
          : '<span class="user-badge">Free</span>';
      const unread = App.getBellUnreadCount(user.id);
      const notifBadge = unread > 0 ? `<span class="notif-badge">${unread > 99 ? '99+' : unread}</span>` : '';
      actionsHtml = `
        <div class="user-menu">
          ${badge}
          <span class="user-menu__nick">${escapeAttr(App.getDisplayName(user))}</span>
          <button type="button" class="btn btn--ghost btn--sm btn-notifications" id="btn-notifications" title="Уведомления и сообщения" aria-label="Уведомления">
            🔔${notifBadge}
          </button>
          <button type="button" class="btn btn--ghost btn--sm" id="btn-logout">Выйти</button>
        </div>`;
    } else {
      actionsHtml = `
        <a href="${App.getLoginUrl()}" class="btn btn--ghost">Войти</a>
        <a href="login.html?tab=register" class="btn btn--primary">Зарегистрироваться</a>`;
    }

    const logo = header.querySelector('.logo');
    if (logo) logo.href = 'index.html';

    const nav = header.querySelector('.nav');
    const actions = header.querySelector('.header__actions');
    if (nav) nav.innerHTML = navHtml;
    if (actions) actions.innerHTML = actionsHtml;

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
      await App.logout();
      window.location.href = 'index.html';
    });

    document.getElementById('btn-notifications')?.addEventListener('click', showNotifications);

    initBurger();
    if (typeof Mobile === 'undefined' || !Mobile.isMobile()) {
      mountThemeToggle(header);
    } else {
      header.querySelector('#btn-theme')?.remove();
    }
    if (typeof Mobile !== 'undefined') Mobile.init(activePage);
  }

  function showSyncNotice() {
    if (document.getElementById('sync-notice')) return;

    const page = window.location.pathname.split('/').pop() || 'index.html';
    const onSyncPage = ['chat.html', 'pro.html', 'pro-request.html', 'admin-chat.html', 'admin.html'].includes(page);

    if (App.isSyncEnabled()) {
      if (!onSyncPage) return;
      if (typeof Mobile !== 'undefined' && Mobile.isMobile()) return;
      const notice = document.createElement('div');
      notice.id = 'sync-notice';
      notice.className = 'sync-notice sync-notice--ok';
      notice.textContent = 'Подключено к серверу — сообщения синхронизируются между телефоном и компьютером.';
      document.querySelector('.header')?.insertAdjacentElement('afterend', notice);
      setTimeout(() => notice.remove(), 5000);
      return;
    }

    if (!App.isServerAvailable()) {
      const host = window.location.hostname || '';
      const isLocal = host === 'localhost' || host === '127.0.0.1';
      if (typeof Mobile !== 'undefined' && Mobile.isMobile() && !isLocal) return;
      const notice = document.createElement('div');
      notice.id = 'sync-notice';
      notice.className = 'sync-notice';
      if (host.endsWith('github.io')) {
        notice.innerHTML = '<strong>GitHub Pages не поддерживает чаты и подписчиков.</strong> Здесь только статическая витрина. Для работы сообщества нужен сервер с Node.js — разверните проект на Render, Railway или VPS и открывайте сайт по адресу этого сервера (не github.io).';
      } else if (host === 'localhost' || host === '127.0.0.1') {
        notice.innerHTML = 'Синхронизация недоступна. Запустите сервер командой <strong>npm start</strong> и откройте сайт по адресу <strong>http://IP-вашего-ПК:3000</strong> на телефоне и на компьютере (не открывайте файлы напрямую).';
      } else {
        notice.textContent = 'Сервер временно недоступен. Попробуйте обновить страницу через минуту.';
      }
      document.querySelector('.header')?.insertAdjacentElement('afterend', notice);
    }
  }

  function initBurger() {
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav');
    const headerActions = document.querySelector('.header__actions');
    if (!burger) return;

    burger.addEventListener('click', () => {
      const expanded = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', !expanded);
      nav?.classList.toggle('nav--open');
      headerActions?.classList.toggle('header__actions--open');
      burger.classList.toggle('burger--open');
    });
  }

  function showNotifications() {
    const user = App.getCurrentUser();
    if (!user) return;

    const chatUnread = App.getUnreadChatsSummary(user.id);
    const notifUnread = App.getNotifications(user.id).filter(n => !n.read);

    if (!chatUnread.length && !notifUnread.length) {
      closeNotificationsPanel();
      alert('Нет новых уведомлений и сообщений.');
      return;
    }

    let panel = document.getElementById('notif-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'notif-panel';
      panel.className = 'notif-panel';
      panel.hidden = true;
      document.body.appendChild(panel);
      document.addEventListener('click', onNotificationsOutsideClick);
    }

    let html = '';
    if (chatUnread.length) {
      html += '<div class="notif-panel__section"><div class="notif-panel__title">Новые сообщения</div><ul class="notif-panel__list">';
      html += chatUnread.map(c => `
        <li>
          <a href="${c.href}" class="notif-panel__item" data-chat-id="${escapeAttr(c.chatId)}">
            <span class="notif-panel__label">${escapeAttr(c.label)}</span>
            <span class="notif-panel__count">${c.count > 99 ? '99+' : c.count}</span>
          </a>
        </li>`).join('');
      html += '</ul></div>';
    }
    if (notifUnread.length) {
      html += '<div class="notif-panel__section"><div class="notif-panel__title">Системные</div><ul class="notif-panel__list notif-panel__list--system">';
      html += notifUnread.slice(0, 8).map(n => `
        <li class="notif-panel__system">
          <time>${App.formatDateTime(n.createdAt)}</time>
          <p>${escapeHtml(n.text)}</p>
        </li>`).join('');
      html += '</ul></div>';
      App.markNotificationsRead(user.id);
    }
    panel.innerHTML = html + '<button type="button" class="notif-panel__close" id="notif-panel-close">Закрыть</button>';

    panel.querySelector('#notif-panel-close')?.addEventListener('click', closeNotificationsPanel);
    panel.querySelectorAll('.notif-panel__item').forEach(link => {
      link.addEventListener('click', () => closeNotificationsPanel());
    });

    const btn = document.getElementById('btn-notifications-mobile') || document.getElementById('btn-notifications');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      panel.style.top = Math.min(rect.bottom + 8, window.innerHeight - 20) + 'px';
      panel.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
      panel.style.left = 'auto';
    }
    panel.hidden = false;
    refreshUnreadBadges();
  }

  function closeNotificationsPanel() {
    const panel = document.getElementById('notif-panel');
    if (panel) panel.hidden = true;
  }

  function onNotificationsOutsideClick(e) {
    const panel = document.getElementById('notif-panel');
    if (!panel || panel.hidden) return;
    if (panel.contains(e.target)) return;
    if (e.target.closest('#btn-notifications, #btn-notifications-mobile')) return;
    panel.hidden = true;
  }

  function refreshUnreadBadges() {
    const user = App.getCurrentUser();
    if (!user) return;

    const bellCount = App.getBellUnreadCount(user.id);
    const chatCount = App.getTotalUnreadMessages(user.id);

    document.querySelectorAll('#btn-notifications, #btn-notifications-mobile').forEach(btn => {
      const existing = btn.querySelector('.notif-badge');
      if (bellCount > 0) {
        const text = bellCount > 99 ? '99+' : String(bellCount);
        if (existing) existing.textContent = text;
        else {
          const span = document.createElement('span');
          span.className = 'notif-badge';
          span.textContent = text;
          btn.appendChild(span);
        }
      } else if (existing) {
        existing.remove();
      }
    });

    document.querySelectorAll('.nav__link[data-nav-id]').forEach(link => {
      const navId = link.dataset.navId;
      let count = 0;
      if (navId === 'chats') count = chatCount;
      else if (navId === 'admin-chat') count = App.getChatUnreadCount(user.id, App.getAdminDmChatId(user.id));
      else if (navId === 'pro') count = App.getProUnreadTotal(user.id);
      else if (navId === 'admin') count = App.getPendingProRequestCount() + App.getPendingPrivateMessageCount();

      const existing = link.querySelector('.nav-badge');
      if (count > 0) {
        const text = count > 99 ? '99+' : String(count);
        if (existing) existing.textContent = text;
        else {
          const span = document.createElement('span');
          span.className = 'nav-badge';
          span.textContent = text;
          link.appendChild(span);
        }
      } else if (existing) {
        existing.remove();
      }
    });

    if (typeof Mobile !== 'undefined' && Mobile.refreshBottomNavBadges) {
      Mobile.refreshBottomNavBadges();
    }
    if (typeof Mobile !== 'undefined' && Mobile.refreshChatsHubBadges) {
      Mobile.refreshChatsHubBadges();
    }
    if (typeof Mobile !== 'undefined' && Mobile.refreshDesktopChatsNav) {
      Mobile.refreshDesktopChatsNav();
    }

    updateAdminTabBadges(user);
    updateChatRailBadges(user);
  }

  function updateChatRailBadges(user) {
    if (!user) return;
    document.querySelectorAll('.chat-rail__tab[data-chat-id]').forEach(tab => {
      updateTabBadge(tab, user.id, tab.dataset.chatId);
    });
    document.querySelectorAll('.chat-rail__tab[data-chat-kind="dm"]').forEach(tab => {
      updateTabBadge(tab, user.id, App.getAdminDmChatId(user.id));
    });
  }

  function updateTabBadge(tab, userId, chatId) {
    const count = App.getChatUnreadCount(userId, chatId);
    let badge = tab.querySelector('.chat-rail__badge');
    if (count > 0) {
      const text = count > 99 ? '99+' : String(count);
      if (badge) badge.textContent = text;
      else {
        badge = document.createElement('span');
        badge.className = 'chat-rail__badge';
        badge.textContent = text;
        tab.appendChild(badge);
      }
    } else if (badge) {
      badge.remove();
    }
  }

  function updateAdminTabBadges(user) {
    if (!user || user.role !== 'admin') return;
    const dmUnread = App.getPendingPrivateMessageCount();
    const dmBadge = document.getElementById('private-messages-badge');
    if (dmBadge) {
      dmBadge.textContent = dmUnread > 99 ? '99+' : String(dmUnread);
      dmBadge.hidden = dmUnread === 0;
    }
    const modBadge = document.getElementById('moderation-badge');
    if (modBadge) {
      const freeUnread = App.getChatUnreadCount(user.id, App.CHAT_FREE);
      modBadge.textContent = freeUnread > 99 ? '99+' : String(freeUnread);
      modBadge.hidden = freeUnread === 0;
    }
    const messagesTab = document.querySelector('.admin-tab[data-tab="messages"]');
    if (messagesTab) {
      messagesTab.classList.toggle('admin-tab--has-new', dmUnread > 0);
    }
  }

  function initAuthForms() {
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', e => {
        const target = document.querySelector(link.getAttribute('href'));
        if (target && target.tagName === 'DIALOG') {
          e.preventDefault();
          target.showModal();
        }
      });
    });

    const loginForm = document.querySelector('#login form');
    loginForm?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(loginForm);
      const result = await App.login(fd.get('email'), fd.get('password'));
      if (result.ok) {
        document.getElementById('login').close();
        window.location.href = App.getRedirectAfterLogin(result.user, '');
      } else {
        alert(result.error);
      }
    });

    const regForm = document.querySelector('#register form');
    regForm?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(regForm);
      if (fd.get('password') !== fd.get('password_confirm')) {
        alert('Пароли не совпадают');
        return;
      }
      const result = await App.register(fd.get('email'), fd.get('password'), fd.get('nickname'));
      if (result.ok) {
        document.getElementById('register').close();
        alert('Регистрация успешна! Перейдите к оформлению PRO-доступа.');
        window.location.href = 'pro-request.html';
      } else {
        alert(result.error);
      }
    });

    const recoverForm = document.querySelector('#recover form');
    recoverForm?.addEventListener('submit', e => {
      e.preventDefault();
      document.getElementById('recover').close();
      alert('Инструкция по восстановлению отправлена на указанный email (демо-режим).');
    });

    if (window.location.hash === '#login') {
      document.getElementById('login')?.showModal();
    }
    if (window.location.hash === '#register') {
      document.getElementById('register')?.showModal();
    }

    initPasswordToggles();
  }

  function initPasswordToggles(root) {
    const scope = root || document;
    scope.querySelectorAll('input[type="password"]').forEach(input => {
      if (input.closest('.password-field')) return;

      const wrap = document.createElement('div');
      wrap.className = 'password-field';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'password-field__toggle';
      btn.setAttribute('aria-label', 'Показать пароль');
      btn.innerHTML = '<span class="password-field__show">Показать</span><span class="password-field__hide" hidden>Скрыть</span>';
      btn.addEventListener('click', () => {
        const visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        btn.querySelector('.password-field__show').hidden = !visible;
        btn.querySelector('.password-field__hide').hidden = visible;
        btn.setAttribute('aria-label', visible ? 'Показать пароль' : 'Скрыть пароль');
      });
      wrap.appendChild(btn);
    });
  }

  function renderMessage(msg, currentUser, chatId, allMessages) {
    const isOwn = currentUser && msg.userId === currentUser.id;
    const isAdmin = currentUser && currentUser.role === 'admin';
    const reply = msg.replyTo ? allMessages.find(m => m.id === msg.replyTo) : null;

    let filesHtml = '';
    if (msg.files && msg.files.length) {
      filesHtml = '<div class="msg__files">' + msg.files.map(f => {
        const ext = App.getFileExt(f.name);
        const src = f.dataUrl || '';
        if (src && App.isImageExt(ext)) {
          return `<figure class="msg__file msg__file--img">
            <img src="${src}" alt="${escapeAttr(f.name)}" loading="lazy">
            <figcaption>${escapeAttr(f.name)} · ${App.formatFileSize(f.size)}</figcaption>
          </figure>`;
        }
        if (src && App.isVideoExt(ext)) {
          return `<figure class="msg__file msg__file--video">
            <video controls preload="metadata" src="${src}"></video>
            <figcaption>${escapeAttr(f.name)} · ${App.formatFileSize(f.size)}</figcaption>
          </figure>`;
        }
        if (src) {
          return `<a class="msg__file msg__file--doc" href="${src}" download="${escapeAttr(f.name)}">
            📎 ${escapeAttr(f.name)} · ${App.formatFileSize(f.size)}
          </a>`;
        }
        return `<span class="msg__file msg__file--missing">📎 ${escapeAttr(f.name)} · файл недоступен</span>`;
      }).join('') + '</div>';
    }

    const textHtml = msg.text
      ? `<p class="msg__text">${escapeHtml(msg.text)}</p>`
      : '';

    const replyLabel = reply
      ? (reply.text ? reply.text.slice(0, 80) : (reply.files && reply.files[0] ? '📎 ' + reply.files[0].name : '…'))
      : '';

    const isSystem = !!msg.systemType;
    const canManage = isOwn || isAdmin;
    const canDelete = canManage && (!isSystem || isAdmin);

    const actions = canManage ? `
      <div class="msg__actions">
        ${isOwn && msg.text ? `<button type="button" class="msg__btn" data-action="edit" data-id="${msg.id}">Изменить</button>` : ''}
        ${canDelete ? `<button type="button" class="msg__btn msg__btn--danger" data-action="delete" data-id="${msg.id}">Удалить</button>` : ''}
        ${isAdmin ? `<button type="button" class="msg__btn" data-action="pin" data-id="${msg.id}">${msg.pinned ? 'Открепить' : 'Закрепить'}</button>` : ''}
        <button type="button" class="msg__btn" data-action="reply" data-id="${msg.id}">Ответить</button>
      </div>` : `<div class="msg__actions">
        <button type="button" class="msg__btn" data-action="reply" data-id="${msg.id}">Ответить</button>
      </div>`;

    const welcomeClass = msg.systemType === 'pro_welcome' ? ' msg--welcome' : '';

    return `
      <article class="msg${isOwn ? ' msg--own' : ''}${msg.pinned ? ' msg--pinned' : ''}${welcomeClass}" data-id="${msg.id}">
        ${msg.pinned ? '<span class="msg__pin-label">Закреплено</span>' : ''}
        <header class="msg__header">
          <strong class="msg__author">${escapeAttr(msg.authorName || msg.authorEmail)}</strong>
          <time class="msg__time">${App.formatDateTime(msg.createdAt)}${msg.editedAt ? ' (ред.)' : ''}</time>
        </header>
        ${reply ? `<div class="msg__reply">↩ ${escapeAttr(reply.authorName || reply.authorEmail)}: ${escapeHtml(replyLabel)}${replyLabel.length >= 80 ? '…' : ''}</div>` : ''}
        ${textHtml}
        ${filesHtml}
        ${currentUser ? actions : ''}
      </article>`;
  }

  async function renderMessages(container, msgs, currentUser, chatId, emptyText) {
    if (!msgs.length) {
      const empty = (typeof Mobile !== 'undefined' && Mobile.getEmptyChatText)
        ? Mobile.getEmptyChatText(chatId)
        : '<p class="chat-empty">' + (emptyText || 'Нет сообщений') + '</p>';
      container.innerHTML = empty;
      return;
    }
    const pinned = msgs.filter(m => m.pinned);
    const regular = msgs.filter(m => !m.pinned);
    const sorted = [...pinned, ...regular];
    const hydrated = await Promise.all(sorted.map(m => App.hydrateMessageFiles(m)));
    container.innerHTML = hydrated.map(m => renderMessage(m, currentUser, chatId, msgs)).join('');
    container.scrollTop = container.scrollHeight;
    if (currentUser && chatId) {
      App.markChatRead(currentUser.id, chatId);
      refreshUnreadBadges();
    }
  }

  function escapeAttr(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML.replace(/\n/g, '<br>');
  }

  function bindMessageActions(container, chatIdOrFn, currentUser, onUpdate) {
    container.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const chatId = typeof chatIdOrFn === 'function' ? chatIdOrFn() : chatIdOrFn;
      if (!chatId) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const msgs = App.getMessages(chatId);
      const msg = msgs.find(m => m.id === id);
      if (!msg) return;
      const user = App.getCurrentUser();
      if (!user) return;

      if (action === 'delete') {
        if (msg.userId !== user.id && user.role !== 'admin') {
          alert('Можно удалять только свои сообщения');
          return;
        }
        if (!confirm('Удалить сообщение' + (msg.files?.length ? ' и прикреплённые файлы' : '') + '?')) return;
        const result = await App.deleteMessage(chatId, id, user.id);
        if (!result.ok) {
          alert(result.error || 'Не удалось удалить сообщение');
          return;
        }
        onUpdate();
        refreshUnreadBadges();
      } else if (action === 'edit') {
        const newText = prompt('Редактировать сообщение:', msg.text);
        if (newText !== null && newText.trim()) {
          App.editMessage(chatId, id, user.id, newText);
          onUpdate();
        }
      } else if (action === 'pin') {
        if (user.role !== 'admin') return;
        App.pinMessage(chatId, id, !msg.pinned);
        onUpdate();
      } else if (action === 'reply') {
        container.dispatchEvent(new CustomEvent('reply-to', {
          detail: { id, author: msg.authorName || msg.authorEmail, text: msg.text, files: msg.files }
        }));
      }
    });
  }

  return {
    initHeader, initAuthForms, renderMessage, renderMessages, bindMessageActions,
    initPasswordToggles, showNotifications, closeNotificationsPanel,
    refreshUnreadBadges, escapeHtml, escapeAttr, applyTheme, mountThemeToggle, toggleTheme,
    showSyncNotice
  };
})();

if (typeof App !== 'undefined' && App.ready) {
  App.ready.then(() => {
    UI.showSyncNotice();
    UI.refreshUnreadBadges();
    window.addEventListener('gost-data-synced', () => UI.refreshUnreadBadges());
    window.addEventListener('gost-unread-changed', () => UI.refreshUnreadBadges());
  });
}

(function bootTheme() {
  UI.applyTheme();
  function mountAll() {
    document.querySelectorAll('.header__inner').forEach(el => {
      if (typeof Mobile !== 'undefined' && Mobile.isMobile()) {
        el.querySelector('#btn-theme')?.remove();
        return;
      }
      UI.mountThemeToggle(el);
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();

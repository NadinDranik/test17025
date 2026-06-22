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
      { href: 'blog.html', label: 'Блог', id: 'blog' },
      { href: 'chats.html', label: 'Чаты', id: 'chats', unread: chatUnread }
    ];

    if (user && App.isProActive(user)) {
      navLinks.push({ href: 'pro.html', label: 'PRO', id: 'pro', unread: proUnread });
    } else if (user) {
      navLinks.push({ href: 'pro-request.html', label: 'PRO', id: 'pro-request' });
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
          : '<span class="user-badge">Без подписки</span>';
      const unread = App.getBellUnreadCount(user.id);
      const notifBadge = unread > 0 ? `<span class="notif-badge">${unread > 99 ? '99+' : unread}</span>` : '';
      const adminBadge = user.role === 'admin'
        ? App.getPendingProRequestCount() + App.getPendingPrivateMessageCount()
        : 0;
      const adminLink = user.role === 'admin'
        ? `<a href="admin.html" class="btn btn--ghost btn--sm user-menu__admin" title="Админ-панель">Админ${adminBadge > 0 ? `<span class="notif-badge">${adminBadge > 99 ? '99+' : adminBadge}</span>` : ''}</a>`
        : '';
      actionsHtml = `
        <div class="user-menu">
          ${badge}
          <a href="account.html" class="user-menu__nick" title="Личный кабинет">${escapeAttr(App.getDisplayName(user))}</a>
          <a href="admin-chat.html" class="btn btn--ghost btn--sm" title="Вопрос администратору">✉️${dmUnread > 0 ? `<span class="notif-badge">${dmUnread > 99 ? '99+' : dmUnread}</span>` : ''}</a>
          ${adminLink}
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
    const pendingRequests = App.getPendingProRequestCount();
    const dmUnread = App.getPendingPrivateMessageCount();

    const reqBadge = document.getElementById('pro-requests-badge');
    if (reqBadge) {
      reqBadge.textContent = pendingRequests > 99 ? '99+' : String(pendingRequests);
      reqBadge.hidden = pendingRequests === 0;
    }

    const dmBadge = document.getElementById('private-messages-badge');
    if (dmBadge) {
      dmBadge.textContent = dmUnread > 99 ? '99+' : String(dmUnread);
      dmBadge.hidden = dmUnread === 0;
    }

    document.querySelector('.admin-tab[data-tab="requests"]')
      ?.classList.toggle('admin-tab--has-new', pendingRequests > 0);
    document.querySelector('.admin-tab[data-tab="messages"]')
      ?.classList.toggle('admin-tab--has-new', dmUnread > 0);
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

  function renderAvatarHtml(user, msg, avatarUrls) {
    const author = user || { nickname: msg.authorName, email: msg.authorEmail };
    const initial = App.getUserInitial(author);
    const url = user && avatarUrls ? avatarUrls[msg.userId] : null;
    if (url) {
      return `<img class="msg-avatar msg-avatar--img" src="${escapeAttr(url)}" alt="" loading="lazy">`;
    }
    return `<span class="msg-avatar msg-avatar--initial" aria-hidden="true">${escapeHtml(initial)}</span>`;
  }

  function renderReactionsHtml(msg, currentUser) {
    const reactions = msg.reactions || {};
    const chips = Object.entries(reactions)
      .filter(([, users]) => users && users.length)
      .map(([emoji, userIds]) => {
        const active = currentUser && userIds.includes(currentUser.id);
        return `<button type="button" class="msg__reaction${active ? ' msg__reaction--active' : ''}" data-action="react" data-id="${msg.id}" data-emoji="${emoji}" title="Нажмите для реакции, на счётчик — кто поставил">${emoji}<span class="msg__reaction-count" data-action="reaction-users" data-id="${msg.id}" data-emoji="${emoji}">${userIds.length}</span></button>`;
      })
      .join('');

    return chips ? `<div class="msg__reactions">${chips}</div>` : '';
  }

  function formatMessageText(text) {
    const escaped = escapeHtml(text);
    return linkifyHtml(escaped);
  }

  function linkifyHtml(html) {
    return html.replace(
      /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi,
      (url) => {
        let href = url;
        if (!/^https?:\/\//i.test(href)) href = 'https://' + href;
        const safeHref = escapeAttr(href);
        return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="msg__link">${url}</a>`;
      }
    );
  }

  let reactionPopoverEl = null;

  function ensureReactionPopover() {
    if (reactionPopoverEl) return reactionPopoverEl;
    reactionPopoverEl = document.createElement('div');
    reactionPopoverEl.id = 'msg-reaction-popover';
    reactionPopoverEl.className = 'msg-reaction-popover';
    reactionPopoverEl.hidden = true;
    document.body.appendChild(reactionPopoverEl);
    document.addEventListener('click', e => {
      if (!e.target.closest('.msg-reaction-popover') && !e.target.closest('[data-action="react-picker"]') && !e.target.closest('.msg__react-trigger')) {
        hideReactionPopover();
      }
    });
    return reactionPopoverEl;
  }

  function showReactionPopover(anchorBtn, msgId, chatId, onUpdate) {
    const pop = ensureReactionPopover();
    const picker = App.REACTION_EMOJIS.map(emoji =>
      `<button type="button" class="msg__reaction-pick" data-action="react" data-id="${msgId}" data-emoji="${emoji}">${emoji}</button>`
    ).join('');
    pop.innerHTML = picker;
    pop.hidden = false;
    const isMobile = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(max-width: 992px)').matches;
    const rect = anchorBtn.getBoundingClientRect();
    const popW = pop.offsetWidth || 220;
    const popH = pop.offsetHeight || 52;
    if (isMobile) {
      pop.style.top = `${Math.max(8, rect.bottom + 4)}px`;
      pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - popW - 8))}px`;
    } else {
      pop.style.top = `${Math.max(8, rect.top - popH - 8)}px`;
      pop.style.left = `${Math.min(Math.max(8, rect.left), window.innerWidth - popW - 8)}px`;
    }
    pop.dataset.chatId = chatId;
    pop._onUpdate = onUpdate;
  }

  function hideReactionPopover() {
    if (reactionPopoverEl) reactionPopoverEl.hidden = true;
  }

  let detailsPopoverEl = null;

  function ensureDetailsPopover() {
    if (detailsPopoverEl) return detailsPopoverEl;
    detailsPopoverEl = document.createElement('div');
    detailsPopoverEl.id = 'msg-details-popover';
    detailsPopoverEl.className = 'msg-details-popover';
    detailsPopoverEl.hidden = true;
    document.body.appendChild(detailsPopoverEl);
    document.addEventListener('click', e => {
      if (!e.target.closest('.msg-details-popover') && !e.target.closest('[data-action="reaction-users"]')) {
        detailsPopoverEl.hidden = true;
      }
    });
    return detailsPopoverEl;
  }

  function showDetailsPopover(anchor, title, items) {
    const pop = ensureDetailsPopover();
    pop.innerHTML = `<p class="msg-details-popover__title">${escapeHtml(title)}</p><ul class="msg-details-popover__list">${items.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`;
    pop.hidden = false;
    const rect = anchor.getBoundingClientRect();
    pop.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - 120)}px`;
    pop.style.left = `${Math.min(rect.left, window.innerWidth - 240)}px`;
  }

  function formatMessageTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDateSeparator(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (today - msgDay) / 86400000;
    if (diff === 0) return 'Сегодня';
    if (diff === 1) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }

  function authorColor(name) {
    const palette = ['#e17076', '#7bc862', '#e5ca77', '#65aadd', '#a695e7', '#ee7aae', '#6ec9cb', '#faa774'];
    let hash = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) hash = s.charCodeAt(i) + ((hash << 5) - hash);
    return palette[Math.abs(hash) % palette.length];
  }

  function renderDocFileHtml(f) {
    const ext = App.getFileExt(f.name).toUpperCase();
    const src = f.dataUrl || '';
    if (src) {
      return `<a class="msg__doc" href="${src}" download="${escapeAttr(f.name)}">
        <span class="msg__doc-icon" aria-hidden="true"></span>
        <span class="msg__doc-info">
          <span class="msg__doc-name">${escapeAttr(f.name)}</span>
          <span class="msg__doc-meta">${App.formatFileSize(f.size).replace('.', ',')} ${ext}</span>
        </span>
      </a>`;
    }
    return `<span class="msg__file msg__file--missing">📎 ${escapeAttr(f.name)} · файл недоступен</span>`;
  }

  function updatePinnedBar(msgs) {
    const chatMain = document.querySelector('.chat-main');
    if (!chatMain) return;
    const pinned = msgs.find(m => m.pinned && !m.systemType);
    let bar = chatMain.querySelector('.chat-pinned-bar');
    if (!pinned) {
      bar?.remove();
      return;
    }
    const preview = pinned.text
      ? pinned.text.replace(/\s+/g, ' ').slice(0, 100)
      : (pinned.files && pinned.files[0] ? '📎 ' + pinned.files[0].name : '…');
    if (!bar) {
      bar = document.createElement('div');
      const messagesEl = chatMain.querySelector('.chat-messages');
      if (messagesEl) chatMain.insertBefore(bar, messagesEl);
      else chatMain.appendChild(bar);
    }
    bar.className = 'chat-pinned-bar';
    bar.setAttribute('role', 'button');
    bar.setAttribute('tabindex', '0');
    bar.dataset.pinId = pinned.id;
    bar.innerHTML = `
      <span class="chat-pinned-bar__accent"></span>
      <span class="chat-pinned-bar__body">
        <span class="chat-pinned-bar__label">Закреплённое сообщение</span>
        <span class="chat-pinned-bar__text">${escapeHtml(preview)}</span>
      </span>
      <span class="chat-pinned-bar__icon" aria-hidden="true">📌</span>`;
    if (!bar._pinBound) {
      bar._pinBound = true;
      const scrollToPin = () => {
        const el = document.querySelector('.msg[data-id="' + bar.dataset.pinId + '"]');
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      bar.addEventListener('click', scrollToPin);
      bar.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') scrollToPin(); });
    }
  }

  function isEmojiOnlyMessage(text) {
    return typeof EmojiPicker !== 'undefined' && EmojiPicker.isEmojiOnly
      ? EmojiPicker.isEmojiOnly(text)
      : false;
  }

  function renderMessage(msg, currentUser, chatId, allMessages, avatarUrls) {
    const isOwn = currentUser && msg.userId === currentUser.id;
    const isAdmin = currentUser && currentUser.role === 'admin';
    const reply = msg.replyTo ? allMessages.find(m => m.id === msg.replyTo) : null;
    const authorUser = App.getUserById(msg.userId);
    const avatarHtml = isOwn ? '' : renderAvatarHtml(authorUser, msg, avatarUrls);
    const authorName = msg.authorName || msg.authorEmail || '';

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
        return renderDocFileHtml(f);
      }).join('') + '</div>';
    }

    const textHtml = msg.text
      ? `<span class="msg__text">${formatMessageText(msg.text)}</span>`
      : '';

    const emojiOnly = !filesHtml && !reply && isEmojiOnlyMessage(msg.text);

    const replyLabel = reply
      ? (reply.text ? reply.text.slice(0, 80) : (reply.files && reply.files[0] ? '📎 ' + reply.files[0].name : '…'))
      : '';

    const isSystem = !!msg.systemType;
    const canManage = isOwn || isAdmin;
    const canDelete = canManage && (!isSystem || isAdmin);
    const canEdit = !isSystem && msg.text && (isOwn || isAdmin);

    const actions = currentUser ? `
      <div class="msg__actions">
        ${canEdit ? `<button type="button" class="msg__btn" data-action="edit" data-id="${msg.id}">Изменить</button>` : ''}
        ${canDelete ? `<button type="button" class="msg__btn msg__btn--danger" data-action="delete" data-id="${msg.id}">Удалить</button>` : ''}
        ${isAdmin ? `<button type="button" class="msg__btn" data-action="pin" data-id="${msg.id}">${msg.pinned ? 'Открепить' : 'Закрепить'}</button>` : ''}
        <button type="button" class="msg__btn" data-action="reply" data-id="${msg.id}">Ответить</button>
      </div>
      ${canEdit ? `<div class="msg__edit" hidden>
        <textarea class="msg__edit-input form__input" rows="3"></textarea>
        <div class="msg__edit-actions">
          <button type="button" class="btn btn--sm btn--primary" data-action="edit-save" data-id="${msg.id}">Сохранить</button>
          <button type="button" class="btn btn--sm btn--outline" data-action="edit-cancel" data-id="${msg.id}">Отмена</button>
        </div>
      </div>` : ''}` : '';

    const welcomeClass = msg.systemType === 'pro_welcome' ? ' msg--welcome' : '';
    const reactionsHtml = isSystem ? '' : renderReactionsHtml(msg, currentUser);
    const reactTrigger = (!isSystem && currentUser)
      ? `<button type="button" class="msg__react-trigger" data-action="react-picker" data-id="${msg.id}" title="Добавить реакцию" aria-label="Добавить реакцию">😊</button>`
      : '';
    const reactSlot = reactTrigger ? `<div class="msg__react-slot">${reactTrigger}</div>` : '';

    const authorHtml = isSystem || isOwn ? '' : `<span class="msg__author" style="color:${authorColor(authorName)}">${escapeAttr(authorName)}</span>`;
    const editedHtml = msg.editedAt ? '<span class="msg__edited">изменено</span>' : '';
    const checksHtml = isOwn && !isSystem ? '<span class="msg__checks" aria-label="Доставлено">✓✓</span>' : '';
    const footerHtml = !isSystem && !emojiOnly ? `<footer class="msg__footer">${editedHtml}<time class="msg__time">${formatMessageTime(msg.createdAt)}</time>${checksHtml}</footer>` : '';
    const emojiFooterHtml = emojiOnly ? `<footer class="msg__footer msg__footer--overlay">${editedHtml}<time class="msg__time">${formatMessageTime(msg.createdAt)}</time>${checksHtml}</footer>` : '';

    const replyHtml = reply
      ? `<div class="msg__reply"><span class="msg__reply-author">${escapeAttr(reply.authorName || reply.authorEmail)}</span><span class="msg__reply-text">${escapeHtml(replyLabel)}${replyLabel.length >= 80 ? '…' : ''}</span></div>`
      : '';

    const bottomBar = !isSystem && (reactionsHtml || actions) ? `
      <div class="msg__bubble-bottom">
        ${reactionsHtml}
        ${actions}
      </div>` : '';

    const bubbleInner = emojiOnly
      ? `<div class="msg__emoji-only">${textHtml}${emojiFooterHtml}</div>${bottomBar}`
      : `<div class="msg__inner">${authorHtml}${replyHtml}<div class="msg__text-row">${textHtml}${footerHtml}</div>${filesHtml}${bottomBar}</div>`;

    return `
      <article class="msg${isOwn ? ' msg--own' : ''}${msg.pinned ? ' msg--pinned' : ''}${welcomeClass}${emojiOnly ? ' msg--emoji-only' : ''}" data-id="${msg.id}">
        <div class="msg__layout">
          ${avatarHtml}
          <div class="msg__content">
            <div class="msg__bubble">
              ${msg.pinned ? '<span class="msg__pin-label">📌 Закреплено</span>' : ''}
              ${bubbleInner}
            </div>
            ${reactSlot}
          </div>
        </div>
      </article>`;
  }

  async function renderMessages(container, msgs, currentUser, chatId, emptyText) {
    updatePinnedBar(msgs);
    if (!msgs.length) {
      const empty = (typeof Mobile !== 'undefined' && Mobile.getEmptyChatText)
        ? Mobile.getEmptyChatText(chatId)
        : '<p class="chat-empty">' + (emptyText || 'Нет сообщений') + '</p>';
      container.innerHTML = empty;
      return;
    }
    const sorted = (typeof App.sortMessagesChronologically === 'function')
      ? App.sortMessagesChronologically(msgs)
      : msgs.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const mobileFast = typeof Mobile !== 'undefined' && Mobile.isMobile();
    const renderList = (list, avatarUrls) => {
      let lastDateKey = '';
      const parts = [];
      list.forEach(m => {
        const dateKey = new Date(m.createdAt).toDateString();
        if (dateKey !== lastDateKey) {
          parts.push(`<div class="msg-date-sep"><span>${formatDateSeparator(m.createdAt)}</span></div>`);
          lastDateKey = dateKey;
        }
        parts.push(renderMessage(m, currentUser, chatId, sorted, avatarUrls));
      });
      return parts.join('');
    };

    if (mobileFast) {
      container.innerHTML = renderList(sorted, {});
      container.scrollTop = container.scrollHeight;
      setupMessageViewTracking(container, chatId, currentUser);
      if (currentUser && chatId) {
        App.markChatRead(currentUser.id, chatId);
        refreshUnreadBadges();
      }
      const hydrateLimit = 15;
      const toHydrate = sorted.length > hydrateLimit ? sorted.slice(-hydrateLimit) : sorted;
      Promise.all([
        Promise.all(toHydrate.map(m => App.hydrateMessageFiles(m))),
        App.prefetchAvatarUrls([...new Set(toHydrate.map(m => m.userId))])
      ]).then(([hydratedBatch, avatarUrls]) => {
        if (!container.isConnected) return;
        const hydratedMap = new Map(hydratedBatch.map(m => [m.id, m]));
        const merged = sorted.map(m => hydratedMap.get(m.id) || m);
        container.innerHTML = renderList(merged, avatarUrls);
        container.scrollTop = container.scrollHeight;
        setupMessageViewTracking(container, chatId, currentUser);
      }).catch(() => {});
      return;
    }

    const hydrated = await Promise.all(sorted.map(m => App.hydrateMessageFiles(m)));
    const avatarUrls = await App.prefetchAvatarUrls([...new Set(sorted.map(m => m.userId))]);
    container.innerHTML = renderList(hydrated, avatarUrls);
    container.scrollTop = container.scrollHeight;
    setupMessageViewTracking(container, chatId, currentUser);
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

  function setupMessageViewTracking(container, chatId, currentUser) {
    if (!currentUser || !chatId) return;
    if (container._viewObserver) {
      container._viewObserver.disconnect();
      container._viewObserver = null;
    }
    const pending = new Set();
    let timer = null;
    const flush = () => {
      if (!pending.size) return;
      const ids = [...pending];
      pending.clear();
      App.recordMessageViews(chatId, ids, currentUser.id);
    };
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.target.dataset.id) {
          pending.add(entry.target.dataset.id);
        }
      });
      clearTimeout(timer);
      timer = setTimeout(flush, 400);
    }, { threshold: 0.55 });
    container.querySelectorAll('.msg').forEach(el => observer.observe(el));
    container._viewObserver = observer;
  }

  function startInlineEdit(article, text) {
    const textEl = article.querySelector('.msg__text');
    const editEl = article.querySelector('.msg__edit');
    const actionsEl = article.querySelector('.msg__actions');
    if (!editEl) return;
    article.classList.add('msg--editing');
    if (textEl) textEl.hidden = true;
    if (actionsEl) actionsEl.hidden = true;
    editEl.hidden = false;
    const input = editEl.querySelector('.msg__edit-input');
    if (input) input.value = text || '';
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  function cancelInlineEdit(article) {
    const textEl = article.querySelector('.msg__text');
    const editEl = article.querySelector('.msg__edit');
    const actionsEl = article.querySelector('.msg__actions');
    article.classList.remove('msg--editing');
    if (textEl) textEl.hidden = false;
    if (actionsEl) actionsEl.hidden = false;
    if (editEl) editEl.hidden = true;
  }
  function bindMessageActions(container, chatIdOrFn, currentUser, onUpdate) {
    if (!window._msgReactionPopoverBound) {
      window._msgReactionPopoverBound = true;
      ensureReactionPopover();
      reactionPopoverEl.addEventListener('click', async e => {
        const btn = e.target.closest('[data-action="react"]');
        if (!btn) return;
        const chatId = reactionPopoverEl.dataset.chatId;
        const user = App.getCurrentUser();
        if (!chatId || !user) return;
        hideReactionPopover();
        const result = await App.toggleReaction(chatId, btn.dataset.id, user.id, btn.dataset.emoji);
        if (!result.ok) {
          alert(result.error || 'Не удалось поставить реакцию');
          return;
        }
        if (typeof reactionPopoverEl._onUpdate === 'function') reactionPopoverEl._onUpdate();
      });
    }

    container.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const chatId = typeof chatIdOrFn === 'function' ? chatIdOrFn() : chatIdOrFn;
      if (!chatId) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const msgs = App.getMessages(chatId);
      const msg = msgs.find(m => m.id === id);
      const user = App.getCurrentUser();
      if (!user) return;

      if (action === 'react-picker') {
        if (!msg) return;
        e.stopPropagation();
        showReactionPopover(btn, id, chatId, onUpdate);
        return;
      }

      if (action === 'reaction-users') {
        if (!msg) return;
        e.stopPropagation();
        const emoji = btn.dataset.emoji;
        const userIds = (msg.reactions && msg.reactions[emoji]) || [];
        const names = App.getMessageUserNames(userIds);
        showDetailsPopover(btn, `${emoji} — реакции`, names.length ? names : ['Пока никто']);
        return;
      }

      if (action === 'react') {
        if (!msg) return;
        if (e.target.closest('[data-action="reaction-users"]')) return;
        const emoji = btn.dataset.emoji;
        if (!emoji) return;
        hideReactionPopover();
        const result = await App.toggleReaction(chatId, id, user.id, emoji);
        if (!result.ok) {
          alert(result.error || 'Не удалось поставить реакцию');
          return;
        }
        onUpdate();
        return;
      }

      if (!msg) return;

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
        const article = btn.closest('.msg');
        if (article) startInlineEdit(article, msg.text);
      } else if (action === 'edit-cancel') {
        const article = btn.closest('.msg');
        if (article) cancelInlineEdit(article);
      } else if (action === 'edit-save') {
        const article = btn.closest('.msg');
        const input = article?.querySelector('.msg__edit-input');
        if (!input) return;
        const result = await App.editMessage(chatId, id, user.id, input.value);
        if (!result.ok) {
          alert(result.error || 'Не удалось сохранить');
          return;
        }
        onUpdate();
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
    window.addEventListener('gost-auth-updated', () => {
      UI.refreshUnreadBadges();
      UI.showSyncNotice();
    });
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

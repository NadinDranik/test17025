/**
 * Мобильный UX: нижнее меню, компактная шапка, карточки, подписка человеческим языком
 */
const Mobile = (function () {
  const BP = 992;
  const NO_NAV = new Set(['login.html', 'consent.html']);

  const PAGE_TAB = {
    'index.html': 'home',
    'blog.html': 'blog',
    'chat.html': 'chats',
    'chats.html': 'chats',
    'pro.html': 'chats',
    'pro-request.html': 'chats',
    'admin-chat.html': 'support',
    'account.html': 'account',
    'admin.html': 'account'
  };

  function isMobile() {
    return window.matchMedia('(max-width: ' + BP + 'px)').matches;
  }

  function currentPage() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  function daysLeft(user) {
    if (!user || !user.proExpiresAt) return null;
    const ms = new Date(user.proExpiresAt) - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  }

  function getSubscriptionInfo(user) {
    if (!user) {
      return { title: 'Гость', short: 'Гость', tone: 'free' };
    }
    if (user.blocked) {
      return { title: 'Доступ ограничен', short: 'Заблокирован', tone: 'danger' };
    }
    if (user.role === 'admin') {
      return { title: 'Администратор', short: 'Админ', tone: 'admin' };
    }
    if (App.isProActive(user)) {
      const d = daysLeft(user);
      return {
        title: 'Подписка активна',
        short: 'PRO',
        tone: 'pro',
        until: App.formatDate(user.proExpiresAt),
        daysLeft: d
      };
    }
    if (user.proExpiresAt && new Date(user.proExpiresAt) <= new Date()) {
      return { title: 'Подписка не оформлена', short: 'Истекла', tone: 'warn' };
    }
    return { title: 'Подписка не оформлена', short: 'Без подписки', tone: 'free' };
  }

  function subscriptionCardHtml(user) {
    const s = getSubscriptionInfo(user);
    let body = '<p class="m-card__status m-card__status--' + s.tone + '">' + s.title + '</p>';
    if (s.until) {
      body += '<p class="m-card__meta">Действует до: <strong>' + s.until + '</strong></p>';
    }
    if (s.daysLeft != null) {
      body += '<p class="m-card__meta">Осталось: <strong>' + s.daysLeft + ' дн.</strong></p>';
    }
    return body;
  }

  function mountBottomNav() {
    const page = currentPage();
    if (!isMobile() || NO_NAV.has(page)) {
      document.getElementById('mobile-bottom-nav')?.remove();
      document.body.classList.remove('has-mobile-nav');
      return;
    }

    const user = App.getCurrentUser();
    const active = PAGE_TAB[page] || '';
    const chatUnread = user ? App.getTotalUnreadMessages(user.id) : 0;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const themeIcon = isDark ? '☀️' : '🌙';
    const themeLabel = isDark ? 'Светлая' : 'Тёмная';
    const items = [
      { id: 'home', href: 'index.html', icon: '⌂', label: 'Главная' },
      { id: 'blog', href: 'blog.html', icon: '📰', label: 'Блог' },
      { id: 'chats', href: 'chats.html', icon: '💬', label: 'Чаты', badge: chatUnread },
      { id: 'account', href: user ? 'account.html' : App.getLoginUrl('account.html'), icon: '👤', label: 'Кабинет' }
    ];

    let nav = document.getElementById('mobile-bottom-nav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = 'mobile-bottom-nav';
      nav.className = 'mobile-bottom-nav';
      nav.setAttribute('aria-label', 'Основная навигация');
      document.body.appendChild(nav);
    }

    const linksHtml = items.map(item => {
      const badgeHtml = item.badge > 0
        ? `<span class="mobile-bottom-nav__badge">${item.badge > 99 ? '99+' : item.badge}</span>`
        : '';
      return `
      <a href="${item.href}" class="mobile-bottom-nav__item${active === item.id ? ' mobile-bottom-nav__item--active' : ''}">
        <span class="mobile-bottom-nav__icon-wrap">
          <span class="mobile-bottom-nav__icon" aria-hidden="true">${item.icon}</span>
          ${badgeHtml}
        </span>
        <span class="mobile-bottom-nav__label">${item.label}</span>
      </a>`;
    }).join('');

    nav.innerHTML = linksHtml + `
      <button type="button" id="btn-theme-mobile" class="mobile-bottom-nav__item mobile-bottom-nav__item--theme" aria-label="${themeLabel} тема">
        <span class="mobile-bottom-nav__icon-wrap">
          <span class="mobile-bottom-nav__icon" aria-hidden="true">${themeIcon}</span>
        </span>
        <span class="mobile-bottom-nav__label">Тема</span>
      </button>`;

    nav.querySelector('#btn-theme-mobile')?.addEventListener('click', () => {
      UI.toggleTheme();
    });

    document.body.classList.add('has-mobile-nav');
  }

  function refreshBottomNavBadges() {
    if (!isMobile()) return;
    mountBottomNav();
  }

  function refreshChatsHubBadges() {
    const hub = document.getElementById('chats-hub');
    if (hub && hub.innerHTML.trim()) renderChatsHub(hub);
    refreshDesktopChatsNav();
  }

  function bindMobileHeaderEvents(header) {
    header.querySelector('[data-action="logout"]')?.addEventListener('click', async () => {
      await App.logout();
      window.location.href = 'index.html';
    });
    header.querySelector('#btn-notifications-mobile')?.addEventListener('click', () => {
      if (typeof UI !== 'undefined' && UI.showNotifications) UI.showNotifications();
    });
  }

  function buildMobileToolbarHtml(user) {
    if (!user) {
      return `
        <div class="mobile-header-toolbar__auth">
          <a href="${App.getLoginUrl()}" class="mobile-header-btn mobile-header-btn--ghost">Войти</a>
          <a href="login.html?tab=register" class="mobile-header-btn mobile-header-btn--primary">Регистрация</a>
        </div>`;
    }

    const bellCount = App.getBellUnreadCount(user.id);
    const bellBadge = bellCount > 0
      ? `<span class="notif-badge">${bellCount > 99 ? '99+' : bellCount}</span>`
      : '';

    return `
      <div class="mobile-header-toolbar__user">
        <a href="account.html" class="mobile-header-login" title="Личный кабинет">${UI.escapeHtml(App.getDisplayName(user))}</a>
        <button type="button" class="btn-notifications mobile-header-bell" id="btn-notifications-mobile" title="Уведомления и сообщения" aria-label="Уведомления">🔔${bellBadge}</button>
        <button type="button" class="mobile-header-logout" data-action="logout">Выйти</button>
      </div>`;
  }

  function mountCompactHeader() {
    if (!isMobile()) {
      document.body.classList.remove('mobile-shell');
      document.querySelectorAll('.mobile-header-toolbar, .mobile-header-status, .mobile-header-more, .mobile-header-menu').forEach(el => el.remove());
      const nav = document.querySelector('.nav');
      const actions = document.querySelector('.header__actions');
      const burger = document.querySelector('.burger');
      if (nav) nav.hidden = false;
      if (actions) actions.hidden = false;
      if (burger) burger.hidden = false;
      return;
    }

    document.body.classList.add('mobile-shell');
    const page = currentPage();
    if (NO_NAV.has(page)) return;

    const header = document.querySelector('.header__inner');
    if (!header) return;

    document.querySelectorAll('.mobile-header-status').forEach(el => el.remove());

    const nav = header.querySelector('.nav');
    const actions = header.querySelector('.header__actions');
    const burger = header.querySelector('.burger');
    if (nav) nav.hidden = true;
    if (actions) actions.hidden = true;
    if (burger) burger.hidden = true;
    header.querySelector('#btn-theme')?.remove();

    let toolbar = header.querySelector('.mobile-header-toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'mobile-header-toolbar';
      header.appendChild(toolbar);
    }

    const user = App.getCurrentUser();
    toolbar.innerHTML = buildMobileToolbarHtml(user);
    bindMobileHeaderEvents(header);
  }

  function renderHomeDashboard(container) {
    const user = App.getCurrentUser();
    if (!user || !container) return;
    container.hidden = false;
    container.innerHTML = `
      <div class="m-dashboard">
        <h2 class="m-dashboard__greeting">Здравствуйте, ${UI.escapeHtml(App.getDisplayName(user))}</h2>
        <div class="m-cards">
          <article class="m-card m-card--status">
            <h3 class="m-card__title">Статус подписки</h3>
            ${subscriptionCardHtml(user)}
          </article>
          <a href="chats.html" class="m-card m-card--link">
            <h3 class="m-card__title">Чаты</h3>
            <p class="m-card__desc">Общение участников и экспертные разделы</p>
          </a>
          <a href="account.html" class="m-card m-card--link">
            <h3 class="m-card__title">Личный кабинет</h3>
            <p class="m-card__desc">Профиль, подписка и настройки</p>
          </a>
          <a href="admin-chat.html" class="m-card m-card--link">
            <h3 class="m-card__title">Вопрос администратору</h3>
            <p class="m-card__desc">Доступ, оплата и помощь по сообществу</p>
          </a>
        </div>
      </div>`;
    document.body.classList.add('logged-in-home');
  }

  function getUnreadCount(chatId) {
    const user = App.getCurrentUser();
    if (!user) return 0;
    return App.getChatUnreadCount(user.id, chatId);
  }

  function unreadBadgeHtml(count) {
    if (!count) return '';
    return `<span class="m-card__unread">${count > 99 ? '99+' : count}</span>`;
  }

  function getChatLastMessage(chatId) {
    const msgs = App.getMessages(chatId);
    return msgs.length ? msgs[msgs.length - 1] : null;
  }

  function formatChatListTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (today - msgDay) / 86400000;
    if (diff === 0) {
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    if (diff === 1) return 'вч';
    if (diff < 7) {
      return ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()];
    }
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function getMessagePreviewHtml(msg, currentUserId) {
    if (!msg) return '<span class="tg-chat-item__preview-text">Нет сообщений</span>';
    let text = '';
    if (msg.text) {
      text = msg.text.replace(/\s+/g, ' ').slice(0, 55);
    } else if (msg.files && msg.files.length) {
      const f = msg.files[0];
      const ext = App.getFileExt(f.name);
      if (App.isImageExt(ext)) text = '📷 Фото';
      else if (App.isVideoExt(ext)) text = '🎬 Видео';
      else text = '📎 ' + f.name;
    }
    const truncated = msg.text && msg.text.replace(/\s+/g, ' ').length > 55;
    const youPrefix = currentUserId && msg.userId === currentUserId
      ? '<span class="tg-chat-card__you">Вы: </span>'
      : '';
    return youPrefix + UI.escapeHtml(text) + (truncated ? '…' : '');
  }

  function getChatEmoji(tier) {
    if (tier === 'free') return '💬';
    if (tier === 'pro') return '📋';
    if (tier === 'dm') return '✉️';
    return '💬';
  }

  function getTierPlaqueClass(tier) {
    return tier ? ' tg-chat-card__plaque--' + tier : '';
  }

  function tgChatRowHtml(opts) {
    const user = App.getCurrentUser();
    const last = opts.chatId ? getChatLastMessage(opts.chatId) : null;
    const time = last ? formatChatListTime(last.createdAt) : '';
    const preview = getMessagePreviewHtml(last, user?.id);
    const emoji = opts.emoji || getChatEmoji(opts.tier);
    const unread = opts.unread || 0;
    const pinIcon = opts.pinned ? '<span class="tg-chat-card__pin" aria-hidden="true">📌</span>' : '';
    const checks = last && user && last.userId === user.id
      ? '<span class="tg-chat-card__checks">✓✓</span>'
      : '';
    const tierMod = opts.tier ? ' tg-chat-card--' + opts.tier : '';
    const extraMod = opts.modifier || '';

    return `
      <a href="${opts.href}" class="tg-chat-card${tierMod}${extraMod}">
        <span class="tg-chat-card__glow" aria-hidden="true"></span>
        <span class="tg-chat-card__shine" aria-hidden="true"></span>
        <span class="tg-chat-card__inner">
          <span class="tg-chat-card__avatar tg-chat-card__avatar--${opts.tier || 'default'}" aria-hidden="true">${emoji}</span>
          <span class="tg-chat-card__main">
            <span class="tg-chat-card__head">
              ${pinIcon}
              <span class="tg-chat-card__plaque${getTierPlaqueClass(opts.tier)}">${UI.escapeHtml(opts.title)}</span>
              <span class="tg-chat-card__meta">
                ${time ? `<time class="tg-chat-card__time">${time}</time>` : ''}
                ${unread ? `<span class="tg-chat-card__badge">${unread > 99 ? '99+' : unread}</span>` : ''}
              </span>
            </span>
            <span class="tg-chat-card__preview-row">
              <span class="tg-chat-card__preview">${preview}</span>
              ${checks}
            </span>
          </span>
        </span>
      </a>`;
  }

  function chatRowHtml(opts) {
    const tierLabel = opts.tier === 'pro' ? 'PRO' : opts.tier === 'free' ? 'FREE' : opts.tier === 'dm' ? 'ЛС' : '';
    const tier = opts.tier
      ? `<span class="m-card__tier m-card__tier--${opts.tier}" aria-label="${tierLabel}">${tierLabel}</span>`
      : '';
    const pin = opts.pinned ? '📌 ' : '';
    return `
      <a href="${opts.href}" class="m-card m-card--chat m-card--compact${opts.modifier || ''}">
        <div class="m-card__row">
          ${tier}
          <span class="m-card__title">${pin}${UI.escapeHtml(opts.title)}</span>
          ${unreadBadgeHtml(opts.unread || 0)}
        </div>
      </a>`;
  }

  function getProLockHref() {
    const user = App.getCurrentUser();
    return user ? 'pro-request.html' : App.getLoginUrl('pro-request.html');
  }

  function tgLockedTopicRowHtml(topic) {
    const user = App.getCurrentUser();
    const preview = user ? 'Доступ по подписке PRO' : 'Войдите и оформите PRO';
    return `
      <a href="${getProLockHref()}" class="tg-chat-card tg-chat-card--pro tg-chat-card--locked">
        <span class="tg-chat-card__glow" aria-hidden="true"></span>
        <span class="tg-chat-card__shine" aria-hidden="true"></span>
        <span class="tg-chat-card__inner">
          <span class="tg-chat-card__avatar tg-chat-card__avatar--pro" aria-hidden="true">🔒</span>
          <span class="tg-chat-card__main">
            <span class="tg-chat-card__head">
              <span class="tg-chat-card__plaque tg-chat-card__plaque--pro tg-chat-card__plaque--locked">${UI.escapeHtml(topic.title)}</span>
              <span class="tg-chat-card__meta">
                <span class="tg-chat-card__tier-tag">PRO</span>
              </span>
            </span>
            <span class="tg-chat-card__preview-row">
              <span class="tg-chat-card__preview">${preview}</span>
            </span>
          </span>
        </span>
      </a>`;
  }

  function getProTopicHref(topicId) {
    const page = (window.location.pathname.split('/').pop() || 'index.html').split('?')[0];
    const hash = '#t=' + encodeURIComponent(topicId);
    return page === 'pro.html' ? hash : 'pro.html' + hash;
  }

  function tgPlaceholderCard(title, preview, tier) {
    return `
      <div class="tg-chat-card tg-chat-card--${tier} tg-chat-card--static">
        <span class="tg-chat-card__glow" aria-hidden="true"></span>
        <span class="tg-chat-card__inner">
          <span class="tg-chat-card__avatar tg-chat-card__avatar--${tier}" aria-hidden="true">📋</span>
          <span class="tg-chat-card__main">
            <span class="tg-chat-card__head">
              <span class="tg-chat-card__plaque tg-chat-card__plaque--${tier}">${UI.escapeHtml(title)}</span>
            </span>
            <span class="tg-chat-card__preview-row">
              <span class="tg-chat-card__preview">${UI.escapeHtml(preview)}</span>
            </span>
          </span>
        </span>
      </div>`;
  }

  function tgLockedCard(href, title, preview, tier) {
    return `
      <a href="${href}" class="tg-chat-card tg-chat-card--${tier} tg-chat-card--locked">
        <span class="tg-chat-card__glow" aria-hidden="true"></span>
        <span class="tg-chat-card__shine" aria-hidden="true"></span>
        <span class="tg-chat-card__inner">
          <span class="tg-chat-card__avatar tg-chat-card__avatar--${tier}" aria-hidden="true">🔒</span>
          <span class="tg-chat-card__main">
            <span class="tg-chat-card__head">
              <span class="tg-chat-card__plaque tg-chat-card__plaque--${tier} tg-chat-card__plaque--locked">${UI.escapeHtml(title)}</span>
            </span>
            <span class="tg-chat-card__preview-row">
              <span class="tg-chat-card__preview">${UI.escapeHtml(preview)}</span>
            </span>
          </span>
        </span>
      </a>`;
  }

  function navListRowHtml(opts) {
    const pin = opts.pinned ? '<span class="desktop-chats-nav__pin" aria-hidden="true">📌</span>' : '';
    const active = opts.active ? ' desktop-chats-nav__item--active' : '';
    const tierMod = opts.tier ? ' desktop-chats-nav__item--' + opts.tier : '';
    return `
      <a href="${opts.href}" class="desktop-chats-nav__item${active}${tierMod}${opts.modifier || ''}">
        <span class="desktop-chats-nav__plaque desktop-chats-nav__plaque--${opts.tier || 'default'}">${pin}${UI.escapeHtml(opts.title)}</span>
        ${unreadBadgeHtml(opts.unread || 0)}
      </a>`;
  }

  function navLockedTopicRowHtml(topic) {
    return `
      <a href="${getProLockHref()}" class="desktop-chats-nav__item desktop-chats-nav__item--locked desktop-chats-nav__item--pro">
        <span class="desktop-chats-nav__lock" aria-hidden="true">🔒</span>
        <span class="desktop-chats-nav__plaque desktop-chats-nav__plaque--pro desktop-chats-nav__plaque--locked">${UI.escapeHtml(topic.title)}</span>
      </a>`;
  }

  function renderChatsNavList(container, activeChatId) {
    if (!container) return;
    const user = App.getCurrentUser();

    const isPro = user && (App.isProActive(user) || user.role === 'admin');
    const topics = App.getProTopics(false);
    const dmChatId = user ? App.getAdminDmChatId(user.id) : '';

    let proHtml = '';
    if (isPro) {
      proHtml = topics.length
        ? topics.map(t => navListRowHtml({
          href: getProTopicHref(t.id),
          tier: 'pro',
          title: t.title,
          pinned: t.pinned,
          unread: getUnreadCount(t.id),
          active: activeChatId === t.id,
          modifier: ' desktop-chats-nav__item--pro'
        })).join('')
        : '<p class="desktop-chats-nav__empty">PRO-чаты пока не созданы</p>';
    } else if (topics.length) {
      proHtml = topics.map(t => navLockedTopicRowHtml(t)).join('');
    } else if (user) {
      proHtml = `
        <a href="pro-request.html" class="desktop-chats-nav__item desktop-chats-nav__item--locked desktop-chats-nav__item--pro">
          <span class="desktop-chats-nav__plaque desktop-chats-nav__plaque--pro">Оформить PRO-доступ</span>
        </a>`;
    }

    const adminHtml = user
      ? navListRowHtml({
        href: 'admin-chat.html',
        tier: 'dm',
        title: 'Вопрос администратору',
        unread: getUnreadCount(dmChatId),
        active: activeChatId === dmChatId
      })
      : `
        <a href="${App.getLoginUrl('admin-chat.html')}" class="desktop-chats-nav__item desktop-chats-nav__item--locked desktop-chats-nav__item--dm">
          <span class="desktop-chats-nav__lock" aria-hidden="true">🔒</span>
          <span class="desktop-chats-nav__plaque desktop-chats-nav__plaque--dm desktop-chats-nav__plaque--locked">Вопрос администратору</span>
        </a>`;

    container.innerHTML = `
      <div class="desktop-chats-nav__head">${user ? 'Мои чаты' : 'Чаты'}</div>
      ${navListRowHtml({
        href: 'chat.html',
        tier: 'free',
        title: 'Общий чат',
        unread: user ? getUnreadCount('free') : 0,
        active: activeChatId === 'free'
      })}
      ${proHtml}
      ${adminHtml}`;
  }

  function renderChatsHub(container) {
    if (!container) return;
    const user = App.getCurrentUser();

    const isPro = user && (App.isProActive(user) || user.role === 'admin');
    const topics = App.getProTopics(false);

    let proCardsHtml = '';
    if (isPro) {
      if (topics.length) {
        proCardsHtml = topics.map(t => tgChatRowHtml({
          href: getProTopicHref(t.id),
          tier: 'pro',
          title: t.title,
          chatId: t.id,
          pinned: t.pinned,
          unread: getUnreadCount(t.id),
          modifier: ' m-card--pro'
        })).join('');
      } else {
        proCardsHtml = tgPlaceholderCard('PRO-чаты пока не созданы', 'Ожидайте создания тем администратором', 'pro');
      }
    } else if (topics.length) {
      proCardsHtml = topics.map(t => tgLockedTopicRowHtml(t)).join('');
    } else if (user) {
      proCardsHtml = tgLockedCard('pro-request.html', 'Закрытые PRO-чаты', 'Оформите подписку для доступа', 'pro');
    }

    const dmChatId = user ? App.getAdminDmChatId(user.id) : '';
    const chatCount = 1 + topics.length + (user ? 1 : 0);
    const adminCardHtml = user
      ? tgChatRowHtml({ href: 'admin-chat.html', tier: 'dm', title: 'Вопрос администратору', chatId: dmChatId, unread: getUnreadCount(dmChatId) })
      : tgLockedCard(App.getLoginUrl('admin-chat.html'), 'Вопрос администратору', 'Войдите, чтобы написать администратору', 'dm');

    container.innerHTML = `
      <div class="tg-chats-page">
        <header class="tg-chats-header">
          <h1 class="tg-chats-header__title">${user ? 'Мои чаты' : 'Чаты'}</h1>
          <p class="tg-chats-header__sub">${chatCount} ${chatCount === 1 ? 'чат' : chatCount < 5 ? 'чата' : 'чатов'}</p>
        </header>
        <div class="tg-chat-list">
          ${tgChatRowHtml({ href: 'chat.html', tier: 'free', title: 'Общий чат', chatId: 'free', unread: user ? getUnreadCount('free') : 0 })}
          ${proCardsHtml}
          ${adminCardHtml}
        </div>
      </div>`;
  }

  function mountDesktopChatsNav(activeChatId) {
    if (isMobile()) return;
    document.querySelectorAll('#desktop-chats-nav').forEach(el => {
      if (activeChatId) el.dataset.activeChat = activeChatId;
      renderChatsNavList(el, el.dataset.activeChat || activeChatId || '');
    });
  }

  function refreshDesktopChatsNav() {
    if (isMobile()) return;
    document.querySelectorAll('#desktop-chats-nav').forEach(el => {
      renderChatsNavList(el, el.dataset.activeChat || '');
    });
  }

  function getEmptyChatText(chatId) {
    if (chatId && typeof chatId === 'string' && chatId.indexOf('dm:') === 0) {
      return getSupportEmptyText();
    }
    if (chatId === 'free') {
      return `<div class="chat-empty chat-empty--warm">
        <p class="chat-empty__title">Здесь пока нет сообщений</p>
        <p>Начните обсуждение первым.</p>
        <p class="chat-empty__hint">Вопросы по аккредитации, ГОСТ ISO/IEC 17025, проверкам и лабораторной практике — здесь уместны.</p>
      </div>`;
    }
    return `<div class="chat-empty">
      <p class="chat-empty__title">Здесь пока нет сообщений</p>
      <p>Начните обсуждение первым.</p>
    </div>`;
  }

  function getSupportEmptyText() {
    return `<div class="chat-empty">
      <p class="chat-empty__title">У вас пока нет обращений</p>
      <p>Создайте первое, если нужен доступ или помощь.</p>
    </div>`;
  }

  function loadEmojiPicker() {
    if (typeof EmojiPicker !== 'undefined') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-lazy="emoji-picker"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(), { once: true });
        return;
      }
      const v = typeof window !== 'undefined' && window.GOST_ASSET_V;
      const src = v ? 'js/emoji-picker.js?v=' + encodeURIComponent(v) : 'js/emoji-picker.js';
      const script = document.createElement('script');
      script.src = src;
      script.dataset.lazy = 'emoji-picker';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('emoji-picker load failed'));
      document.body.appendChild(script);
    });
  }

  function injectTelegramCompose() {
    if (!document.querySelector('.chat-form, #msg-form')) return;
    loadEmojiPicker().then(() => {
      if (typeof EmojiPicker !== 'undefined') EmojiPicker.init();
    }).catch(() => {});
  }

  function injectChatHeaderAvatar() {
    const header = document.querySelector('.chat-main__header');
    if (!header || header.querySelector('.chat-main__header-avatar')) return;
    const h2 = header.querySelector('h2');
    const count = header.querySelector('.chat-main__count');
    if (!h2) return;

    const avatar = document.createElement('span');
    avatar.className = 'chat-main__header-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    const title = h2.textContent || '💬';
    avatar.textContent = title.includes('PRO') ? '📋' : title.includes('админ') || title.includes('Админ') ? '✉️' : '💬';

    const info = document.createElement('div');
    info.className = 'chat-main__header-info';
    if (count) {
      info.appendChild(h2);
      info.appendChild(count);
    } else {
      info.appendChild(h2);
    }

    const back = header.querySelector('.chat-back, .pro-chat-back');
    if (back) {
      header.insertBefore(avatar, back.nextSibling);
    } else {
      header.insertBefore(avatar, header.firstChild);
    }
    header.insertBefore(info, avatar.nextSibling);
  }

  function injectChatBack() {
    if (!isMobile()) return;
    const header = document.querySelector('.chat-main__header');
    if (!header || header.querySelector('.chat-back')) return;
    const back = document.createElement('a');
    back.href = 'chats.html';
    back.className = 'chat-back';
    back.setAttribute('aria-label', 'К чатам');
    back.textContent = '←';
    header.insertBefore(back, header.firstChild);
  }

  function init(activePage) {
    mountCompactHeader();
    mountBottomNav();
    injectChatBack();
    injectChatHeaderAvatar();
    injectTelegramCompose();
    window.addEventListener('resize', () => {
      mountCompactHeader();
      mountBottomNav();
      injectChatBack();
      injectChatHeaderAvatar();
      injectTelegramCompose();
    });
    window.addEventListener('gost-data-synced', () => {
      mountCompactHeader();
      mountBottomNav();
      refreshDesktopChatsNav();
    });
    window.addEventListener('gost-unread-changed', () => {
      mountCompactHeader();
      mountBottomNav();
      refreshDesktopChatsNav();
    });
  }

  return {
    BP,
    isMobile,
    init,
    getSubscriptionInfo,
    subscriptionCardHtml,
    renderHomeDashboard,
    renderChatsHub,
    renderChatsNavList,
    mountDesktopChatsNav,
    getProTopicHref,
    getEmptyChatText,
    getSupportEmptyText,
    currentPage,
    refreshBottomNavBadges,
    refreshChatsHubBadges,
    refreshDesktopChatsNav
  };
})();

/**
 * Мобильный UX: нижнее меню, компактная шапка, карточки, подписка человеческим языком
 */
const Mobile = (function () {
  const BP = 992;
  const NO_NAV = new Set(['login.html', 'consent.html']);

  const PAGE_TAB = {
    'index.html': 'home',
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
    return { title: 'Подписка не оформлена', short: 'Free', tone: 'free' };
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
      { id: 'chats', href: 'chats.html', icon: '💬', label: 'Чаты', badge: chatUnread },
      { id: 'account', href: user ? 'account.html' : App.getLoginUrl('account.html'), icon: '👤', label: 'Кабинет' },
      { id: 'support', href: user ? 'admin-chat.html' : App.getLoginUrl('admin-chat.html'), icon: '✉️', label: 'Поддержка' }
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

  function chatRowHtml(opts) {
    const tier = opts.tier
      ? `<span class="m-card__tier m-card__tier--${opts.tier}" aria-label="${opts.tier === 'pro' ? 'PRO' : 'FREE'}">${opts.tier === 'pro' ? 'PRO' : 'FREE'}</span>`
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

  function renderChatsHub(container) {
    const user = App.getCurrentUser();
    if (!container || !user) return;

    const isPro = App.isProActive(user) || user.role === 'admin';
    const topics = isPro ? App.getProTopics(false) : [];

    let proCardsHtml = '';
    if (isPro) {
      if (topics.length) {
        proCardsHtml = topics.map(t => chatRowHtml({
          href: 'pro.html#t=' + encodeURIComponent(t.id),
          tier: 'pro',
          title: t.title,
          pinned: t.pinned,
          unread: getUnreadCount(t.id),
          modifier: ' m-card--pro'
        })).join('');
      } else {
        proCardsHtml = `
          <article class="m-card m-card--compact m-card--empty">
            <span class="m-card__title">PRO-чаты пока не созданы</span>
          </article>`;
      }
    } else {
      proCardsHtml = `
        <article class="m-card m-card--compact m-card--locked">
          <div class="m-card__row">
            <span class="m-card__tier m-card__tier--pro">PRO</span>
            <span class="m-card__title">PRO-чаты</span>
          </div>
          <a href="pro-request.html" class="btn btn--pro btn--sm m-card__cta-compact">Оформить доступ</a>
        </article>`;
    }

    const dmChatId = App.getAdminDmChatId(user.id);

    container.innerHTML = `
      <div class="m-page m-page--chats">
        <h1 class="m-page__title">Чаты</h1>
        <div class="m-cards m-cards--compact">
          ${chatRowHtml({ href: 'chat.html', tier: 'free', title: 'Общий чат', unread: getUnreadCount('free') })}
          ${proCardsHtml}
          ${chatRowHtml({ href: 'admin-chat.html', title: 'Вопрос администратору', unread: getUnreadCount(dmChatId) })}
        </div>
      </div>`;
  }

  function getEmptyChatText(chatId) {
    if (chatId && typeof chatId === 'string' && chatId.indexOf('dm:') === 0) {
      return getSupportEmptyText();
    }
    if (chatId === 'free') {
      return `<div class="chat-empty chat-empty--warm">
        <p class="chat-empty__title">Пока здесь нет сообщений</p>
        <p>Задайте первый вопрос или начните обсуждение.</p>
        <p class="chat-empty__hint">Здесь можно задавать вопросы по аккредитации, ГОСТ ISO/IEC 17025, проверкам, СМК и лабораторной практике.</p>
      </div>`;
    }
    return `<div class="chat-empty">
      <p class="chat-empty__title">Пока здесь нет сообщений</p>
      <p>Задайте первый вопрос или начните обсуждение.</p>
    </div>`;
  }

  function getSupportEmptyText() {
    return `<div class="chat-empty">
      <p class="chat-empty__title">У вас пока нет обращений</p>
      <p>Создайте первое, если нужен доступ или помощь.</p>
    </div>`;
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
    window.addEventListener('resize', () => {
      mountCompactHeader();
      mountBottomNav();
      injectChatBack();
    });
    window.addEventListener('gost-data-synced', () => {
      mountCompactHeader();
      mountBottomNav();
    });
    window.addEventListener('gost-unread-changed', () => {
      mountCompactHeader();
      mountBottomNav();
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
    getEmptyChatText,
    getSupportEmptyText,
    currentPage,
    refreshBottomNavBadges,
    refreshChatsHubBadges
  };
})();

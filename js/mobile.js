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
    const items = [
      { id: 'home', href: 'index.html', icon: '⌂', label: 'Главная' },
      { id: 'chats', href: 'chats.html', icon: '💬', label: 'Чаты' },
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

    nav.innerHTML = items.map(item => `
      <a href="${item.href}" class="mobile-bottom-nav__item${active === item.id ? ' mobile-bottom-nav__item--active' : ''}">
        <span class="mobile-bottom-nav__icon" aria-hidden="true">${item.icon}</span>
        <span class="mobile-bottom-nav__label">${item.label}</span>
      </a>`).join('');

    document.body.classList.add('has-mobile-nav');
  }

  function mountCompactHeader() {
    if (!isMobile()) {
      document.body.classList.remove('mobile-shell');
      document.querySelectorAll('.mobile-header-status, .mobile-header-more, .mobile-header-menu').forEach(el => el.remove());
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
    if (!header || header.querySelector('.mobile-header-status')) return;

    const user = App.getCurrentUser();
    const sub = getSubscriptionInfo(user);
    const nav = header.querySelector('.nav');
    const actions = header.querySelector('.header__actions');
    const burger = header.querySelector('.burger');
    if (nav) nav.hidden = true;
    if (actions) actions.hidden = true;
    if (burger) burger.hidden = true;

    const statusEl = document.createElement('div');
    statusEl.className = 'mobile-header-status m-status--' + sub.tone;
    statusEl.textContent = sub.short;

    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'mobile-header-more';
    moreBtn.setAttribute('aria-label', 'Ещё');
    moreBtn.textContent = '⋯';

    const menu = document.createElement('div');
    menu.className = 'mobile-header-menu';
    menu.hidden = true;
    menu.innerHTML = buildMoreMenu(user);

    moreBtn.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', e => {
      if (!menu.contains(e.target) && e.target !== moreBtn) menu.hidden = true;
    });

    header.appendChild(statusEl);
    header.appendChild(moreBtn);
    header.appendChild(menu);

    menu.querySelector('[data-action="logout"]')?.addEventListener('click', async () => {
      await App.logout();
      window.location.href = 'index.html';
    });
    menu.querySelector('[data-action="notifications"]')?.addEventListener('click', () => {
      menu.hidden = true;
      if (typeof UI !== 'undefined' && UI.showNotifications) UI.showNotifications();
    });
    menu.querySelector('[data-action="theme"]')?.addEventListener('click', () => {
      UI.toggleTheme();
      menu.hidden = true;
    });
  }

  function buildMoreMenu(user) {
    if (!user) {
      return `
        <a href="${App.getLoginUrl()}" class="mobile-header-menu__link">Войти</a>
        <a href="login.html?tab=register" class="mobile-header-menu__link">Регистрация</a>`;
    }
    let html = `<button type="button" class="mobile-header-menu__link" data-action="notifications">Уведомления</button>`;
    if (user.role === 'admin') {
      html += '<a href="admin.html" class="mobile-header-menu__link">Админ-панель</a>';
    }
    html += `
      <button type="button" class="mobile-header-menu__link" data-action="theme">Тема оформления</button>
      <button type="button" class="mobile-header-menu__link mobile-header-menu__link--danger" data-action="logout">Выйти</button>`;
    return html;
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
    const msgs = App.getMessages(chatId) || [];
    if (!msgs.length) return 0;
    const last = msgs[msgs.length - 1];
    return last.userId !== user.id ? 1 : 0;
  }

  function renderChatsHub(container) {
    const user = App.getCurrentUser();
    if (!container || !user) return;

    const isPro = App.isProActive(user) || user.role === 'admin';
    const topics = isPro ? App.getProTopics(false) : [];

    function topicCard(t) {
      const count = App.getMessages(t.id).length;
      const lastMsg = count ? App.getMessages(t.id)[count - 1] : null;
      const preview = lastMsg
        ? (lastMsg.text ? lastMsg.text.slice(0, 60) : (lastMsg.files?.[0]?.name ? '📎 ' + lastMsg.files[0].name : 'Сообщение'))
        : 'Нет сообщений';
      return `
        <a href="pro.html#t=${encodeURIComponent(t.id)}" class="m-card m-card--chat m-card--pro">
          <div class="m-card__head">
            <h3 class="m-card__title">${t.pinned ? '📌 ' : ''}${UI.escapeHtml(t.title)}</h3>
            <span class="m-card__badge m-card__badge--pro">Для подписчиков</span>
            ${getUnreadCount(t.id) ? '<span class="m-card__dot" aria-label="Новые сообщения"></span>' : ''}
          </div>
          <p class="m-card__desc">${UI.escapeHtml(t.description || 'Экспертное обсуждение')}</p>
          <span class="m-card__meta-line">${count ? count + ' сообщ.' : 'Пусто'} · ${UI.escapeHtml(preview)}</span>
        </a>`;
    }

    let proCardsHtml = '';
    if (isPro) {
      if (topics.length) {
        proCardsHtml = topics.map(topicCard).join('');
      } else {
        proCardsHtml = `
          <article class="m-card m-card--empty">
            <h3 class="m-card__title">PRO-чаты</h3>
            <p class="m-card__desc">Пока нет активных PRO-чатов. Администратор добавит темы в ближайшее время.</p>
          </article>`;
      }
    } else {
      proCardsHtml = `
        <article class="m-card m-card--locked">
          <div class="m-card__head">
            <h3 class="m-card__title">PRO-чаты</h3>
            <span class="m-card__badge m-card__badge--pro">Для подписчиков</span>
          </div>
          <p class="m-card__desc">Экспертные обсуждения и закрытые разделы для подписчиков</p>
          <p class="m-card__lock-text">Доступ открыт для подписчиков PRO</p>
          <a href="pro-request.html" class="btn btn--pro btn--block m-card__cta">Оформить доступ</a>
        </article>`;
    }

    const dmChatId = App.getAdminDmChatId(user.id);

    container.innerHTML = `
      <div class="m-page m-page--chats">
        <h1 class="m-page__title">Чаты</h1>
        <div class="m-cards">
          <a href="chat.html" class="m-card m-card--chat">
            <div class="m-card__head">
              <h3 class="m-card__title">Общий чат</h3>
              <span class="m-card__badge">Общий</span>
              ${getUnreadCount('free') ? '<span class="m-card__dot" aria-label="Новые сообщения"></span>' : ''}
            </div>
            <p class="m-card__desc">Общение всех участников сообщества</p>
          </a>
          ${proCardsHtml}
          <a href="admin-chat.html" class="m-card m-card--chat">
            <div class="m-card__head">
              <h3 class="m-card__title">Вопрос администратору</h3>
              ${getUnreadCount(dmChatId) ? '<span class="m-card__dot" aria-label="Новые сообщения"></span>' : ''}
            </div>
            <p class="m-card__desc">Личное обращение по доступу, оплате или вопросам работы сообщества</p>
          </a>
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
    currentPage
  };
})();

/**
 * Общий UI: шапка, авторизация, уведомления
 */
const UI = (function () {
  function initHeader(activePage) {
    const user = App.getCurrentUser();
    const header = document.querySelector('.header__inner');
    if (!header) return;

    const navLinks = [
      { href: 'index.html', label: 'Главная', id: 'home' },
      { href: 'chat.html', label: 'Общий чат', id: 'chat' }
    ];

    if (user && App.isProActive(user)) {
      navLinks.push({ href: 'pro.html', label: 'PRO-раздел', id: 'pro' });
    } else if (user) {
      navLinks.push({ href: 'pro-request.html', label: 'Оформить PRO', id: 'pro-request' });
    } else {
      navLinks.push({ href: 'pro-request.html', label: 'PRO-доступ', id: 'pro-request' });
    }

    if (user && user.role === 'admin') {
      navLinks.push({ href: 'admin.html', label: 'Админ-панель', id: 'admin' });
    }

    const navHtml = navLinks.map(l =>
      `<a href="${l.href}" class="nav__link${activePage === l.id ? ' nav__link--active' : ''}">${l.label}</a>`
    ).join('');

    let actionsHtml;
    if (user) {
      const status = App.getSubscriptionStatus(user);
      const badge = status === 'pro' || status === 'admin'
        ? '<span class="user-badge user-badge--pro">PRO</span>'
        : status === 'expired'
          ? '<span class="user-badge user-badge--expired">PRO истёк</span>'
          : '<span class="user-badge">Free</span>';
      actionsHtml = `
        <div class="user-menu">
          ${badge}
          <span class="user-menu__email">${user.email}</span>
          <button type="button" class="btn btn--ghost btn--sm" id="btn-notifications" title="Уведомления">🔔</button>
          <button type="button" class="btn btn--ghost btn--sm" id="btn-logout">Выйти</button>
        </div>`;
    } else {
      actionsHtml = `
        <a href="index.html#login" class="btn btn--ghost">Войти</a>
        <a href="index.html#register" class="btn btn--primary">Зарегистрироваться</a>`;
    }

    const logo = header.querySelector('.logo');
    if (logo) logo.href = 'index.html';

    const nav = header.querySelector('.nav');
    const actions = header.querySelector('.header__actions');
    if (nav) nav.innerHTML = navHtml;
    if (actions) actions.innerHTML = actionsHtml;

    document.getElementById('btn-logout')?.addEventListener('click', () => {
      App.logout();
      window.location.href = 'index.html';
    });

    document.getElementById('btn-notifications')?.addEventListener('click', showNotifications);

    initBurger();
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
    const notes = App.getNotifications(user.id);
    if (!notes.length) {
      alert('Нет новых уведомлений.');
      return;
    }
    alert(notes.slice(0, 10).map(n =>
      App.formatDateTime(n.createdAt) + '\n' + n.text
    ).join('\n\n---\n\n'));
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
    loginForm?.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(loginForm);
      const result = App.login(fd.get('email'), fd.get('password'));
      if (result.ok) {
        document.getElementById('login').close();
        if (result.user.role === 'admin') {
          window.location.href = 'admin.html';
        } else {
          window.location.reload();
        }
      } else {
        alert(result.error);
      }
    });

    const regForm = document.querySelector('#register form');
    regForm?.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(regForm);
      if (fd.get('password') !== fd.get('password_confirm')) {
        alert('Пароли не совпадают');
        return;
      }
      const result = App.register(fd.get('email'), fd.get('password'));
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

    const actions = (isOwn || isAdmin) ? `
      <div class="msg__actions">
        ${isOwn && msg.text ? `<button type="button" class="msg__btn" data-action="edit" data-id="${msg.id}">Изменить</button>` : ''}
        <button type="button" class="msg__btn msg__btn--danger" data-action="delete" data-id="${msg.id}">Удалить</button>
        ${isAdmin ? `<button type="button" class="msg__btn" data-action="pin" data-id="${msg.id}">${msg.pinned ? 'Открепить' : 'Закрепить'}</button>` : ''}
        <button type="button" class="msg__btn" data-action="reply" data-id="${msg.id}">Ответить</button>
      </div>` : `<div class="msg__actions">
        <button type="button" class="msg__btn" data-action="reply" data-id="${msg.id}">Ответить</button>
      </div>`;

    return `
      <article class="msg${msg.pinned ? ' msg--pinned' : ''}" data-id="${msg.id}">
        ${msg.pinned ? '<span class="msg__pin-label">Закреплено</span>' : ''}
        <header class="msg__header">
          <strong class="msg__author">${escapeAttr(msg.authorEmail)}</strong>
          <time class="msg__time">${App.formatDateTime(msg.createdAt)}${msg.editedAt ? ' (ред.)' : ''}</time>
        </header>
        ${reply ? `<div class="msg__reply">↩ ${escapeAttr(reply.authorEmail)}: ${escapeHtml(replyLabel)}${replyLabel.length >= 80 ? '…' : ''}</div>` : ''}
        ${textHtml}
        ${filesHtml}
        ${currentUser ? actions : ''}
      </article>`;
  }

  async function renderMessages(container, msgs, currentUser, chatId, emptyText) {
    if (!msgs.length) {
      container.innerHTML = '<p class="chat-empty">' + (emptyText || 'Нет сообщений') + '</p>';
      return;
    }
    const pinned = msgs.filter(m => m.pinned);
    const regular = msgs.filter(m => !m.pinned);
    const sorted = [...pinned, ...regular];
    const hydrated = await Promise.all(sorted.map(m => App.hydrateMessageFiles(m)));
    container.innerHTML = hydrated.map(m => renderMessage(m, currentUser, chatId, msgs)).join('');
    container.scrollTop = container.scrollHeight;
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
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const chatId = typeof chatIdOrFn === 'function' ? chatIdOrFn() : chatIdOrFn;
      if (!chatId) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const msgs = App.getMessages(chatId);
      const msg = msgs.find(m => m.id === id);
      if (!msg) return;

      if (action === 'delete') {
        if (confirm('Удалить сообщение?')) {
          App.deleteMessage(chatId, id);
          onUpdate();
        }
      } else if (action === 'edit') {
        const newText = prompt('Редактировать сообщение:', msg.text);
        if (newText !== null && newText.trim()) {
          App.editMessage(chatId, id, currentUser.id, newText);
          onUpdate();
        }
      } else if (action === 'pin') {
        App.pinMessage(chatId, id, !msg.pinned);
        onUpdate();
      } else if (action === 'reply') {
        container.dispatchEvent(new CustomEvent('reply-to', {
          detail: { id, author: msg.authorEmail, text: msg.text, files: msg.files }
        }));
      }
    });
  }

  return { initHeader, initAuthForms, renderMessage, renderMessages, bindMessageActions, escapeHtml };
})();

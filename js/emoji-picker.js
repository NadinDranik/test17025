/**
 * Пикер эмодзи для чатов: вставка в текст или мгновенная отправка.
 */
const EmojiPicker = (function () {
  const RECENT_KEY = 'gost-emoji-recent';
  const MAX_RECENT = 24;

  const CATEGORIES = [
    { id: 'recent', icon: '🕐', title: 'Недавние' },
    { id: 'popular', icon: '⭐', title: 'Популярные' },
    { id: 'smileys', icon: '😀', title: 'Смайлы и люди' },
    { id: 'gestures', icon: '👋', title: 'Жесты' },
    { id: 'symbols', icon: '❤️', title: 'Символы' },
    { id: 'objects', icon: '📎', title: 'Предметы' }
  ];

  const EMOJIS = {
    popular: [
      '❤️', '👍', '🔥', '✅', '❗', '‼️', '📌', '⚡', '💋', '🤝', '👌', '👆',
      '😂', '😢', '😡', '🤔', '🙏', '👏', '🎉', '💯', '✨', '🚀', '⭐', '💪'
    ],
    smileys: [
      '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊',
      '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜',
      '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶',
      '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷',
      '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳',
      '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺',
      '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓',
      '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '👻', '💀', '☠️', '🤡', '👹'
    ],
    gestures: [
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘',
      '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛',
      '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '💪', '🦾', '🦿', '🦵', '🦶'
    ],
    symbols: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕',
      '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️',
      '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌',
      '❗', '❕', '❓', '❔', '‼️', '⁉️', '💢', '♨️', '💥', '💫', '💦', '💨',
      '✅', '☑️', '✔️', '❌', '❎', '➕', '➖', '➗', '✖️', '♾️', '💯', '🔴'
    ],
    objects: [
      '📎', '📁', '📂', '📄', '📝', '📋', '📊', '📈', '📉', '📌', '📍', '🔖',
      '🏷️', '💼', '📧', '📨', '📩', '📤', '📥', '📦', '📫', '🔔', '🔕', '📢',
      '📣', '💬', '💭', '🗯️', '🔍', '🔎', '🔒', '🔓', '🔑', '🛠️', '⚙️', '🔧',
      '💡', '🔋', '🔌', '💻', '🖥️', '📱', '☎️', '📞', '📷', '📸', '🎥', '🎬'
    ]
  };

  let panelEl = null;
  let activeBtn = null;
  let activeForm = null;
  let activeCategory = 'popular';
  let sendMode = false;

  function loadRecent() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.slice(0, MAX_RECENT) : [];
    } catch {
      return [];
    }
  }

  function saveRecent(emoji) {
    const list = loadRecent().filter(e => e !== emoji);
    list.unshift(emoji);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
    } catch { /* ignore */ }
  }

  function getCategoryEmojis(id) {
    if (id === 'recent') {
      const recent = loadRecent();
      return recent.length ? recent : EMOJIS.popular.slice(0, 16);
    }
    return EMOJIS[id] || [];
  }

  function ensurePanel() {
    if (panelEl) return panelEl;
    panelEl = document.createElement('div');
    panelEl.id = 'emoji-picker-panel';
    panelEl.className = 'emoji-picker';
    panelEl.hidden = true;
    panelEl.innerHTML = `
      <div class="emoji-picker__toolbar">
        <div class="emoji-picker__modes">
          <button type="button" class="emoji-picker__mode emoji-picker__mode--active" data-mode="insert">Вставить</button>
          <button type="button" class="emoji-picker__mode" data-mode="send">Отправить</button>
        </div>
      </div>
      <div class="emoji-picker__tabs" role="tablist"></div>
      <div class="emoji-picker__title"></div>
      <div class="emoji-picker__grid" role="grid"></div>`;
    document.body.appendChild(panelEl);

    panelEl.querySelector('.emoji-picker__modes').addEventListener('click', e => {
      const btn = e.target.closest('[data-mode]');
      if (!btn) return;
      sendMode = btn.dataset.mode === 'send';
      panelEl.querySelectorAll('.emoji-picker__mode').forEach(b => {
        b.classList.toggle('emoji-picker__mode--active', b === btn);
      });
    });

    panelEl.querySelector('.emoji-picker__tabs').addEventListener('click', e => {
      const tab = e.target.closest('[data-cat]');
      if (!tab) return;
      activeCategory = tab.dataset.cat;
      renderGrid();
    });

    panelEl.querySelector('.emoji-picker__grid').addEventListener('click', e => {
      const item = e.target.closest('[data-emoji]');
      if (!item) return;
      pick(item.dataset.emoji);
    });

    document.addEventListener('click', e => {
      if (panelEl.hidden) return;
      if (e.target.closest('.emoji-picker') || e.target.closest('.chat-form__emoji')) return;
      close();
    });

    window.addEventListener('resize', () => {
      if (!panelEl.hidden && activeBtn) positionPanel(activeBtn);
    });

    return panelEl;
  }

  function renderTabs() {
    const tabs = panelEl.querySelector('.emoji-picker__tabs');
    tabs.innerHTML = CATEGORIES.map(cat => `
      <button type="button" class="emoji-picker__tab${cat.id === activeCategory ? ' emoji-picker__tab--active' : ''}"
        data-cat="${cat.id}" title="${cat.title}" aria-label="${cat.title}">${cat.icon}</button>
    `).join('');
  }

  function renderGrid() {
    renderTabs();
    const emojis = getCategoryEmojis(activeCategory);
    const cat = CATEGORIES.find(c => c.id === activeCategory);
    panelEl.querySelector('.emoji-picker__title').textContent = cat ? cat.title : '';
    panelEl.querySelector('.emoji-picker__grid').innerHTML = emojis.map(e =>
      `<button type="button" class="emoji-picker__item" data-emoji="${e}" aria-label="${e}">${e}</button>`
    ).join('');
  }

  function positionPanel(anchor) {
    const rect = anchor.getBoundingClientRect();
    const panelH = panelEl.offsetHeight || 280;
    const panelW = panelEl.offsetWidth || 320;
    let top = rect.top - panelH - 8;
    if (top < 8) top = rect.bottom + 8;
    let left = rect.left;
    if (left + panelW > window.innerWidth - 8) {
      left = window.innerWidth - panelW - 8;
    }
    left = Math.max(8, left);
    panelEl.style.top = `${top + window.scrollY}px`;
    panelEl.style.left = `${left + window.scrollX}px`;
  }

  function insertAtCursor(textarea, text) {
    if (!textarea) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    textarea.value = before + text + after;
    const pos = start + text.length;
    textarea.selectionStart = textarea.selectionEnd = pos;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
  }

  async function sendEmoji(emoji) {
    const form = activeForm;
    if (!form || !form._getChatId) return;
    const user = App.getCurrentUser();
    const chatId = typeof form._getChatId === 'function' ? form._getChatId() : form._getChatId;
    if (!user || !chatId) return;
    const result = await App.addMessage(chatId, user.id, emoji, form._replyTo || null, []);
    if (!result.ok) {
      alert(result.error || 'Не удалось отправить');
      return;
    }
    form._replyTo = null;
    const replyPreview = form.closest('.chat-compose')?.querySelector('#reply-preview, .reply-preview');
    if (replyPreview) replyPreview.hidden = true;
    close();
  }

  function pick(emoji) {
    if (!emoji) return;
    saveRecent(emoji);
    if (sendMode) {
      sendEmoji(emoji);
      return;
    }
    const input = activeForm?.querySelector('.chat-form__input, #msg-text');
    insertAtCursor(input, emoji);
    if (activeCategory === 'recent') renderGrid();
  }

  function open(btn, form) {
    ensurePanel();
    if (!panelEl.hidden && activeBtn === btn) {
      close();
      return;
    }
    activeBtn = btn;
    activeForm = form;
    activeCategory = loadRecent().length ? 'recent' : 'popular';
    sendMode = false;
    panelEl.querySelectorAll('.emoji-picker__mode').forEach(b => {
      b.classList.toggle('emoji-picker__mode--active', b.dataset.mode === 'insert');
    });
    renderGrid();
    panelEl.hidden = false;
    positionPanel(btn);
  }

  function close() {
    if (panelEl) panelEl.hidden = true;
    activeBtn = null;
    activeForm = null;
  }

  function bindFormBar(bar) {
    let btn = bar.querySelector('.chat-form__emoji');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-form__emoji';
      btn.setAttribute('aria-label', 'Смайлы');
      btn.textContent = '😊';
      bar.insertBefore(btn, bar.firstChild);
    }
    if (btn._emojiBound) return;
    btn._emojiBound = true;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const form = bar.closest('form');
      if (form) open(btn, form);
    });
  }

  function init() {
    document.querySelectorAll('.chat-form__bar').forEach(bindFormBar);
    document.querySelectorAll('.chat-form__input').forEach(input => {
      if (input.placeholder === 'Сообщение…' || input.placeholder === 'Сообщение...') {
        input.placeholder = 'Сообщение';
      }
    });
  }

  function isEmojiOnlyText(text) {
    if (!text) return false;
    const t = text.trim();
    if (!t || t.length > 12) return false;
    return !/[^\s\p{Emoji}\p{Emoji_Presentation}\p{Extended_Pictographic}\u200d\ufe0f]/u.test(t);
  }

  return { init, bindFormBar, open, close, isEmojiOnly: isEmojiOnlyText };
})();

/**
 * Отправка сообщений в чат
 */
const ChatSend = (function () {
  const FILE_ACCEPT = App.ALLOWED_EXT.map(e => '.' + e).join(',');
  const SEND_ICON = '<svg class="chat-form__send-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';

  function setSubmitState(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading ? '…' : SEND_ICON;
  }

  function bindForm(form, getChatId, getUser, onSuccess, onError) {
    form._getChatId = getChatId;
    const textEl = form.querySelector('[id="msg-text"], .chat-form__input');
    const fileEl = form.querySelector('#msg-files, [type="file"]');
    const fileNamesEl = form.querySelector('#file-names, .file-upload__hint, .chat-form__files');
    const submitBtn = form.querySelector('[type="submit"]');

    if (textEl) {
      const maxInputHeight = () => {
        const fromCss = parseInt(getComputedStyle(textEl).maxHeight, 10);
        return Number.isFinite(fromCss) && fromCss > 0 ? fromCss : 128;
      };
      const resize = () => {
        textEl.style.height = 'auto';
        textEl.style.height = Math.min(textEl.scrollHeight, maxInputHeight()) + 'px';
      };
      textEl.addEventListener('input', resize);
      resize();
    }

    if (fileEl) {
      fileEl.setAttribute('accept', FILE_ACCEPT);
      fileEl.addEventListener('change', () => {
        if (!fileNamesEl) return;
        const list = Array.from(fileEl.files);
        fileNamesEl.textContent = list.length
          ? list.map(f => f.name + ' (' + App.formatFileSize(f.size) + ')').join(', ')
          : '';
      });
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const user = getUser();
      const chatId = getChatId();
      if (!chatId) return;

      const text = textEl ? textEl.value : '';
      const hasFiles = fileEl && fileEl.files && fileEl.files.length > 0;

      if (!text.trim() && !hasFiles) {
        showError(onError, 'Введите текст или прикрепите файл');
        return;
      }

      if (!user) {
        if (chatId !== 'free') {
          showError(onError, 'Войдите, чтобы писать в этот чат');
          return;
        }
        const guestNameEl = form.querySelector('#guest-name');
        const guestName = guestNameEl ? guestNameEl.value : App.getGuestName();
        if (!text.trim()) {
          showError(onError, 'Введите текст сообщения');
          return;
        }
        setSubmitState(submitBtn, true);
        const result = await App.addGuestMessage(chatId, text, form._replyTo || null, guestName);
        setSubmitState(submitBtn, false);
        if (!result.ok) {
          showError(onError, result.error);
          return;
        }
        form.reset();
        if (guestNameEl && guestName) guestNameEl.value = guestName;
        if (textEl) textEl.style.height = 'auto';
        form._replyTo = null;
        const replyPreview = form.closest('.chat-compose')?.querySelector('#reply-preview, .reply-preview');
        if (replyPreview) replyPreview.hidden = true;
        if (onSuccess) onSuccess(result.msg);
        return;
      }

      let attachments = [];
      if (hasFiles) {
        setSubmitState(submitBtn, true);
        const readResult = await App.readFilesAsAttachments(fileEl.files);
        setSubmitState(submitBtn, false);
        if (!readResult.ok) {
          showError(onError, readResult.error);
          return;
        }
        attachments = readResult.files;
        if (readResult.warnings && readResult.warnings.length) {
          alert('Часть файлов не прикреплена:\n' + readResult.warnings.join('\n'));
        }
      }

      setSubmitState(submitBtn, true);

      const result = await App.addMessage(chatId, user.id, text, form._replyTo || null, attachments);

      setSubmitState(submitBtn, false);

      if (!result.ok) {
        showError(onError, result.error);
        return;
      }

      form.reset();
      if (fileNamesEl) fileNamesEl.textContent = '';
      if (textEl) {
        textEl.style.height = 'auto';
      }
      form._replyTo = null;
      const replyPreview = form.closest('.chat-compose')?.querySelector('#reply-preview, .reply-preview');
      if (replyPreview) replyPreview.hidden = true;

      if (onSuccess) onSuccess(result.msg);
    });
  }

  function showError(onError, msg) {
    if (typeof onError === 'function') {
      onError(msg);
    } else {
      alert(msg);
    }
  }

  function getReplyLabel(msg) {
    if (msg.text) return msg.text.slice(0, 60);
    if (msg.files && msg.files.length) return '📎 ' + msg.files[0].name;
    return '(сообщение)';
  }

  return { bindForm, getReplyLabel, FILE_ACCEPT };
})();

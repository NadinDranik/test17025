/**
 * Отправка сообщений в чат
 */
const ChatSend = (function () {
  const FILE_ACCEPT = App.ALLOWED_EXT.map(e => '.' + e).join(',');

  function bindForm(form, getChatId, getUser, onSuccess, onError) {
    const textEl = form.querySelector('[id="msg-text"], .chat-form__input');
    const fileEl = form.querySelector('#msg-files, [type="file"]');
    const fileNamesEl = form.querySelector('#file-names, .file-upload__hint');
    const submitBtn = form.querySelector('[type="submit"]');

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
      if (!user || !chatId) return;

      const text = textEl ? textEl.value : '';
      const hasFiles = fileEl && fileEl.files && fileEl.files.length > 0;

      if (!text.trim() && !hasFiles) {
        showError(onError, 'Введите текст или прикрепите файл');
        return;
      }

      let attachments = [];
      if (hasFiles) {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Загрузка…';
        }
        const readResult = await App.readFilesAsAttachments(fileEl.files);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.dataset.label || 'Отправить';
        }
        if (!readResult.ok) {
          showError(onError, readResult.error);
          return;
        }
        attachments = readResult.files;
        if (readResult.warnings && readResult.warnings.length) {
          alert('Часть файлов не прикреплена:\n' + readResult.warnings.join('\n'));
        }
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Отправка…';
      }

      const result = await App.addMessage(chatId, user.id, text, form._replyTo || null, attachments);

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.label || 'Отправить';
      }

      if (!result.ok) {
        showError(onError, result.error);
        return;
      }

      form.reset();
      if (fileNamesEl) fileNamesEl.textContent = '';
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

/**
 * TextType — эффект печатающегося текста (порт React Bits для vanilla JS + GSAP).
 */
(function (global) {
  function TextType(container, options) {
    if (!container) return;

    this.container = container;
    this.options = Object.assign({
      text: [],
      typingSpeed: 50,
      initialDelay: 0,
      pauseDuration: 2000,
      deletingSpeed: 30,
      loop: true,
      showCursor: true,
      hideCursorWhileTyping: false,
      cursorCharacter: '|',
      cursorBlinkDuration: 0.5,
      textColors: [],
      variableSpeed: null,
      startOnVisible: false,
      reverseMode: false,
      onSentenceComplete: null
    }, options);

    this.textArray = Array.isArray(this.options.text)
      ? this.options.text.filter(Boolean)
      : [String(this.options.text || '')];

    if (!this.textArray.length) return;

    this.displayedText = '';
    this.currentCharIndex = 0;
    this.isDeleting = false;
    this.currentTextIndex = 0;
    this.isVisible = !this.options.startOnVisible;
    this.timeoutId = null;
    this.cursorTween = null;

    this.contentEl = container.querySelector('.text-type__content');
    this.cursorEl = container.querySelector('.text-type__cursor');
    this.lineEl = container.querySelector('.text-type__line');

    if (!this.lineEl) {
      this.lineEl = document.createElement('span');
      this.lineEl.className = 'text-type__line';
      container.appendChild(this.lineEl);
    }

    if (!this.contentEl) {
      this.contentEl = document.createElement('span');
      this.contentEl.className = 'text-type__content';
      this.lineEl.appendChild(this.contentEl);
    }

    if (this.options.showCursor && !this.cursorEl) {
      this.cursorEl = document.createElement('span');
      this.cursorEl.className = 'text-type__cursor text-type__cursor--bar';
      this.cursorEl.setAttribute('aria-hidden', 'true');
      this.lineEl.appendChild(this.cursorEl);
    } else if (this.cursorEl) {
      if (this.options.cursorCharacter && !this.cursorEl.classList.contains('text-type__cursor--bar')) {
        this.cursorEl.textContent = this.options.cursorCharacter;
      }
      this.lineEl.appendChild(this.cursorEl);
    }

    this.bindVisibility();
    this.initCursor();
    this.displayedText = '';
    this.contentEl.textContent = '';
    this.tick();
  }

  TextType.prototype.getRandomSpeed = function () {
    var vs = this.options.variableSpeed;
    if (!vs) return this.options.typingSpeed;
    return Math.random() * (vs.max - vs.min) + vs.min;
  };

  TextType.prototype.getCurrentTextColor = function () {
    var colors = this.options.textColors;
    if (!colors.length) return '';
    return colors[this.currentTextIndex % colors.length];
  };

  TextType.prototype.bindVisibility = function () {
    var self = this;
    if (!this.options.startOnVisible) return;

    if (typeof IntersectionObserver === 'undefined') {
      this.isVisible = true;
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          self.isVisible = true;
          self.tick();
          observer.disconnect();
        }
      });
    }, { threshold: 0.1 });

    observer.observe(this.container);
  };

  TextType.prototype.initCursor = function () {
    if (!this.options.showCursor || !this.cursorEl || typeof gsap === 'undefined') return;
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    gsap.set(this.cursorEl, { opacity: 1 });
    this.cursorTween = gsap.to(this.cursorEl, {
      opacity: 0,
      duration: this.options.cursorBlinkDuration,
      repeat: -1,
      yoyo: true,
      ease: 'power2.inOut'
    });
  };

  TextType.prototype.getProcessedText = function (text) {
    return this.options.reverseMode ? text.split('').reverse().join('') : text;
  };

  TextType.prototype.updateDom = function () {
    this.contentEl.textContent = this.displayedText;
    var color = this.getCurrentTextColor();
    this.contentEl.style.color = color || '';

    if (this.cursorEl && this.lineEl) {
      this.lineEl.appendChild(this.cursorEl);
    }

    if (!this.cursorEl) return;
    var currentText = this.textArray[this.currentTextIndex] || '';
    var shouldHide = this.options.hideCursorWhileTyping
      && (this.currentCharIndex < currentText.length || this.isDeleting);
    this.cursorEl.classList.toggle('text-type__cursor--hidden', shouldHide);
  };

  TextType.prototype.schedule = function (fn, delay) {
    var self = this;
    this.timeoutId = global.setTimeout(function () {
      self.timeoutId = null;
      fn();
    }, delay);
  };

  TextType.prototype.tick = function () {
  var self = this;
    if (!this.isVisible) return;

    var currentText = this.textArray[this.currentTextIndex];
    var processedText = this.getProcessedText(currentText);

    var run = function () {
      if (self.isDeleting) {
        if (self.displayedText === '') {
          self.isDeleting = false;
          if (self.currentTextIndex === self.textArray.length - 1 && !self.options.loop) {
            self.updateDom();
            return;
          }
          if (typeof self.options.onSentenceComplete === 'function') {
            self.options.onSentenceComplete(self.textArray[self.currentTextIndex], self.currentTextIndex);
          }
          self.currentTextIndex = (self.currentTextIndex + 1) % self.textArray.length;
          self.currentCharIndex = 0;
          self.schedule(function () {
            self.tick();
          }, self.options.pauseDuration);
        } else {
          self.schedule(function () {
            self.displayedText = self.displayedText.slice(0, -1);
            self.updateDom();
            self.tick();
          }, self.options.deletingSpeed);
        }
        return;
      }

      if (self.currentCharIndex < processedText.length) {
        var delay = self.options.variableSpeed
          ? self.getRandomSpeed()
          : self.options.typingSpeed;
        self.schedule(function () {
          self.displayedText += processedText.charAt(self.currentCharIndex);
          self.currentCharIndex += 1;
          self.updateDom();
          self.tick();
        }, delay);
        return;
      }

      if (self.textArray.length >= 1) {
        if (!self.options.loop && self.currentTextIndex === self.textArray.length - 1) return;
        self.schedule(function () {
          self.isDeleting = true;
          self.tick();
        }, self.options.pauseDuration);
      }
    };

    if (this.currentCharIndex === 0 && !this.isDeleting && this.displayedText === '') {
      this.schedule(run, this.options.initialDelay);
    } else {
      run();
    }
  };

  TextType.prototype.destroy = function () {
    if (this.timeoutId) global.clearTimeout(this.timeoutId);
    if (this.cursorTween) this.cursorTween.kill();
  };

  TextType.mount = function (selector, options) {
    var el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return null;
    return new TextType(el, options);
  };

  global.TextType = TextType;
})(window);

(() => {
  if (window.__englishPronunciationFaLoaded) return;
  window.__englishPronunciationFaLoaded = true;

  const WORD_RE = /^\p{Script=Latin}[\p{Script=Latin}'-]{0,39}$/u;
  const TOKEN_RE = /\p{Script=Latin}+(?:['-]\p{Script=Latin}+)*/gu;
  const MAX_SENTENCE_WORDS = 50;
  const MAX_SENTENCE_CHARS = 450;
  const BRAND = { en: 'تلفظ انگلیسی', fr: 'تلفظ فرانسوی' };
  const TTS_LANG = { us: 'en-US', uk: 'en-GB', fr: 'fr-FR' };
  const NOTE_WORD = 'تلفظ فارسی تقریبی است؛ برای یادگیری دقیق، صدا را هم گوش کنید.';
  const NOTE_SENTENCE = 'تلفظ جمله کلمه‌به‌کلمه است و وصل‌شدن آواها را نشان نمی‌دهد؛ برای تلفظ طبیعی صدا را گوش کنید.';

  let host;
  let tooltip;
  let styleReady;
  let requestToken = 0;
  let enabled = true;
  let sentencesEnabled = true;
  let showWord = true;
  let lastMouse = { x: 0, y: 0 };
  let anchorRange = null;
  let anchorPoint = null;
  let repositionQueued = false;

  chrome.storage.sync.get({ enabled: true, sentences: true, showWord: true }, data => {
    enabled = data.enabled;
    sentencesEnabled = data.sentences;
    showWord = data.showWord;
    applyWordVisibility();
  });
  chrome.storage.onChanged.addListener(changes => {
    if (changes.enabled) {
      enabled = changes.enabled.newValue;
      if (!enabled) hideTooltip();
    }
    if (changes.sentences) sentencesEnabled = changes.sentences.newValue;
    if (changes.showWord) {
      showWord = changes.showWord.newValue;
      applyWordVisibility();
    }
  });
  const font = new FontFace('IRANSans', `url(${chrome.runtime.getURL('fonts/IranSans.woff2')})`);
  font.load().then(face => document.fonts.add(face)).catch(() => { });

  function createTooltip() {
    if (tooltip) return tooltip;
    host = document.createElement('div');
    host.id = 'epf-host';
    host.style.cssText = 'all: initial;';
    const root = host.attachShadow({ mode: 'closed' });

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('styles.css');
    styleReady = new Promise(resolve => {
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
    });
    root.appendChild(link);

    const extraStyle = document.createElement('style');
    extraStyle.textContent = `
      .epf-tools { display: inline-flex; align-items: center; gap: 4px; }
      .epf-eye { all: unset; cursor: pointer; font-size: 13px; line-height: 1; padding: 2px 4px; opacity: .9; }
      .epf-eye[aria-pressed="false"] { opacity: .35; }`;
    root.appendChild(extraStyle);

    tooltip = document.createElement('div');
    tooltip.id = 'epf-tooltip';
    tooltip.setAttribute('dir', 'rtl');
    tooltip.innerHTML = `
      <div class="epf-head"><span class="epf-brand">تلفظ</span><span class="epf-tools"><button class="epf-eye" aria-pressed="true">👁</button><button class="epf-close" aria-label="بستن">×</button></span></div>
      <div class="epf-word"></div>
      <div class="epf-pronunciation"></div>
      <div class="epf-ipa"></div>
      <div class="epf-meaning"></div>
      <div class="epf-definition"></div>
      <div class="epf-actions" hidden>
        <button data-audio="us">🔊 آمریکایی</button>
        <button data-audio="uk">🔊 بریتانیایی</button>
        <button data-audio="fr">🔊 فرانسوی</button>
        <button data-audio="slow">🐢 آهسته</button>
      </div>
      <div class="epf-note"></div>
      <div class="epf-status"></div>`;
    root.appendChild(tooltip);
    document.documentElement.appendChild(host);

    tooltip.addEventListener('mousedown', event => event.stopPropagation());
    tooltip.addEventListener('contextmenu', event => event.stopPropagation());
    tooltip.querySelector('.epf-close').addEventListener('click', hideTooltip);
    tooltip.querySelector('.epf-eye').addEventListener('click', toggleWord);
    tooltip.querySelectorAll('[data-audio]').forEach(button =>
      button.addEventListener('click', () => playAudio(button.dataset.audio))
    );
    applyWordVisibility();
    return tooltip;
  }

  function applyWordVisibility() {
    if (!tooltip) return;
    tooltip.querySelector('.epf-word').style.display = showWord ? '' : 'none';
    const eye = tooltip.querySelector('.epf-eye');
    eye.setAttribute('aria-pressed', String(showWord));
    eye.title = showWord ? 'مخفی کردن متن انتخاب‌شده' : 'نمایش متن انتخاب‌شده';
    if (isTooltipVisible()) positionTooltip();
  }

  function toggleWord() {
    showWord = !showWord;
    chrome.storage.sync.set({ showWord });
    applyWordVisibility();
  }

  function isEditableNode(node) {
    const el = node && (node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
    return !!(el && el.closest && el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));
  }

  function isEditing() {
    const active = document.activeElement;
    return !!(active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)));
  }

  function getSelectedText() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return null;
    const text = selection.toString().replace(/\s+/g, ' ').trim().replace(/[’‘ʼ]/g, "'");
    if (!text || text.length > MAX_SENTENCE_CHARS) return null;

    const anchor = selection.anchorNode;
    if (isEditing() || isEditableNode(anchor)) return null;
    const parent = anchor && (anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor);
    if (parent && parent.closest && parent.closest('#epf-host')) return null;

    const bare = text.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (WORD_RE.test(bare)) return { text: bare, kind: 'word' };
    if (!sentencesEnabled) return null;

    const tokens = text.match(TOKEN_RE) || [];
    if (tokens.length < 2 || tokens.length > MAX_SENTENCE_WORDS) return null;
    const compact = text.replace(/\s/g, '');
    const latin = (compact.match(/\p{Script=Latin}/gu) || []).length;
    if (latin / compact.length < 0.7) return null;
    return { text, kind: 'sentence' };
  }

  function captureAnchor() {
    const selection = window.getSelection();
    anchorRange = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    anchorPoint = { x: lastMouse.x + window.scrollX, y: lastMouse.y + window.scrollY };
  }

  function currentRect() {
    if (anchorRange) {
      const rect = anchorRange.getBoundingClientRect();
      if (rect && (rect.width || rect.height)) return rect;
    }
    const x = anchorPoint ? anchorPoint.x - window.scrollX : lastMouse.x;
    const y = anchorPoint ? anchorPoint.y - window.scrollY : lastMouse.y;
    return { left: x, right: x, top: y, bottom: y, width: 0, height: 0 };
  }

  function handleSelection() {
    if (!enabled) return;
    const selected = getSelectedText();
    if (!selected) return;
    captureAnchor();
    showText(selected);
  }

  function isTooltipVisible() {
    return !!tooltip && tooltip.style.display === 'block';
  }

  function outsideTooltip(event) {
    if (!isTooltipVisible()) return;
    if (host && event.composedPath().includes(host)) return;
    hideTooltip();
  }

  document.addEventListener('mouseup', event => {
    if (event.button !== 0) return;
    lastMouse = { x: event.clientX, y: event.clientY };
    if (host && event.composedPath().includes(host)) return;
    setTimeout(handleSelection, 10);
  }, true);

  document.addEventListener('keyup', event => {
    if (event.key === 'Escape') { hideTooltip(); return; }
    if (event.shiftKey || event.key === 'Shift') setTimeout(handleSelection, 10);
  }, true);

  window.addEventListener('pointerdown', outsideTooltip, true);
  window.addEventListener('mousedown', outsideTooltip, true);
  window.addEventListener('contextmenu', outsideTooltip, true);
  window.addEventListener('click', event => {
    const selection = window.getSelection();
    if (selection && selection.isCollapsed) outsideTooltip(event);
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideTooltip();
  });
  window.addEventListener('blur', hideTooltip);

  function queueReposition() {
    if (repositionQueued || !isTooltipVisible()) return;
    repositionQueued = true;
    requestAnimationFrame(() => {
      repositionQueued = false;
      if (isTooltipVisible()) positionTooltip();
    });
  }

  document.addEventListener('mousemove', event => {
    lastMouse = { x: event.clientX, y: event.clientY };
  }, { passive: true, capture: true });

  document.addEventListener('scroll', queueReposition, { passive: true, capture: true });
  window.addEventListener('resize', queueReposition, { passive: true });

  function setActions(el, lang) {
    const actions = el.querySelector('.epf-actions');
    el.querySelector('[data-audio="us"]').hidden = lang !== 'en';
    el.querySelector('[data-audio="uk"]').hidden = lang !== 'en';
    el.querySelector('[data-audio="fr"]').hidden = lang !== 'fr';
    el.querySelector('[data-audio="slow"]').hidden = false;
    actions.hidden = false;
  }

  async function showText({ text, kind }) {
    if (!chrome.runtime?.id) return;
    const token = ++requestToken;
    const el = createTooltip();
    const isSentence = kind === 'sentence';

    el.querySelector('.epf-brand').textContent = 'تلفظ';
    const wordEl = el.querySelector('.epf-word');
    wordEl.textContent = text;
    wordEl.classList.toggle('epf-sentence', isSentence);
    const pronEl = el.querySelector('.epf-pronunciation');
    pronEl.textContent = isSentence ? 'در حال دریافت تلفظ جمله…' : 'در حال دریافت تلفظ فارسی…';
    pronEl.classList.toggle('epf-long', isSentence);
    el.querySelector('.epf-ipa').textContent = '';
    el.querySelector('.epf-meaning').textContent = '';
    el.querySelector('.epf-definition').textContent = '';
    el.querySelector('.epf-note').textContent = isSentence ? NOTE_SENTENCE : NOTE_WORD;
    el.querySelector('.epf-status').textContent = '';
    el.querySelector('.epf-actions').hidden = true;
    el.dataset.usAudio = '';
    el.dataset.ukAudio = '';
    el.dataset.word = text;
    el.dataset.lang = '';

    await styleReady;
    if (token !== requestToken) return;
    el.style.display = 'block';
    positionTooltip();

    try {
      const pageLang = document.documentElement.lang || '';
      const message = isSentence
        ? { type: 'LOOKUP_TEXT', text, pageLang }
        : { type: 'LOOKUP_WORD', word: text, pageLang };
      const data = await chrome.runtime.sendMessage(message);
      if (token !== requestToken) return;
      if (!data || data.error) throw new Error(data?.error || 'اطلاعاتی پیدا نشد.');

      el.dataset.lang = data.lang;
      el.querySelector('.epf-brand').textContent = BRAND[data.lang] || 'تلفظ';
      pronEl.textContent = data.persianPronunciation || 'تلفظ فارسی در دسترس نیست';
      el.querySelector('.epf-ipa').textContent = data.phonetic ? `IPA: ${data.phonetic}` : '';
      const meaningEl = el.querySelector('.epf-meaning');
      meaningEl.textContent = 'معنی: در حال دریافت…';
      setActions(el, data.lang);

      const notes = [];
      if (data.approx) {
        notes.push(isSentence
          ? `تلفظ ${data.approx} کلمه با قواعد تقریبی ساخته شده است.`
          : 'تلفظ با قواعد تقریبی ساخته شده است.');
      }
      if (isSentence && data.missing) notes.push(`تلفظ ${data.missing} کلمه پیدا نشد (داخل [ ] نمایش داده شده).`);
      const status = el.querySelector('.epf-status');
      status.textContent = notes.join(' ');
      positionTooltip();

      const extraKind = data.kind === 'sentence' ? 'sentence' : 'word';
      const extraText = extraKind === 'word' && isSentence ? data.word : text;
      let extra = null;
      try {
        extra = await chrome.runtime.sendMessage({ type: 'LOOKUP_EXTRA', kind: extraKind, lang: data.lang, text: extraText });
      } catch { }
      if (token !== requestToken) return;
      meaningEl.textContent = extra && extra.meaning ? `معنی: ${extra.meaning}` : 'معنی: در دسترس نیست (نیاز به اینترنت).';
      el.querySelector('.epf-definition').textContent = extra?.definition || '';
      el.dataset.usAudio = extra?.usAudio || '';
      el.dataset.ukAudio = extra?.ukAudio || '';
      if (extraKind === 'word' && !extra?.usAudio && !extra?.ukAudio) notes.push('فایل صوتی آماده نبود؛ از صدای مرورگر استفاده می‌شود.');
      status.textContent = notes.join(' ');
      positionTooltip();
    } catch (error) {
      if (token !== requestToken) return;
      const invalidated = /Extension context invalidated/i.test(error?.message || '');
      pronEl.textContent = invalidated
        ? 'افزونه به‌روزرسانی شد؛ صفحه را Refresh کنید.'
        : error.message;
    }
  }

  function positionTooltip() {
    const el = createTooltip();
    const rect = currentRect();
    const width = el.offsetWidth || 300;
    const height = el.offsetHeight || 220;
    let left = rect.left + 14;
    if (left + width > window.innerWidth - 8) left = rect.left - width - 14;
    left = Math.max(8, left);
    let top = rect.bottom + 18;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 18);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function playAudio(kind) {
    const el = createTooltip();
    const word = el.dataset.word;
    const lang = el.dataset.lang;
    const slow = kind === 'slow';
    const ttsLang = slow ? (lang === 'fr' ? TTS_LANG.fr : TTS_LANG.us) : (TTS_LANG[kind] || TTS_LANG.us);
    const rate = slow ? 0.6 : 1;
    const url = slow ? '' : (kind === 'uk' ? el.dataset.ukAudio : el.dataset.usAudio);
    const fallback = () => {
      if (speakText(word, ttsLang, rate, !navigator.onLine)) return;
      speakOffline(word, ttsLang, rate);
    };
    if (url && navigator.onLine) {
      const audio = new Audio(url);
      audio.play().catch(fallback);
    } else fallback();
  }

  function speakOffline(text, lang, rate) {
    const spoken = String(text || '').replace(/\(\p{Ll}{1,4}\)/gu, '');
    if (!spoken || !chrome.runtime?.id) return;
    chrome.runtime.sendMessage({ type: 'SPEAK_OFFLINE', text: spoken, lang, rate }).catch(() => { });
  }

  function pickLocalVoice(lang) {
    const base = lang.slice(0, 2);
    const voices = speechSynthesis.getVoices().filter(voice => voice.localService);
    const norm = voice => voice.lang.replace('_', '-');
    return voices.find(voice => norm(voice) === lang) || voices.find(voice => norm(voice).startsWith(base)) || null;
  }

  function speakText(text, lang, rate, localOnly = false) {
    const spoken = String(text || '').replace(/\(\p{Ll}{1,4}\)/gu, '');
    if (!spoken || !('speechSynthesis' in window)) return false;
    const voice = pickLocalVoice(lang);
    if (localOnly && !voice) return false;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = lang;
    utterance.rate = rate;
    if (voice) utterance.voice = voice;
    speechSynthesis.speak(utterance);
    return true;
  }

  if ('speechSynthesis' in window) speechSynthesis.getVoices();

  function hideTooltip() {
    requestToken++;
    anchorRange = null;
    anchorPoint = null;
    if (tooltip) tooltip.style.display = 'none';
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (chrome.runtime?.id) chrome.runtime.sendMessage({ type: 'STOP_OFFLINE' }).catch(() => { });
  }
})();
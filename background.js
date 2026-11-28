importScripts('common.js', 'en.js', 'fr.js');

const { normalizeInput, requestTranslation, readTranslation, splitMarks, faMarks } = Common;

const extraCache = new Map();
const MAX_SENTENCE_WORDS = 50;
const MAX_SENTENCE_CHARS = 450;
const TOKEN_RE = /\p{Script=Latin}+(?:['-]\p{Script=Latin}+)*/gu;
const WORD_RE = /^\p{Script=Latin}+(?:['-]\p{Script=Latin}+)*$/u;
const OPTIONAL_RE = /\(\p{Ll}{1,4}\)/gu;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handlers = {
    LOOKUP_WORD: m => lookupAuto(m.word, m.pageLang),
    LOOKUP_TEXT: m => lookupText(m.text, m.pageLang),
    LOOKUP_EXTRA: m => lookupExtra(m),
    SPEAK_OFFLINE: m => speakOffline(m),
    STOP_OFFLINE: () => stopOffline()
  };
  const handler = handlers[message?.type];
  if (!handler) return;
  handler(message)
    .then(sendResponse)
    .catch(error => sendResponse({ error: error.message || 'خطا در دریافت اطلاعات' }));
  return true;
});

async function getMode() {
  try {
    const { lang } = await chrome.storage.sync.get({ lang: 'auto' });
    return lang === 'en' || lang === 'fr' ? lang : 'auto';
  } catch {
    return 'auto';
  }
}

function detectLanguage(text, pageLang) {
  if (Engines.fr.accented.test(text)) return 'fr';
  const tokens = text.toLowerCase().match(/[a-zàâäçéèêëîïôöùûüÿœæ]+/g) || [];
  let fr = 0;
  let en = 0;
  for (const token of tokens) {
    if (Engines.fr.words.has(token)) fr++;
    if (Engines.en.words.has(token)) en++;
  }
  if (fr !== en) return fr > en ? 'fr' : 'en';
  return /^fr/i.test(pageLang || '') ? 'fr' : 'en';
}

function toPersian(ipa, lang, joiner = ' ') {
  const engine = Engines[lang];
  return ipa.trim().split(/\s+/).map(part => engine.toPersian(part)).filter(Boolean).join(joiner);
}

async function resolveToken(token, lang) {
  const engine = Engines[lang];
  const exact = await engine.lookup(token, false);
  if (exact) return { ...exact, lang };
  const accented = Engines.fr.accented.test(token);
  if (lang === 'fr' && !accented && !token.includes('-') && token.length > 2 && /^[a-z']+$/i.test(token)) {
    const english = await Engines.en.lookup(token, false);
    if (english) return { ...english, lang: 'en' };
  }
  if (lang === 'en' && accented) {
    const french = await Engines.fr.lookup(token, false);
    if (french) return { ...french, lang: 'fr' };
  }
  const guessed = await engine.lookup(token, true);
  return guessed ? { ...guessed, lang } : null;
}

async function lookupAuto(rawWord, pageLang) {
  const word = normalizeInput(rawWord);
  if (!WORD_RE.test(word) || word.length > 40) throw new Error('کلمه معتبر نیست.');
  const mode = await getMode();
  const first = mode === 'auto' ? detectLanguage(word, pageLang) : mode;
  const order = mode === 'auto' ? [first, first === 'fr' ? 'en' : 'fr'] : [mode];
  const valid = lang => Engines[lang].accepts(word);
  if (mode === 'en' && !valid('en')) throw new Error('کلمه انگلیسی معتبر نیست.');

  for (const approx of [false, true]) {
    for (const lang of order) {
      if (!valid(lang)) continue;
      if (approx && lang === 'fr' && first === 'en') continue;
      const found = await Engines[lang].lookup(word, approx);
      if (found) return buildWordResult(word, lang, found);
    }
  }
  return buildWordResult(word, order.find(valid) || 'fr', null);
}

function buildWordResult(word, lang, found) {
  const ipa = found?.ipa || '';
  const persian = ipa ? toPersian(ipa, lang, word.includes('-') ? '-' : ' ') : '';
  return {
    kind: 'word',
    lang,
    word: word.toLowerCase(),
    phonetic: ipa ? `/${ipa}/` : '',
    persianPronunciation: persian || 'آوانویسی فارسی در دسترس نیست',
    approx: found?.approx ? 1 : 0,
    meaning: '',
    definition: '',
    usAudio: '',
    ukAudio: '',
    pronunciationSource: found ? (found.approx ? 'rules' : 'local') : 'unavailable'
  };
}

async function lookupText(rawText, pageLang) {
  const text = normalizeInput(rawText).replace(/\s+/g, ' ');
  const spoken = text.replace(OPTIONAL_RE, '');
  const matches = [...spoken.matchAll(TOKEN_RE)];
  if (matches.length === 1) return lookupAuto(matches[0][0], pageLang);
  if (matches.length < 2) throw new Error('جمله معتبر نیست.');
  if (matches.length > MAX_SENTENCE_WORDS || text.length > MAX_SENTENCE_CHARS) {
    throw new Error(`جمله خیلی بلند است؛ حداکثر ${MAX_SENTENCE_WORDS} کلمه.`);
  }
  const mode = await getMode();
  const lang = mode === 'auto' ? detectLanguage(text, pageLang) : mode;

  const found = new Map();
  await Promise.all([...new Set(matches.map(match => match[0]))].map(async token => {
    found.set(token, await resolveToken(token, lang));
  }));

  const items = matches.map((match, index) => ({
    token: match[0],
    ipa: found.get(match[0])?.ipa || '',
    lang: found.get(match[0])?.lang || lang,
    approx: !!found.get(match[0])?.approx,
    prefix: '',
    linked: false,
    fa: '',
    gap: index > 0 ? spoken.slice(matches[index - 1].index + matches[index - 1][0].length, match.index) : ''
  }));

  Engines[lang].refine(items);

  const leading = splitMarks(spoken.slice(0, matches[0].index));
  const lastMatch = matches[matches.length - 1];
  const trailing = splitMarks(spoken.slice(lastMatch.index + lastMatch[0].length));

  let missing = 0;
  let approx = 0;
  let persianOut = faMarks(leading.open);
  let ipaOut = '';
  items.forEach((item, index) => {
    const persian = item.fa || (item.ipa ? toPersian(item.prefix + item.ipa, item.lang, item.token.includes('-') ? '-' : ' ') : '');
    if (!persian) missing++;
    if (persian && item.approx) approx++;
    persianOut += persian || `[${item.token}]`;
    if (item.ipa) {
      ipaOut += item.prefix ? `‿${item.prefix}${item.ipa}` : `${ipaOut && !/\s$/.test(ipaOut) ? ' ' : ''}${item.ipa}`;
    }
    if (index < items.length - 1) {
      if (item.linked) {
        persianOut += '->';
      } else {
        const marks = splitMarks(items[index + 1].gap);
        persianOut += `${faMarks(marks.close)} ${faMarks(marks.open)}`.replace(/\s+$/, ' ');
        ipaOut += marks.close;
      }
    } else {
      persianOut += faMarks(trailing.close);
      ipaOut += trailing.close;
    }
  });

  return {
    kind: 'sentence',
    lang,
    word: text,
    phonetic: ipaOut.trim(),
    persianPronunciation: persianOut.replace(/\s+/g, ' ').trim(),
    meaning: '',
    definition: '',
    usAudio: '',
    ukAudio: '',
    missing,
    approx,
    pronunciationSource: missing === items.length ? 'unavailable' : 'local'
  };
}

async function lookupExtra({ kind, lang, text }) {
  if (kind === 'sentence') {
    const spoken = normalizeInput(text).replace(/\s+/g, ' ').replace(OPTIONAL_RE, '');
    const sentenceKey = `s:${lang}:${spoken}`;
    if (extraCache.has(sentenceKey)) return extraCache.get(sentenceKey);
    const sentenceTask = requestTranslation(spoken, lang).then(result => ({
      meaning: readTranslation(result, spoken), definition: '', usAudio: '', ukAudio: ''
    }));
    extraCache.set(sentenceKey, sentenceTask);
    const sentenceResult = await sentenceTask;
    if (!sentenceResult.meaning) extraCache.delete(sentenceKey);
    return sentenceResult;
  }
  const original = normalizeInput(text);
  const word = original.toLowerCase();
  const key = `${lang}:${word}`;
  if (extraCache.has(key)) return extraCache.get(key);

  const task = loadExtra(original, word, lang);
  extraCache.set(key, task);
  try {
    const result = await task;
    if (result.meaning) extraCache.set(key, result);
    else extraCache.delete(key);
    return result;
  } catch (error) {
    extraCache.delete(key);
    throw error;
  }
}

async function loadExtra(original, word, lang) {
  const key = `x:${lang}:${word}`;
  try {
    const stored = (await chrome.storage.local.get(key))[key];
    if (stored) return stored;
  } catch { }

  const translationPromise = requestTranslation(word, lang);
  const extra = await Engines[lang].extra(original, word);
  const meaning = readTranslation(await translationPromise, word);
  const result = {
    meaning,
    definition: extra.definition || '',
    usAudio: extra.usAudio || '',
    ukAudio: extra.ukAudio || ''
  };
  if (meaning) {
    try { await chrome.storage.local.set({ [key]: result }); } catch { }
  }
  return result;
}

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen.html')]
  });
  return contexts.length > 0;
}

async function speakOffline({ text, lang, rate }) {
  if (!(await hasOffscreen())) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Offline speech synthesis'
    });
  }
  await chrome.runtime.sendMessage({ type: 'OFFSCREEN_SPEAK', text, lang, rate });
  return { ok: true };
}

async function stopOffline() {
  if (await hasOffscreen()) await chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP' });
  return { ok: true };
}

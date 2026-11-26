(() => {
  const FETCH_TIMEOUT = 6000;
  const LEXICONS = {};

  const MARK = {
    brk: /[,;:.!?…()«»"“”]/,
    closers: ',;:.!?…)»”',
    openers: '(«“',
    fa: { ',': '،', ';': '؛', '?': '؟' }
  };

  function firstVariant(value) {
    return value.split(/[,;]/)[0].replace(/[\/\s]/g, '');
  }

  function loadLexicon(lang) {
    if (!LEXICONS[lang]) {
      LEXICONS[lang] = fetch(chrome.runtime.getURL(`data/${lang}.tsv`))
        .then(response => response.text())
        .then(text => {
          const map = new Map();
          let start = 0;
          while (start < text.length) {
            let end = text.indexOf('\n', start);
            if (end < 0) end = text.length;
            const tab = text.indexOf('\t', start);
            if (tab > start && tab < end) map.set(text.slice(start, tab), firstVariant(text.slice(tab + 1, end)));
            start = end + 1;
          }
          return map;
        })
        .catch(error => {
          delete LEXICONS[lang];
          throw error;
        });
    }
    return LEXICONS[lang];
  }

  function normalizeInput(value) {
    return String(value || '').normalize('NFC').replace(/[’‘ʼ]/g, "'").trim();
  }

  function decodeEntities(value) {
    return value
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  async function fetchJSON(url) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  }

  function requestTranslation(text, lang) {
    const pair = encodeURIComponent(`${lang}|fa`);
    return fetchJSON(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`);
  }

  function readTranslation(result, source) {
    const raw = String(result?.responseData?.translatedText || '');
    const valid = Number(result?.responseStatus) === 200 && !/MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(raw);
    const translated = decodeEntities(raw);
    if (!valid || !translated || translated.toLowerCase() === source.toLowerCase()) return '';
    return translated;
  }

  function splitMarks(gap) {
    let close = '';
    let open = '';
    for (const c of String(gap || '')) {
      if (MARK.closers.includes(c)) close += c;
      else if (MARK.openers.includes(c)) open += c;
    }
    return { close, open };
  }

  function faMarks(value) {
    return [...value].map(c => MARK.fa[c] || c).join('');
  }

  self.Engines = {};
  self.Common = { MARK, loadLexicon, normalizeInput, fetchJSON, requestTranslation, readTranslation, splitMarks, faMarks };
})();

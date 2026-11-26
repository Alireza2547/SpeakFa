(() => {
  const { MARK, loadLexicon, fetchJSON } = self.Common;

  const WEAK_FA = { the: 'ذِ', to: 'تِ', of: 'آو' };

  const LETTER_IPA = {
    A: 'eɪ', B: 'bi', C: 'si', D: 'di', E: 'i', F: 'ɛf', G: 'dʒi', H: 'eɪtʃ', I: 'aɪ', J: 'dʒeɪ',
    K: 'keɪ', L: 'ɛl', M: 'ɛm', N: 'ɛn', O: 'oʊ', P: 'pi', Q: 'kju', R: 'ɑɹ', S: 'ɛs', T: 'ti',
    U: 'ju', V: 'vi', W: 'dʌbəlju', X: 'ɛks', Y: 'waɪ', Z: 'zi'
  };

  const EN_WORDS = new Set([
    'the', 'is', 'are', 'was', 'were', 'and', 'of', 'to', 'in', 'you', 'that', 'it', 'for', 'with', 'this', 'be',
    'have', 'not', 'at', 'by', 'from', 'or', 'we', 'they', 'he', 'she', 'i', 'my', 'your', 'his', 'her', 'what',
    'which', 'will', 'would', 'can', 'could', 'do', 'does', 'did', 'there', 'their', 'about', 'if', 'so', 'but',
    'all', 'how', 'why', 'when', 'who', 'been', 'has', 'had', 'its', 'our', 'them', 'than', 'then', 'these'
  ]);

  const EN_WEAK = {
    the: 'ðə', a: 'ə', an: 'ən', to: 'tə', of: 'əv', and: 'ənd', for: 'fɚ', at: 'ət',
    from: 'frəm', was: 'wəz', can: 'kən', your: 'jɚ', are: 'ɚ', than: 'ðən', that: 'ðət'
  };

  async function getEnglishIPA(token) {
    const lexicon = await loadLexicon('en');
    const word = token.toLowerCase();
    const direct = lexicon.get(word);
    if (direct) return direct;

    const possessive = word.match(/^(.+)'s$/);
    if (possessive) {
      const base = lexicon.get(possessive[1]);
      if (base) return addPluralEnding(base, 'auto');
    }

    for (const plural of getRegularPluralBases(word)) {
      const base = lexicon.get(plural.base);
      if (base) return addPluralEnding(base, plural.kind);
    }

    if (word.includes('-')) {
      const parts = word.split('-').filter(Boolean);
      if (parts.length > 1) {
        const ipas = await Promise.all(parts.map(getEnglishIPA));
        if (ipas.every(Boolean)) return ipas.join(' ');
      }
    }
    return '';
  }

  function getRegularPluralBases(word) {
    if (word.length < 4) return [];
    if (/[^aeiou]ies$/.test(word)) return [{ base: word.slice(0, -3) + 'y', kind: 'z' }];
    if (/(s|x|z|ch|sh)es$/.test(word)) {
      return [
        { base: word.slice(0, -2), kind: 'iz' },
        { base: word.slice(0, -1), kind: 'auto' }
      ];
    }
    if (/[^s]s$/.test(word) && !/(ss|us|is)$/.test(word)) return [{ base: word.slice(0, -1), kind: 'auto' }];
    return [];
  }

  function addPluralEnding(ipa, kind) {
    const clean = normalizeIPA(ipa);
    if (!clean) return '';
    if (kind === 'z') return clean + 'z';
    if (kind === 'iz') return clean + 'ɪz';
    const finalSound = getFinalIPASound(clean);
    if (['p', 't', 'k', 'f', 'θ'].includes(finalSound)) return clean + 's';
    if (['s', 'z', 'ʃ', 'ʒ', 'tʃ', 'dʒ'].includes(finalSound)) return clean + 'ɪz';
    return clean + 'z';
  }

  function getFinalIPASound(ipa) {
    const s = normalizeIPA(ipa).replace(/ː/g, '');
    const digraph = s.slice(-2);
    if (digraph === 'tʃ' || digraph === 'dʒ') return digraph;
    return s.slice(-1);
  }

  function normalizeIPA(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[\/\[\]]/g, '')
      .replace(/[ˈˌˑ˞]/g, '')
      .replace(/[.·\s-]/g, '');
  }

  const PHONEMES = [
    ['tʃ', 'چ'], ['dʒ', 'ج'],
    ['eɪ', 'ِی', 'اِی'], ['aɪ', 'ای', 'آی'], ['ɔɪ', 'ُی', 'اُی'], ['aʊ', 'او', 'آو'],
    ['oʊ', 'و', 'او'], ['əʊ', 'و', 'او'], ['ɪə', 'یر', 'ایر'], ['eə', 'ِر', 'اِر'], ['ʊə', 'ور', 'اور'],
    ['iː', 'ی', 'ای'], ['uː', 'و', 'او'], ['ɑː', 'ا', 'آ'], ['ɔː', 'و', 'او'], ['ɜː', 'ِر', 'اِر'],
    ['ɝ', 'ِر', 'اِر'], ['ɚ', 'ر', 'ار'],
    ['ɪ', 'ی', 'ای'], ['ᵻ', 'ی', 'ای'], ['ɨ', 'ی', 'ای'], ['ʊ', 'ُ', 'اُ'], ['ʌ', 'ا', 'آ'], ['æ', 'َ', 'اَ'], ['ɐ', 'َ', 'اَ'],
    ['ɑ', 'ا', 'آ'], ['ɒ', 'ا', 'آ'], ['ɔ', 'ُ', 'اُ'], ['ɛ', 'ِ', 'اِ'], ['e', 'ِ', 'اِ'],
    ['ɜ', 'ِر', 'اِر'], ['a', 'َ', 'اَ'], ['o', 'و', 'او'],
    ['i', 'ی', 'ای'], ['u', 'و', 'او'], ['ɵ', 'و', 'او'], ['ʉ', 'و', 'او'],
    ['ə', 'ِ', 'ا'],
    ['θ', 'ث'], ['ð', 'ذ'], ['ʃ', 'ش'], ['ʒ', 'ژ'], ['ŋ', 'نگ'],
    ['ɹ', 'ر'], ['ɻ', 'ر'], ['r', 'ر'], ['ɾ', 'ر'], ['j', 'ی'], ['w', 'و'],
    ['p', 'پ'], ['b', 'ب'], ['t', 'ت'], ['d', 'د'], ['k', 'ک'], ['ɡ', 'گ'], ['g', 'گ'],
    ['f', 'ف'], ['v', 'و'], ['s', 'س'], ['z', 'ز'], ['h', 'ه'], ['x', 'خ'],
    ['m', 'م'], ['n', 'ن'], ['ɫ', 'ل'], ['l', 'ل'], ['ʔ', '']
  ];

  function ipaToPersian(value) {
    const ipa = normalizeIPA(value)
      .replace(/[\u0300-\u036f\u035c\u0361]/g, '')
      .replace(/[ʰʲʷʼ()]/g, '')
      .replace(/:/g, 'ː')
      .replace(/h(?=w)/g, '');
    if (!ipa) return '';

    let output = '';
    for (let i = 0; i < ipa.length;) {
      let matched = false;
      for (const [phoneme, medial, initial] of PHONEMES) {
        if (!ipa.startsWith(phoneme, i)) continue;
        let replacement = (i === 0 && initial !== undefined) ? initial : medial;
        if (phoneme === 'ŋ' && /^[kgɡ]/.test(ipa.slice(i + 1))) replacement = 'ن';
        if (phoneme === 'ə' && i > 0 && i + 1 >= ipa.length) replacement = 'ا';
        output += replacement;
        i += phoneme.length;
        matched = true;
        break;
      }
      if (!matched) i += 1;
    }
    return output.replace(/ا{2,}/g, 'ا').replace(/ی{3,}/g, 'یی').trim();
  }

  async function requestDictionaryEntry(word) {
    const data = await fetchJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    return Array.isArray(data) && data.length ? data : null;
  }

  function getDefinition(entries) {
    if (!Array.isArray(entries)) return '';
    for (const entry of entries) {
      for (const meaning of (entry.meanings || [])) {
        const definition = meaning.definitions?.find(item => item?.definition)?.definition;
        if (definition) return definition;
      }
    }
    return '';
  }

  function getAudio(entries) {
    const result = { usAudio: '', ukAudio: '' };
    if (!Array.isArray(entries)) return result;
    const urls = [];
    for (const entry of entries) {
      for (const item of (entry.phonetics || [])) {
        if (item?.audio) urls.push(item.audio.startsWith('//') ? `https:${item.audio}` : item.audio);
      }
    }
    for (const url of urls) {
      if (!result.ukAudio && /[-_](uk|gb)\.(mp3|ogg|wav)(\?.*)?$/i.test(url)) result.ukAudio = url;
      else if (!result.usAudio && /[-_]us\.(mp3|ogg|wav)(\?.*)?$/i.test(url)) result.usAudio = url;
    }
    if (!result.usAudio && !result.ukAudio && urls.length) result.usAudio = urls[0];
    return result;
  }

  function accepts(word) {
    return /^[a-z][a-z'-]*$/.test(word.toLowerCase());
  }

  async function lookup(token, allowRules) {
    const ipa = await getEnglishIPA(token);
    if (ipa) return { ipa, approx: false };
    if (allowRules && /^[A-Z]{2,6}$/.test(token)) {
      return { ipa: [...token].map(c => LETTER_IPA[c]).join(' '), approx: false };
    }
    return null;
  }

  function refine(items) {
    items.forEach((item, index) => {
      if (item.lang !== 'en') return;
      const next = items[index + 1];
      if (!next || MARK.brk.test(next.gap)) return;
      const key = item.token.toLowerCase();
      let weak = EN_WEAK[key];
      if (!weak) return;
      const vowelNext = /^[aeiou]/i.test(next.token);
      if (key === 'the') weak = vowelNext ? 'ði' : 'ðə';
      item.ipa = weak;
      item.approx = false;
      if (WEAK_FA[key] && !(key === 'the' && vowelNext)) item.fa = WEAK_FA[key];
    });
  }

  async function extra(original, word) {
    const entry = await requestDictionaryEntry(word);
    return { definition: getDefinition(entry), ...getAudio(entry) };
  }

  self.Engines.en = {
    id: 'en',
    words: EN_WORDS,
    accepts,
    lookup,
    refine,
    extra,
    toPersian: ipaToPersian
  };
})();

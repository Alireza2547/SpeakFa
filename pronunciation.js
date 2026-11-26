const LEXICONS = {};

const FR_ELISION = {
  l: 'l', d: 'd', j: 'ʒ', n: 'n', m: 'm', t: 't', s: 's', c: 's',
  qu: 'k', jusqu: 'ʒysk', lorsqu: 'lɔʁsk', puisqu: 'pɥisk', quoiqu: 'kwak', presqu: 'pʁɛsk'
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

async function getFrenchIPA(token, allowRules) {
  const lexicon = await loadLexicon('fr');
  const direct = lexicon.get(token.toLowerCase()) || lexicon.get(token);
  if (direct) return { ipa: direct, approx: false };

  const apostrophe = token.indexOf("'");
  if (apostrophe > 0) {
    const prefix = token.slice(0, apostrophe).toLowerCase();
    const rest = token.slice(apostrophe + 1);
    if (Object.hasOwn(FR_ELISION, prefix) && rest) {
      const data = await getFrenchIPA(rest, allowRules);
      return data ? { ipa: FR_ELISION[prefix] + data.ipa, approx: data.approx } : null;
    }
  }

  if (token.includes('-')) {
    const parts = token.split('-').filter(Boolean);
    if (parts.length > 1) {
      const results = await Promise.all(parts.map(part => getFrenchIPA(part, allowRules)));
      if (!results.every(Boolean)) return null;
      return { ipa: results.map(result => result.ipa).join(' '), approx: results.some(result => result.approx) };
    }
  }

  if (allowRules) {
    const ipa = frenchRulesIPA(token);
    return ipa ? { ipa, approx: true } : null;
  }
  return null;
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
  ['ɝ', 'ِر', 'اِر'], ['ɚ', 'ِر', 'اِر'],
  ['ɪ', 'ی', 'ای'], ['ᵻ', 'ی', 'ای'], ['ɨ', 'ی', 'ای'], ['ʊ', 'ُ', 'اُ'], ['ʌ', 'ا', 'آ'], ['æ', 'َ', 'اَ'], ['ɐ', 'ا', 'آ'],
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
    .replace(/:/g, 'ː');
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

const FR_PHONEMES = [
  ['tʃ', 'چ'], ['dʒ', 'ج'],
  ['ɑ\u0303', 'ان', 'آن'], ['a\u0303', 'ان', 'آن'],
  ['ɛ\u0303', 'ان', 'ان'], ['e\u0303', 'ان', 'ان'], ['œ\u0303', 'ان', 'ان'],
  ['ɔ\u0303', 'ون', 'اون'], ['o\u0303', 'ون', 'اون'],
  ['wa', 'وا', 'وا'], ['ɥi', 'وی', 'وی'],
  ['i', 'ی', 'ای'], ['y', 'و', 'او'], ['u', 'و', 'او'],
  ['e', 'ِ', 'اِ'], ['ɛ', 'ِ', 'اِ'], ['ø', 'ُ', 'اُ', 'و'], ['œ', 'ُ', 'اُ'],
  ['ə', 'ُ', 'اُ'], ['o', 'و', 'او'], ['ɔ', 'ُ', 'اُ'],
  ['a', 'َ', 'اَ'], ['ɑ', 'ا', 'آ'],
  ['j', 'ی'], ['w', 'و'], ['ɥ', 'و'],
  ['p', 'پ'], ['b', 'ب'], ['t', 'ت'], ['d', 'د'], ['k', 'ک'], ['ɡ', 'گ'], ['g', 'گ'],
  ['f', 'ف'], ['v', 'و'], ['s', 'س'], ['z', 'ز'], ['ʃ', 'ش'], ['ʒ', 'ژ'],
  ['m', 'م'], ['n', 'ن'], ['ɲ', 'نی'], ['ŋ', 'نگ'], ['l', 'ل'], ['ɫ', 'ل'],
  ['ʁ', 'غ'], ['ʀ', 'غ'], ['r', 'غ'], ['ɾ', 'غ'], ['h', 'ه'], ['x', 'خ'], ['ʔ', '']
];

const FR_VOICELESS = 'ptkfsʃx';

function cleanFrenchIPA(value) {
  return String(value || '')
    .normalize('NFD')
    .toLowerCase()
    .replace(/[\/\[\]]/g, '')
    .replace(/[ˈˌˑ˞ːʼ:]/g, '')
    .replace(/[\u0300-\u0302\u0304-\u036f]/g, '')
    .replace(/[.·\s‿-]/g, '')
    .replace(/ε/g, 'ɛ')
    .replace(/ǝ/g, 'ə')
    .replace(/[µμ]/g, 'ɥ');
}

function frenchIpaToPersian(value) {
  const ipa = cleanFrenchIPA(value);
  if (!ipa) return '';

  let output = '';
  for (let i = 0; i < ipa.length;) {
    let matched = false;
    for (const [phoneme, medial, initial, final] of FR_PHONEMES) {
      if (!ipa.startsWith(phoneme, i)) continue;
      let replacement = medial;
      if (i === 0 && initial !== undefined) replacement = initial;
      else if (i > 0 && i + phoneme.length >= ipa.length && final !== undefined) replacement = final;
      if (replacement === 'غ' && (FR_VOICELESS.includes(ipa[i - 1] || ' ') || FR_VOICELESS.includes(ipa[i + 1] || ' '))) replacement = 'خ';
      output += replacement;
      i += phoneme.length;
      matched = true;
      break;
    }
    if (!matched) i += 1;
  }
  return output.replace(/ا{2,}/g, 'ا').replace(/ی{3,}/g, 'یی').trim();
}

const FR_V = 'aeiouyàâäéèêëîïôöùûüÿœæ';
const FR_SOFT = 'eiyéèêëî';

function frenchRulesIPA(input) {
  let w = String(input || '').toLowerCase().normalize('NFC').replace(/[^a-zàâäçéèêëîïôöùûüÿœæ]/g, '');
  if (!w) return '';
  const isV = c => !!c && FR_V.includes(c);

  let tail = '';
  let trimmed = false;
  let silentE = false;
  if (w.length > 4 && /i(e[rz])$/.test(w)) {
    w = w.slice(0, -3);
    tail = 'je';
    trimmed = true;
  } else if (w.length > 3 && /e[rz]$/.test(w)) {
    w = w.slice(0, -2);
    tail = 'e';
    trimmed = true;
  } else if (w.length > 2 && /[^aeiouy]es?$/.test(w)) {
    w = w.replace(/es?$/, '');
    trimmed = true;
    silentE = true;
  }
  if (!trimmed && w.length > 2) w = w.replace(/(?<=[a-zàâäçéèêëîïôöùûüÿœæ])[sxztdp]+$/, '');
  w = w.replace(/ss/g, 'ß');

  const nasalOk = rest => rest ? (!isV(rest[0]) && !'nm'.includes(rest[0]) && rest[0] !== 'ß') : !silentE;
  let out = '';
  let i = 0;
  while (i < w.length) {
    const rest = w.slice(i);
    const prev = w[i - 1] || '';
    let match;

    if (rest.startsWith('eau')) { out += 'o'; i += 3; continue; }
    if (rest.startsWith('au')) { out += 'o'; i += 2; continue; }
    if (rest.startsWith('œu') || rest.startsWith('oeu')) { out += 'œ'; i += rest.startsWith('œu') ? 2 : 3; continue; }
    if ((match = rest.match(/^(ain|aim|ein)/)) && nasalOk(rest.slice(3))) { out += 'ɛ̃'; i += 3; continue; }
    if (rest.startsWith('oin') && nasalOk(rest.slice(3))) { out += 'wɛ̃'; i += 3; continue; }
    if (rest.startsWith('ien') && !isV(prev) && nasalOk(rest.slice(3))) { out += 'jɛ̃'; i += 3; continue; }
    if (rest.startsWith('ai') || rest.startsWith('ei') || rest.startsWith('aî')) { out += 'ɛ'; i += 2; continue; }
    if (/^(où|oû)/.test(rest)) { out += 'u'; i += 2; continue; }
    if (rest.startsWith('ou')) { out += isV(rest[2]) ? 'w' : 'u'; i += 2; continue; }
    if (rest.startsWith('oi')) { out += 'wa'; i += 2; continue; }
    if (rest.startsWith('oy') && isV(rest[2])) { out += 'waj'; i += 2; continue; }
    if (rest.startsWith('eu')) { out += (i + 2 >= w.length) ? 'ø' : 'œ'; i += 2; continue; }
    if (rest.startsWith('ch')) { out += 'ʃ'; i += 2; continue; }
    if (rest.startsWith('sh')) { out += 'ʃ'; i += 2; continue; }
    if (rest.startsWith('ph')) { out += 'f'; i += 2; continue; }
    if (rest.startsWith('th')) { out += 't'; i += 2; continue; }
    if (rest.startsWith('gn')) { out += 'ɲ'; i += 2; continue; }
    if (rest.startsWith('qu')) { out += 'k'; i += 2; continue; }
    if (rest.startsWith('ck')) { out += 'k'; i += 2; continue; }
    if (/^gu[eiyéèêë]/.test(rest)) { out += 'ɡ'; i += 2; continue; }
    if (/^cc[eiyéèê]/.test(rest)) { out += 'ks'; i += 2; continue; }
    if (rest.startsWith('ill')) { out += isV(prev) || !prev ? 'j' : 'ij'; i += 3; continue; }
    if (rest === 'il' && isV(prev)) { out += 'j'; i += 2; continue; }
    if (rest.startsWith('ti') && rest.startsWith('tion')) { out += 'sj'; i += 2; continue; }
    if ((match = rest.match(/^(in|im|yn|ym)/)) && nasalOk(rest.slice(2))) { out += 'ɛ̃'; i += 2; continue; }
    if ((match = rest.match(/^(un|um)/)) && nasalOk(rest.slice(2))) { out += 'œ̃'; i += 2; continue; }
    if ((match = rest.match(/^(on|om)/)) && nasalOk(rest.slice(2))) { out += 'ɔ̃'; i += 2; continue; }
    if ((match = rest.match(/^(an|am|en|em)/)) && nasalOk(rest.slice(2))) { out += 'ɑ̃'; i += 2; continue; }

    const c = w[i];
    const next = w[i + 1] || '';
    const next2 = w[i + 2] || '';
    i += 1;
    switch (c) {
      case 'é': out += 'e'; break;
      case 'è': case 'ê': case 'ë': out += 'ɛ'; break;
      case 'à': case 'ä': out += 'a'; break;
      case 'â': out += 'ɑ'; break;
      case 'î': case 'ï': case 'ÿ': out += 'i'; break;
      case 'ô': out += 'o'; break;
      case 'ù': case 'û': case 'ü': out += 'y'; break;
      case 'œ': out += 'œ'; break;
      case 'æ': out += 'e'; break;
      case 'ç': out += 's'; break;
      case 'a': out += 'a'; break;
      case 'e': {
        const cluster = next && !isV(next) && next2 && !isV(next2);
        const finalConsonant = next && !isV(next) && !next2;
        out += (cluster || finalConsonant) ? 'ɛ' : 'ə';
        break;
      }
      case 'i': out += (isV(next) && !isV(prev)) ? 'j' : 'i'; break;
      case 'y': out += (isV(prev) && isV(next)) ? 'j' : 'i'; break;
      case 'u':
        if (next === 'i') { out += 'ɥi'; i += 1; }
        else out += isV(next) ? 'ɥ' : 'y';
        break;
      case 'o': {
        const cluster = next && !isV(next) && next2 && !isV(next2);
        const finalConsonant = next && !isV(next) && !next2;
        out += (cluster || finalConsonant || next === 'r') ? 'ɔ' : 'o';
        break;
      }
      case 'c': out += FR_SOFT.includes(next) ? 's' : 'k'; break;
      case 'g': out += FR_SOFT.includes(next) ? 'ʒ' : 'ɡ'; break;
      case 's': out += (isV(prev) && (isV(next) || (silentE && !next))) ? 'z' : 's'; break;
      case 'ß': out += 's'; break;
      case 'x': out += 'ks'; break;
      case 'h': break;
      case 'j': out += 'ʒ'; break;
      case 'q': out += 'k'; break;
      case 'r': out += 'ʁ'; break;
      case 'w': out += 'w'; break;
      default:
        if (next === c && !isV(c)) i += 1;
        out += c;
    }
  }
  return out + tail;
}
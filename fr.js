(() => {
  const { MARK, loadLexicon, fetchJSON } = self.Common;

  const FR_SKIPPED_SECTIONS = /^(lettre|symbole|sigle|erreur)/;

  const ACCENTED_RE = /[àâäçéèêëîïôöùûüÿœæ]/i;

  const FR_WORDS = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'est', 'et', 'je', 'tu', 'il', 'elle', 'nous', 'vous',
    'ils', 'elles', 'ce', 'cet', 'cette', 'ces', 'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'ses', 'notre', 'votre',
    'leur', 'leurs', 'qui', 'que', 'quoi', 'dont', 'ne', 'pas', 'plus', 'très', 'avec', 'sans', 'pour', 'dans',
    'sur', 'sous', 'chez', 'par', 'mais', 'ou', 'donc', 'car', 'si', 'bien', 'oui', 'non', 'merci', 'bonjour',
    'salut', 'au', 'aux', 'suis', 'es', 'sommes', 'sont', 'ai', 'avons', 'avez', 'ont', 'fait', 'être', 'avoir',
    'l', 'd', 'j', 'qu', 'comment', 'pourquoi', 'quand', 'aussi', 'tout', 'tous', 'cela', 'ça', 'voici', 'voilà'
  ]);

  const FR_OVERRIDES = {
    est: 'ɛ',
    et: 'e',
    es: 'ɛ',
    'a-t-elle': 'atɛl',
    'a-t-il': 'atil',
    'a-t-on': 'atɔ̃'
  };

  const FR_ELISION = {
    l: 'l', d: 'd', j: 'ʒ', n: 'n', m: 'm', t: 't', s: 's', c: 's',
    qu: 'k', jusqu: 'ʒysk', lorsqu: 'lɔʁsk', puisqu: 'pɥisk', quoiqu: 'kwak', presqu: 'pʁɛsk'
  };

  const LIAISON_TRIGGERS = new Set([
    'les', 'des', 'mes', 'tes', 'ses', 'ces', 'vos', 'nos', 'leurs', 'aux', 'un', 'mon', 'ton', 'son',
    'en', 'on', 'nous', 'vous', 'ils', 'elles', 'chez', 'dans', 'sans', 'sous', 'très', 'bien', 'tout',
    'tous', 'quand', 'deux', 'trois', 'six', 'dix', 'quels', 'quelles', 'plusieurs', 'certains', 'aucun',
    'est'
  ]);

  const LIAISON_LETTERS = { s: 'z', x: 'z', z: 'z', t: 't', d: 't', n: 'n', p: 'p' };

  const LIAISON_SIBILANT = new Set(['six', 'dix']);

  const LIAISON_SILENT_FINAL = new Set(['ils', 'elles', 'leurs', 'quels', 'quelles', 'plusieurs']);

  const FR_VOWELS = 'aɑeɛəiyouøœɔ';

  function liaisonWord(token) {
    return token.toLowerCase().split(/['-]/).pop();
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

  function dropLatentConsonants(items) {
    for (let i = 0; i < items.length - 1; i++) {
      const item = items[i];
      if (!item.ipa || item.lang !== 'fr' || items[i + 1].lang !== 'fr' || MARK.brk.test(items[i + 1].gap)) continue;
      const last = liaisonWord(item.token);
      if (!LIAISON_TRIGGERS.has(last)) continue;
      const consonant = LIAISON_LETTERS[last.slice(-1)];
      if (consonant && item.ipa.endsWith(consonant)) item.ipa = item.ipa.slice(0, -consonant.length);
      else if (LIAISON_SIBILANT.has(last) && item.ipa.endsWith('s')) item.ipa = item.ipa.slice(0, -1);
    }
  }

  function getLiaisonConsonant(token, ipa, nextIpa, gap) {
    if (!ipa || !nextIpa || MARK.brk.test(gap)) return '';
    const last = liaisonWord(token);
    if (!LIAISON_TRIGGERS.has(last)) return '';
    const consonant = LIAISON_LETTERS[last.slice(-1)];
    if (!consonant) return '';
    const own = cleanFrenchIPA(ipa).replace(/\u0303/g, '');
    const next = cleanFrenchIPA(nextIpa);
    if (!LIAISON_SILENT_FINAL.has(last) && !FR_VOWELS.includes(own.slice(-1))) return '';
    if (!FR_VOWELS.includes(next[0])) return '';
    return consonant;
  }

  async function requestWiktionaryFr(title) {
    const url = new URL('https://fr.wiktionary.org/w/api.php');
    url.searchParams.set('action', 'query');
    url.searchParams.set('prop', 'revisions');
    url.searchParams.set('rvprop', 'content');
    url.searchParams.set('rvslots', 'main');
    url.searchParams.set('titles', title);
    url.searchParams.set('redirects', '1');
    url.searchParams.set('format', 'json');
    url.searchParams.set('formatversion', '2');
    const json = await fetchJSON(url.toString());
    const text = json?.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
    return text ? parseFrenchWikitext(text) : null;
  }

  function parseFrenchWikitext(text) {
    const langMatch = text.match(/\{\{langue\|fr\}\}/);
    if (!langMatch) return null;
    const rest = text.slice(langMatch.index + langMatch[0].length);
    const next = rest.search(/\n==\s*\{\{langue\|/);
    const section = next < 0 ? rest : rest.slice(0, next);

    const source = section.split(/\n(?=\{\{S\|)/).find(part => {
      const type = part.match(/^\{\{S\|([^|}]+)/)?.[1];
      return type && !FR_SKIPPED_SECTIONS.test(type);
    }) || section;

    const audioPattern = /audio\s*=\s*([^|}\n]+\.(?:ogg|oga|wav|mp3|flac))/i;
    const audioMatch = source.match(audioPattern) || section.match(audioPattern);
    const audio = audioMatch
      ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(audioMatch[1].trim().replace(/ /g, '_'))}`
      : '';

    const definitionMatch = source.match(/^#\s+(.+)$/m);
    const definition = definitionMatch ? cleanWikitext(definitionMatch[1]) : '';

    return { audio, definition };
  }

  function cleanWikitext(value) {
    let text = String(value || '');
    for (let i = 0; i < 4; i++) text = text.replace(/\{\{[^{}]*\}\}/g, '');
    return text
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/'{2,}/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function lookup(token, allowRules) {
    const lower = token.toLowerCase();
    if (FR_OVERRIDES[lower]) return { ipa: FR_OVERRIDES[lower], approx: false };
    const apostrophe = lower.indexOf("'");
    if (apostrophe > 0) {
      const prefix = lower.slice(0, apostrophe);
      const rest = lower.slice(apostrophe + 1);
      if (Object.hasOwn(FR_ELISION, prefix) && FR_OVERRIDES[rest]) {
        return { ipa: FR_ELISION[prefix] + FR_OVERRIDES[rest], approx: false };
      }
    }
    return getFrenchIPA(token, allowRules);
  }

  function refine(items) {
    dropLatentConsonants(items);
    for (let i = 0; i < items.length - 1; i++) {
      if (items[i].lang !== 'fr' || items[i + 1].lang !== 'fr') continue;
      const consonant = getLiaisonConsonant(items[i].token, items[i].ipa, items[i + 1].ipa, items[i + 1].gap);
      if (consonant) {
        items[i].linked = true;
        items[i + 1].prefix = consonant;
      }
    }
  }

  async function extra(original, word) {
    for (const title of [...new Set([word, original])]) {
      const data = await requestWiktionaryFr(title);
      if (data) return { definition: data.definition, usAudio: data.audio, ukAudio: '' };
    }
    return { definition: '', usAudio: '', ukAudio: '' };
  }

  self.Engines.fr = {
    id: 'fr',
    words: FR_WORDS,
    accented: ACCENTED_RE,
    accepts: () => true,
    lookup,
    refine,
    extra,
    toPersian: frenchIpaToPersian
  };
})();

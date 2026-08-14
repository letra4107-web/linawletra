// Approximate Tagalog phoneme/syllable analysis.
//
// This is a TEXT-based approximation, not acoustic phoneme recognition:
// Web Speech API / server STT only return a plain transcript, never
// phoneme timing or confidence. We syllabify + phonemize both the
// expected word and the transcript the same way, then diff the two
// phoneme sequences positionally. This can tell you "the d became an r
// in the transcript," but it cannot catch a case where the STT engine
// mis-hears a correct utterance, or "autocorrects" toward the expected
// spelling.
//
// Mirrored at server/services/tagalogPhonetics.js (no shared package
// exists between the CRA frontend and the ESM backend in this repo, so
// this file is intentionally duplicated there, same as readingAccuracy.js).

export const TAGALOG_VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
const SHORT_TAGALOG_SOUND_ALIASES = {
  a: new Set(['a', 'ah']),
  e: new Set(['e', 'eh']),
  i: new Set(['i', 'ee']),
  o: new Set(['o', 'oh']),
  u: new Set(['u', 'oo']),
};
const TAGALOG_CONSONANTS_ALIAS = new Set('bcdfghjklmnpqrstvwxyz'.split(''));

// Browsers' SpeechRecognition commonly transcribes short Tagalog vowel/CV-syllable
// sounds using English long-vowel spelling ("bi" -> "bee", "ku" -> "koo"). Accept
// those specific spellings as matches for the vowel they stand in for, but only
// when every consonant in the syllable still matches exactly -- a genuinely wrong
// consonant (e.g. "ka" spoken as "ta") must still fail, not get silently upgraded.
const normalizeShortSoundAlias = (expectedWord, spokenWord) => {
  const expected = String(expectedWord || '').toLowerCase().trim();
  const spoken = String(spokenWord || '').toLowerCase().trim();
  if (expected.length === 1) {
    return SHORT_TAGALOG_SOUND_ALIASES[expected]?.has(spoken) ? expected : spoken;
  }
  if (expected.length === 2 && TAGALOG_CONSONANTS_ALIAS.has(expected[0]) && SHORT_TAGALOG_SOUND_ALIASES[expected[1]]) {
    const [consonant, vowel] = expected;
    if (spoken[0] === consonant && SHORT_TAGALOG_SOUND_ALIASES[vowel].has(spoken.slice(1))) {
      return expected;
    }
  }
  return spoken;
};

// Two-consonant sequences Filipino orthography actually allows as a single
// syllable onset (the "ng"/"ts" digraphs, plus consonant+r/l/w/y clusters
// from Spanish/English loanwords). Any other consonant pair between two
// vowels is split coda/onset instead of both riding onto the next syllable.
const ONSET_CLUSTERS = new Set([
  'ng', 'ts', 'tr', 'dr', 'kr', 'gr', 'br', 'pr', 'fr',
  'kl', 'gl', 'pl', 'bl', 'fl', 'sw', 'sy',
]);

// Confusion pairs relevant to dyslexic Tagalog readers. Weight is the
// partial credit given when this substitution occurs (0 = no credit,
// 1 = full credit / not tracked as an error).
export const PHONEME_SIMILARITY = {
  d_r: 0.3, r_d: 0.3,
  b_p: 0.4, p_b: 0.4,
  t_k: 0.4, k_t: 0.4,
  g_k: 0.4, k_g: 0.4,
  t_d: 0.4, d_t: 0.4,
  n_ng: 0.3, ng_n: 0.3,
  m_n: 0.4, n_m: 0.4,
  l_r: 0.35, r_l: 0.35,
  s_ts: 0.4, ts_s: 0.4,
  i_e: 0.3, e_i: 0.3,
  o_u: 0.3, u_o: 0.3,
  a_o: 0.3, o_a: 0.3,
};

export const CONFUSION_LABELS = {
  d_r: 'mixing up d and r', r_d: 'mixing up r and d',
  b_p: 'mixing up b and p', p_b: 'mixing up p and b',
  t_k: 'mixing up t and k', k_t: 'mixing up k and t',
  g_k: 'mixing up g and k', k_g: 'mixing up k and g',
  t_d: 'mixing up t and d', d_t: 'mixing up d and t',
  n_ng: 'mixing up n and ng', ng_n: 'mixing up ng and n',
  m_n: 'mixing up m and n', n_m: 'mixing up n and m',
  l_r: 'mixing up l and r', r_l: 'mixing up r and l',
  s_ts: 'mixing up s and ts', ts_s: 'mixing up ts and s',
  i_e: 'mixing up i and e', e_i: 'mixing up e and i',
  o_u: 'mixing up o and u', u_o: 'mixing up u and o',
  a_o: 'mixing up a and o', o_a: 'mixing up o and a',
};

/**
 * Split a word into syllables. Uses existing hyphens when present
 * (e.g. practice-word data like "ma-ta"); otherwise applies a simple
 * onset-maximizing CV syllabifier for arbitrary transcript words.
 * @param {string} word
 * @returns {string[]}
 */
export function syllabify(word) {
  const clean = String(word || '').toLowerCase().trim();
  if (!clean) return [];
  if (/[-‐‑‒–—]/.test(clean)) {
    return clean.split(/[-‐‑‒–—]+/).map((part) => part.trim()).filter(Boolean);
  }

  // Decompose to NFD so accented letters (á, â, ñ, ...) split into a plain
  // base letter + a combining diacritic mark, then re-attach each mark to
  // its base letter. Vowel-ness is tested against the base letter only, but
  // the diacritic travels with it into the output — accented homograph
  // pairs like "bába"/"babâ" must keep their accent, or syllabify silently
  // collapses them into the wrong, shorter word (e.g. "bba"/"bab").
  const letters = [];
  for (const ch of clean.normalize('NFD')) {
    if (/[a-z]/.test(ch)) {
      letters.push(ch);
    } else if (/[̀-ͯ]/.test(ch) && letters.length) {
      letters[letters.length - 1] += ch;
    }
  }
  if (!letters.length) return [];

  const vowelIndexes = [];
  letters.forEach((letter, index) => {
    if (TAGALOG_VOWELS.has(letter[0])) vowelIndexes.push(index);
  });
  if (!vowelIndexes.length) return [letters.join('').normalize('NFC')];

  // Walk the gaps between consecutive vowels and decide, per the maximal
  // onset principle with a legality condition, how many of the consonants
  // in that gap stay as the previous syllable's coda vs. become the next
  // syllable's onset: a single consonant always becomes an onset; a
  // multi-consonant gap only carries its last two letters onto the onset
  // together if they're a recognized cluster (ONSET_CLUSTERS) — otherwise
  // only the very last consonant does, and the rest stay behind as a coda
  // (e.g. "magbabasa" splits mag-ba-ba-sa, not ma-gba-ba-sa).
  const boundaries = [0];
  for (let v = 0; v < vowelIndexes.length - 1; v += 1) {
    const gapStart = vowelIndexes[v] + 1;
    const gapEnd = vowelIndexes[v + 1];
    const gapLength = gapEnd - gapStart;

    if (gapLength <= 0) {
      boundaries.push(gapEnd);
    } else if (gapLength === 1) {
      boundaries.push(gapStart);
    } else {
      const lastTwo = letters[gapEnd - 2][0] + letters[gapEnd - 1][0];
      boundaries.push(ONSET_CLUSTERS.has(lastTwo) ? gapEnd - 2 : gapEnd - 1);
    }
  }

  const syllables = [];
  for (let i = 0; i < boundaries.length; i += 1) {
    const start = boundaries[i];
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : letters.length;
    syllables.push(letters.slice(start, end).join(''));
  }
  return syllables.filter(Boolean).map((syllable) => syllable.normalize('NFC'));
}

/**
 * Tokenize a syllable into phonemes, treating "ng" and "ts" as single
 * phonemes (digraphs).
 * @param {string} syllable
 * @returns {string[]}
 */
export function extractPhonemes(syllable) {
  const clean = String(syllable || '').toLowerCase().replace(/[^a-z]/g, '');
  const phonemes = [];
  let i = 0;
  while (i < clean.length) {
    if (i + 1 < clean.length) {
      const digraph = clean[i] + clean[i + 1];
      if (digraph === 'ng' || digraph === 'ts') {
        phonemes.push(digraph);
        i += 2;
        continue;
      }
    }
    phonemes.push(clean[i]);
    i += 1;
  }
  return phonemes;
}

/**
 * Positional diff between two phoneme sequences.
 * @returns {{ ops: Array, phonemeAccuracy: number }}
 */
export function alignPhonemes(expectedPhonemes, spokenPhonemes) {
  const maxLen = Math.max(expectedPhonemes.length, spokenPhonemes.length);
  const ops = [];
  let weightedCorrect = 0;

  for (let i = 0; i < maxLen; i += 1) {
    const expected = expectedPhonemes[i] || '';
    const spoken = spokenPhonemes[i] || '';

    if (expected && expected === spoken) {
      ops.push({ type: 'match', expected, spoken });
      weightedCorrect += 1;
      continue;
    }
    if (expected && !spoken) {
      ops.push({ type: 'delete', expected, spoken: null });
      continue;
    }
    if (!expected && spoken) {
      ops.push({ type: 'insert', expected: null, spoken });
      continue;
    }

    const key = `${expected}_${spoken}`;
    const similarity = PHONEME_SIMILARITY[key];
    if (similarity !== undefined) {
      weightedCorrect += similarity;
      ops.push({ type: 'substitute', expected, spoken, confusion: key, weight: similarity });
    } else {
      ops.push({ type: 'substitute', expected, spoken, confusion: null, weight: 0 });
    }
  }

  const phonemeAccuracy = maxLen === 0 ? 100 : Math.round((weightedCorrect / maxLen) * 100);
  return { ops, phonemeAccuracy };
}

/**
 * Look up whether an expected->spoken phoneme pair is a known confusable
 * pair (as opposed to an arbitrary/unknown substitution).
 * @returns {string|null} the confusion key, or null
 */
export function classifyConfusion(expectedPhoneme, spokenPhoneme) {
  if (!expectedPhoneme || !spokenPhoneme || expectedPhoneme === spokenPhoneme) return null;
  const key = `${expectedPhoneme}_${spokenPhoneme}`;
  return PHONEME_SIMILARITY[key] !== undefined ? key : null;
}

/**
 * Syllable-by-syllable comparison of an expected word against what was
 * spoken, each syllable scored via phoneme-level alignment.
 * @returns {{ syllables: Array, syllableAccuracy: number }}
 */
export function alignSyllables(expectedWord, spokenWord) {
  const expectedSyllables = syllabify(expectedWord);
  const spokenSyllables = syllabify(spokenWord);
  const maxLen = Math.max(expectedSyllables.length, spokenSyllables.length, 1);
  const syllables = [];
  let correctCount = 0;

  for (let i = 0; i < Math.max(expectedSyllables.length, spokenSyllables.length); i += 1) {
    const expected = expectedSyllables[i] || '';
    const spoken = spokenSyllables[i] || '';

    if (!expected) {
      syllables.push({ syllable: '', spokenSyllable: spoken, status: 'extra', phonemeOps: [], phonemicScore: 0 });
      continue;
    }
    if (!spoken) {
      syllables.push({ syllable: expected, spokenSyllable: '', status: 'skipped', phonemeOps: [], phonemicScore: 0 });
      continue;
    }

    const { ops, phonemeAccuracy } = alignPhonemes(extractPhonemes(expected), extractPhonemes(spoken));
    const status = expected === spoken ? 'correct' : phonemeAccuracy >= 70 ? 'partial' : 'incorrect';
    if (status === 'correct') correctCount += 1;
    else if (status === 'partial') correctCount += 0.5;

    syllables.push({ syllable: expected, spokenSyllable: spoken, status, phonemeOps: ops, phonemicScore: phonemeAccuracy });
  }

  const syllableAccuracy = Math.round((correctCount / maxLen) * 100);
  return { syllables, syllableAccuracy };
}

/**
 * Full word-level pronunciation evaluation: syllable breakdown, phoneme
 * accuracy, syllable accuracy, and a combined pronunciation score.
 * @returns {{ pronunciationScore, phonemeAccuracy, syllableAccuracy, syllableBreakdown, phonemeOps, confusions }}
 */
export function evaluateWord(expectedWord, spokenWord) {
  const expected = String(expectedWord || '').toLowerCase().trim();
  const spoken = normalizeShortSoundAlias(expected, spokenWord);

  if (!expected) {
    return { pronunciationScore: 0, phonemeAccuracy: 0, syllableAccuracy: 0, syllableBreakdown: [], phonemeOps: [], confusions: [] };
  }

  const { syllables, syllableAccuracy } = alignSyllables(expected, spoken);
  const allOps = syllables.flatMap((s) => s.phonemeOps);

  let totalWeight = 0;
  let totalScore = 0;
  syllables.forEach((s) => {
    const weight = Math.max(s.phonemeOps.length, 1);
    totalWeight += weight;
    totalScore += s.phonemicScore * weight;
  });
  const phonemeAccuracy = totalWeight ? Math.round(totalScore / totalWeight) : 0;

  const confusions = new Set(allOps.filter((op) => op.confusion).map((op) => op.confusion));
  if (syllables.some((s) => s.status === 'skipped')) confusions.add('syllable_skip');
  if (syllables.some((s) => s.status === 'extra')) confusions.add('syllable_merge');

  const lastSyllable = syllables[syllables.length - 1];
  if (lastSyllable && lastSyllable.status !== 'correct') {
    const lastExpectedChar = lastSyllable.syllable.slice(-1);
    const spokenShorter = !lastSyllable.spokenSyllable || lastSyllable.spokenSyllable.length < lastSyllable.syllable.length;
    if (TAGALOG_VOWELS.has(lastExpectedChar) && spokenShorter) confusions.add('final_vowel_drop');
  }

  const pronunciationScore = Math.round(phonemeAccuracy * 0.6 + syllableAccuracy * 0.4);

  return {
    pronunciationScore,
    phonemeAccuracy,
    syllableAccuracy,
    syllableBreakdown: syllables,
    phonemeOps: allOps,
    confusions: [...confusions],
  };
}

/**
 * Child-friendly, specific feedback string for a word evaluation.
 * @param {ReturnType<typeof evaluateWord>} evaluation
 * @param {string} expectedWord
 * @returns {string}
 */
export function generateFeedback(evaluation, expectedWord) {
  const { pronunciationScore, syllableBreakdown } = evaluation;
  if (pronunciationScore >= 90) return `Great job! You said "${expectedWord}" clearly.`;

  const badSyllable = syllableBreakdown.find((s) => s.status !== 'correct');
  if (badSyllable) {
    const subOp = badSyllable.phonemeOps.find((op) => op.type === 'substitute' && op.confusion);
    if (subOp) {
      const label = CONFUSION_LABELS[subOp.confusion];
      return `The "${subOp.expected}" sound became "${subOp.spoken}". Try saying "${expectedWord}" again${label ? ` — you're ${label}` : ''}.`;
    }
    if (badSyllable.status === 'skipped') {
      return `You skipped the "${badSyllable.syllable}" part. Try saying all of "${expectedWord}".`;
    }
    if (badSyllable.status === 'extra') {
      return `That was a bit longer than "${expectedWord}". Try saying just the word slowly.`;
    }
    return `The "${badSyllable.syllable}" part needs practice. Try "${expectedWord}" again.`;
  }

  if (pronunciationScore >= 70) return `Almost there! Listen again, then try "${expectedWord}".`;
  return `Let's try again slowly. Listen first, then say "${expectedWord}".`;
}

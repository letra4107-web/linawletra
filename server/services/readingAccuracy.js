import { evaluateWord, generateFeedback as generatePhonemeFeedback } from './tagalogPhonetics.js';

const normalizeReadingText = (text = '') =>
  String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*[-â€â€‘â€’â€“â€”]\s*/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const SHORT_TAGALOG_SOUND_ALIASES = {
  a: new Set(['a', 'ah']),
  e: new Set(['e', 'eh']),
  i: new Set(['i', 'ee']),
  o: new Set(['o', 'oh']),
  u: new Set(['u', 'oo']),
};
const TAGALOG_CONSONANTS = new Set('bcdfghjklmnpqrstvwxyz'.split(''));

// Browsers' SpeechRecognition commonly transcribes short Tagalog vowel/CV-syllable
// sounds using English long-vowel spelling ("bi" -> "bee", "ku" -> "koo"). Accept
// those specific spellings as matches for the vowel they stand in for, but only
// when every consonant in the syllable still matches exactly -- a genuinely wrong
// consonant (e.g. "ka" spoken as "ta") must still fail, not get silently upgraded.
const normalizeShortSoundAlias = (expectedWord, spokenWord) => {
  const expected = normalizeReadingText(expectedWord);
  const spoken = normalizeReadingText(spokenWord);
  if (expected.length === 1) {
    return SHORT_TAGALOG_SOUND_ALIASES[expected]?.has(spoken) ? expected : spoken;
  }
  if (expected.length === 2 && TAGALOG_CONSONANTS.has(expected[0]) && SHORT_TAGALOG_SOUND_ALIASES[expected[1]]) {
    const [consonant, vowel] = expected;
    if (spoken[0] === consonant && SHORT_TAGALOG_SOUND_ALIASES[vowel].has(spoken.slice(1))) {
      return expected;
    }
  }
  return spoken;
};

const levenshteinDistance = (a = '', b = '') => {
  const first = normalizeReadingText(a);
  const second = normalizeReadingText(b);
  const rows = first.length + 1;
  const cols = second.length + 1;
  const matrix = Array.from({ length: rows }, (_, row) => [row]);

  for (let col = 1; col < cols; col += 1) matrix[0][col] = col;

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = first[row - 1] === second[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }

  return matrix[first.length][second.length];
};

const wordSimilarity = (expectedWord, spokenWord) => {
  const expected = normalizeReadingText(expectedWord);
  const spoken = normalizeShortSoundAlias(expectedWord, spokenWord);
  if (!expected && !spoken) return 1;
  if (!expected || !spoken) return 0;
  const maxLength = Math.max(expected.length, spoken.length);
  return maxLength === 0 ? 1 : 1 - levenshteinDistance(expected, spoken) / maxLength;
};

const GAP_PENALTY = -0.4;

// Needleman-Wunsch style global alignment: finds the single best-scoring way to pair up
// expectedWords/spokenWords (allowing skips on either side), instead of greedily matching each
// expected word to its best remaining candidate, which lets one bad early match cascade into
// misaligning everything after it.
const alignWordSequences = (expectedWords, spokenWords) => {
  const n = expectedWords.length;
  const m = spokenWords.length;
  const score = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i += 1) score[i][0] = i * GAP_PENALTY;
  for (let j = 1; j <= m; j += 1) score[0][j] = j * GAP_PENALTY;

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const diag = score[i - 1][j - 1] + wordSimilarity(expectedWords[i - 1], spokenWords[j - 1]);
      const up = score[i - 1][j] + GAP_PENALTY;
      const left = score[i][j - 1] + GAP_PENALTY;
      score[i][j] = Math.max(diag, up, left);
    }
  }

  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const diag = i > 0 && j > 0
      ? score[i - 1][j - 1] + wordSimilarity(expectedWords[i - 1], spokenWords[j - 1])
      : -Infinity;
    if (i > 0 && j > 0 && score[i][j] === diag) {
      ops.push({ type: 'match', expectedIndex: i - 1, spokenIndex: j - 1 });
      i -= 1;
      j -= 1;
    } else if (i > 0 && score[i][j] === score[i - 1][j] + GAP_PENALTY) {
      ops.push({ type: 'missing', expectedIndex: i - 1 });
      i -= 1;
    } else {
      ops.push({ type: 'extra', spokenIndex: j - 1 });
      j -= 1;
    }
  }
  return ops.reverse();
};

const getDisplayWords = (text = '') => String(text).split(/\s+/).map((word) => word.trim()).filter(Boolean);

const getSyllables = (word = '') =>
  String(word)
    .split(/[-â€â€‘â€’â€“â€”]+/)
    .map((part) => part.trim())
    .filter(Boolean);

const createKidFeedback = (accuracyScore, practiceParts = []) => {
  if (accuracyScore >= 90) return 'Great job! You read it clearly.';
  if (practiceParts.length) return `Almost there. Try this part again: ${practiceParts.slice(0, 3).join(', ')}.`;
  if (accuracyScore >= 70) return 'Good start. Listen once more, then try again.';
  return 'Try again slowly. Listen first, then read each sound.';
};

const compareReadingText = (expectedText = '', spokenText = '') => {
  const expectedDisplayWords = getDisplayWords(expectedText);
  const expectedWords = normalizeReadingText(expectedText).split(' ').filter(Boolean);
  const spokenWords = normalizeReadingText(spokenText).split(' ').filter(Boolean);
  const incorrectWords = [];
  const missingWords = [];
  const pronunciationIssues = [];
  const checkedWords = [];
  const practiceParts = [];
  const extraWords = [];
  let matched = 0;
  let partial = 0;

  const ops = alignWordSequences(expectedWords, spokenWords);

  ops.forEach((op) => {
    if (op.type === 'extra') {
      extraWords.push(spokenWords[op.spokenIndex]);
      return;
    }

    const expectedIndex = op.expectedIndex;
    const displayWord = expectedDisplayWords[expectedIndex] || expectedWords[expectedIndex];
    const best = op.type === 'match'
      ? { score: wordSimilarity(expectedWords[expectedIndex], spokenWords[op.spokenIndex]), word: spokenWords[op.spokenIndex] }
      : { score: 0, word: '' };

    if (best.score >= 0.82) {
      matched += 1;
      const phoneme = evaluateWord(displayWord, best.word);
      checkedWords.push({ expected: displayWord, spoken: best.word, status: 'correct', score: Math.round(best.score * 100), phoneme });
      if (best.score < 0.96) {
        pronunciationIssues.push({
          expected: displayWord,
          spoken: best.word,
          message: generatePhonemeFeedback(phoneme, displayWord),
        });
      }
      return;
    }

    if (best.score >= 0.55) {
      partial += best.score;
      const phoneme = evaluateWord(displayWord, best.word);
      const missedSyllables = getSyllables(displayWord)
        .filter((part) => !normalizeReadingText(best.word).includes(normalizeReadingText(part)));
      practiceParts.push(...(missedSyllables.length ? missedSyllables : [displayWord]));
      checkedWords.push({ expected: displayWord, spoken: best.word, status: 'practice', score: Math.round(best.score * 100), phoneme });
      incorrectWords.push({ expected: displayWord, spoken: best.word });
      pronunciationIssues.push({
        expected: displayWord,
        spoken: best.word,
        message: generatePhonemeFeedback(phoneme, displayWord),
      });
      return;
    }

    missingWords.push(displayWord);
    practiceParts.push(...(getSyllables(displayWord).length > 1 ? getSyllables(displayWord) : [displayWord]));
    checkedWords.push({ expected: displayWord, spoken: best.word, status: 'missing', score: Math.round(best.score * 100) });
    if (best.word) {
      incorrectWords.push({ expected: displayWord, spoken: best.word });
    }
  });

  const denominator = Math.max(expectedWords.length, spokenWords.length, 1);
  const accuracyScore = Math.max(0, Math.min(100, Math.round(((matched + partial) / denominator) * 100)));

  const wordsWithPhoneme = checkedWords.filter((w) => w.phoneme);
  const phonemeAccuracy = wordsWithPhoneme.length
    ? Math.round(wordsWithPhoneme.reduce((sum, w) => sum + w.phoneme.phonemeAccuracy, 0) / wordsWithPhoneme.length)
    : null;
  const syllableAccuracy = wordsWithPhoneme.length
    ? Math.round(wordsWithPhoneme.reduce((sum, w) => sum + w.phoneme.syllableAccuracy, 0) / wordsWithPhoneme.length)
    : null;
  const confusionTags = [...new Set(wordsWithPhoneme.flatMap((w) => w.phoneme.confusions))];

  return {
    accuracyScore,
    phonemeAccuracy,
    syllableAccuracy,
    confusionTags,
    missingWords,
    incorrectWords,
    extraWords,
    pronunciationIssues,
    checkedWords,
    practiceParts: [...new Set(practiceParts)].slice(0, 6),
    feedback: createKidFeedback(accuracyScore, practiceParts),
  };
};

export {
  compareReadingText,
  normalizeReadingText,
};


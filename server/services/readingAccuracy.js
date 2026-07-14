const normalizeReadingText = (text = '') =>
  String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*[-â€â€‘â€’â€“â€”]\s*/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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
  const spoken = normalizeReadingText(spokenWord);
  if (!expected && !spoken) return 1;
  if (!expected || !spoken) return 0;
  const maxLength = Math.max(expected.length, spoken.length);
  return maxLength === 0 ? 1 : 1 - levenshteinDistance(expected, spoken) / maxLength;
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
  const matchedSpokenIndexes = new Set();
  const incorrectWords = [];
  const missingWords = [];
  const pronunciationIssues = [];
  const checkedWords = [];
  const practiceParts = [];
  let matched = 0;
  let partial = 0;

  expectedWords.forEach((expectedWord, expectedIndex) => {
    const displayWord = expectedDisplayWords[expectedIndex] || expectedWord;
    let best = { index: -1, score: 0, word: '' };

    spokenWords.forEach((spokenWord, spokenIndex) => {
      if (matchedSpokenIndexes.has(spokenIndex)) return;
      const distancePenalty = Math.abs(spokenIndex - expectedIndex) * 0.03;
      const score = Math.max(0, wordSimilarity(expectedWord, spokenWord) - distancePenalty);
      if (score > best.score) {
        best = { index: spokenIndex, score, word: spokenWord };
      }
    });

    if (best.score >= 0.82) {
      matched += 1;
      matchedSpokenIndexes.add(best.index);
      checkedWords.push({ expected: displayWord, spoken: best.word, status: 'correct', score: Math.round(best.score * 100) });
      if (best.score < 0.96) {
        pronunciationIssues.push({
          expected: displayWord,
          spoken: best.word,
          message: `Practice "${displayWord}" again. It sounded like "${best.word}".`,
        });
      }
      return;
    }

    if (best.score >= 0.55) {
      partial += best.score;
      matchedSpokenIndexes.add(best.index);
      const missedSyllables = getSyllables(displayWord)
        .filter((part) => !normalizeReadingText(best.word).includes(normalizeReadingText(part)));
      practiceParts.push(...(missedSyllables.length ? missedSyllables : [displayWord]));
      checkedWords.push({ expected: displayWord, spoken: best.word, status: 'practice', score: Math.round(best.score * 100) });
      incorrectWords.push({ expected: displayWord, spoken: best.word });
      pronunciationIssues.push({
        expected: displayWord,
        spoken: best.word,
        message: `Try "${displayWord}" again.`,
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

  const extraWords = spokenWords.filter((_, index) => !matchedSpokenIndexes.has(index));
  const denominator = Math.max(expectedWords.length, spokenWords.length, 1);
  const accuracyScore = Math.max(0, Math.min(100, Math.round(((matched + partial) / denominator) * 100)));

  return {
    accuracyScore,
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


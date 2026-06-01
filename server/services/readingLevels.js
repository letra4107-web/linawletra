const READING_LEVELS = [
  {
    value: 'beginner',
    label: 'Beginner',
    rank: 1,
    description: 'Short words, syllables, and simple sentences.',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    rank: 2,
    description: 'Longer Tagalog sentences with familiar vocabulary.',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    rank: 3,
    description: 'Paragraph reading, richer vocabulary, and fluency practice.',
  },
];

const VALID_READING_LEVELS = READING_LEVELS.map((level) => level.value);

const normalizeReadingLevel = (value, fallback = 'beginner') => {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_READING_LEVELS.includes(normalized) ? normalized : fallback;
};

const getReadingLevelRank = (value) => {
  const normalized = normalizeReadingLevel(value);
  return READING_LEVELS.find((level) => level.value === normalized)?.rank || 1;
};

module.exports = {
  READING_LEVELS,
  VALID_READING_LEVELS,
  normalizeReadingLevel,
  getReadingLevelRank,
};

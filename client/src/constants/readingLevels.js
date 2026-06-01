export const READING_LEVELS = [
  {
    value: 'beginner',
    label: 'Beginner',
    description: 'Short words, syllables, and simple sentences.',
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'Longer Tagalog sentences with familiar vocabulary.',
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description: 'Paragraph reading, richer vocabulary, and fluency practice.',
  },
];

export const READING_LEVEL_LABELS = READING_LEVELS.reduce((labels, level) => {
  labels[level.value] = level.label;
  return labels;
}, {});

export const normalizeReadingLevel = (value, fallback = 'beginner') => {
  const normalized = String(value || '').trim().toLowerCase();
  return READING_LEVEL_LABELS[normalized] ? normalized : fallback;
};

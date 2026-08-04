// Words needed in the current phonetic level before the next level unlocks.
// Mirrors the threshold used in src/pages/StudentDashboard.js's own progress bar
// (comparePronunciation / phoneticThreshold) — duplicated here since there's no
// shared module between that page and the Parent/Teacher dashboards.
const PHONETIC_LEVEL_THRESHOLD = { Easy: 5, Medium: 3, Hard: 2 };

// Accepts either a Parent-side normalized child (parentDashboardApi.js's
// normalizeChild output, which spreads the raw students row plus a few
// camelCase aliases) or a Teacher-side raw `students` table row (from
// GET /students/all) and maps both into one consistent summary shape for
// StudentOverviewPanel / StudentSelector.
export function normalizeStudentSummary(input = {}) {
  const raw = input.raw || input;
  const user = raw.user || raw.users || input.user || {};
  const name =
    input.name ||
    raw.name ||
    raw.full_name ||
    user.name ||
    user.display_name ||
    user.displayName ||
    user.email ||
    'Student';

  const currentPhoneticLevel =
    input.currentPhoneticLevel || raw.current_phonetic_level || 'Easy';
  const progressInCurrentLevel = Number(
    input.progressInCurrentLevel ?? raw.progress_in_level ?? 0
  );
  const phoneticThreshold = PHONETIC_LEVEL_THRESHOLD[currentPhoneticLevel] || 5;

  return {
    id: input.id ?? input.studentId ?? raw.id ?? raw.student_id,
    name,
    readingLevel: input.readingLevel || raw.reading_level || raw.readingLevel || 'beginner',
    xp: Number(input.xp ?? raw.xp ?? user.xp ?? 0),
    streak: Number(input.streak ?? raw.streak ?? 0),
    longestStreak: Number(input.longestStreak ?? raw.longest_streak ?? 0),
    currentPhoneticLevel,
    progressInCurrentLevel,
    phoneticThreshold,
    progressToNextLevelPercent: Math.min(
      100,
      Math.round((progressInCurrentLevel / phoneticThreshold) * 100)
    ),
    achievements: Number(input.achievements ?? raw.achievements ?? 0),
    wordsCompleted: Number(
      input.wordsCompleted ?? raw.words_completed ?? raw.completed_words?.length ?? 0
    ),
    wordOfDayCompletedDate:
      input.wordOfDayCompletedDate || raw.word_of_day_completed_date || null,
  };
}

export function isWordOfDayDoneToday(wordOfDayCompletedDate) {
  if (!wordOfDayCompletedDate) return false;
  const today = new Date().toISOString().slice(0, 10);
  return String(wordOfDayCompletedDate).slice(0, 10) === today;
}

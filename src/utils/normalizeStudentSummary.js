// Words needed in the current phonetic level before the next level unlocks.
// Mirrors the threshold used in src/pages/StudentDashboard.js's own progress bar
// (comparePronunciation / phoneticThreshold) — duplicated here since there's no
// shared module between that page and the Parent/Teacher dashboards.
const PHONETIC_LEVEL_THRESHOLD = { Easy: 5, Medium: 3, Hard: 2 };
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

const getUtc8DateString = (date = new Date()) =>
  new Date(date.getTime() + UTC8_OFFSET_MS).toISOString().slice(0, 10);

const DAILY_GOAL = 5;

const normalizeHistory = (input = {}) => {
  const raw = input.raw || input;
  const history = input.history ?? raw.history;
  return Array.isArray(history) ? history : [];
};

const toTimestamp = (item = {}) =>
  item.timestamp || item.created_at || item.createdAt || item.completed_at || item.completedAt || item.date || null;

const countWeeklyPracticeDays = (history = []) => {
  const now = Date.now();
  const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
  const days = new Set();
  history.forEach((item) => {
    const rawTimestamp = toTimestamp(item);
    const time = typeof rawTimestamp === 'number' ? rawTimestamp : new Date(rawTimestamp).getTime();
    if (!Number.isFinite(time) || time < weekAgo) return;
    days.add(getUtc8DateString(new Date(time)));
  });
  return days.size;
};

const sumAccuracy = (history = []) =>
  history.reduce((sum, item) => sum + (Number(item?.score ?? item?.accuracy ?? item?.accuracy_percentage ?? 0) || 0), 0);

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
  const history = normalizeHistory(input);
  const totalAttempts = Number(
    input.totalAttempts ?? raw.total_attempts ?? raw.totalAttempts ?? history.length ?? 0
  );
  const accuracySum = Number(
    input.accuracySum ?? raw.accuracy_sum ?? raw.accuracySum ?? sumAccuracy(history)
  );
  const allTimeAccuracy = totalAttempts > 0
    ? Math.round(accuracySum / totalAttempts)
    : Number(input.accuracy ?? raw.accuracy ?? 0);
  const activitiesCompleted = Number(
    input.activitiesCompleted ?? raw.activities_completed ?? raw.completedLessons ?? raw.completed_lessons ?? raw.completed ?? 0
  );

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
    totalAttempts,
    accuracySum,
    allTimeAccuracy,
    dailyGoalDone: Math.min(totalAttempts % DAILY_GOAL, DAILY_GOAL),
    dailyGoalTarget: DAILY_GOAL,
    weeklyPracticeDays: Number(input.weeklyPracticeDays ?? raw.weekly_practice_days ?? countWeeklyPracticeDays(history)),
    activitiesCompleted,
    lessonsCompleted: activitiesCompleted,
    achievements: Number(input.achievements ?? raw.achievements ?? input.unlockedAchievementIds?.length ?? raw.unlocked_achievement_ids?.length ?? 0),
    wordsCompleted: Number(
      input.wordsCompleted ?? raw.words_completed ?? raw.completed_words?.length ?? 0
    ),
    wordOfDayCompletedDate:
      input.wordOfDayCompletedDate || raw.word_of_day_completed_date || null,
  };
}

export function isWordOfDayDoneToday(wordOfDayCompletedDate) {
  if (!wordOfDayCompletedDate) return false;
  const today = getUtc8DateString();
  return String(wordOfDayCompletedDate).slice(0, 10) === today;
}

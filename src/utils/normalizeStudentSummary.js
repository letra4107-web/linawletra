// Words needed in the current phonetic level before the next level unlocks.
// Mirrors the threshold used in src/pages/StudentDashboard.js's own progress bar
// (comparePronunciation / phoneticThreshold) — duplicated here since there's no
// shared module between that page and the Parent/Teacher dashboards.
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

const getUtc8DateString = (date = new Date()) =>
  new Date(date.getTime() + UTC8_OFFSET_MS).toISOString().slice(0, 10);

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

// Accepts either a Parent-side normalized child (parentDashboardApi.js's
// normalizeChild output, which spreads the raw students row plus a few
// camelCase aliases) or a Teacher-side raw `students` table row (from
// GET /students/all) and maps both into one consistent summary shape for
// StudentOverviewPanel / StudentSelector.
export function normalizeStudentSummary(input = {}) {
  const source = input.stats ? { ...input, ...input.stats } : input;
  const raw = source.raw || source;
  const user = raw.user || raw.users || source.user || {};
  const name =
    source.name ||
    raw.name ||
    raw.full_name ||
    user.name ||
    user.display_name ||
    user.displayName ||
    user.email ||
    'Student';

  const currentPhoneticLevel =
    source.progress?.currentLevel || source.currentPhoneticLevel || raw.current_phonetic_level || 'Easy';
  const progressInCurrentLevel = Number(
    source.progress?.completed ?? source.progressInCurrentLevel ?? raw.progress_in_level ?? 0
  );
  const phoneticThreshold = Number(source.progress?.required ?? raw.progress?.required ?? 0);
  const history = normalizeHistory(source);
  const totalAttempts = Number(
    source.totalAttempts ?? raw.total_attempts ?? raw.totalAttempts ?? history.length ?? 0
  );
  const accuracySum = Number(
    source.accuracySum ?? raw.accuracy_sum ?? raw.accuracySum ?? 0
  );
  const allTimeAccuracy = Number(source.accuracy ?? raw.accuracy ?? 0);
  const activitiesCompleted = Number(
    source.activitiesCompleted ?? raw.activities_completed ?? raw.completedLessons ?? raw.completed_lessons ?? raw.completed ?? 0
  );

  return {
    id: source.id ?? source.studentId ?? raw.id ?? raw.student_id,
    name,
    readingLevel: source.readingLevel || raw.reading_level || raw.readingLevel || 'beginner',
    xp: Number(source.xp ?? raw.xp ?? user.xp ?? 0),
    streak: Number(source.streak ?? raw.streak ?? 0),
    longestStreak: Number(source.longestStreak ?? raw.longest_streak ?? 0),
    currentPhoneticLevel,
    progressInCurrentLevel,
    phoneticThreshold,
    progressToNextLevelPercent: Number(source.progress?.percentage ?? raw.progress?.percentage ?? 0),
    totalAttempts,
    accuracySum,
    allTimeAccuracy,
    dailyGoalDone: Number(source.dailyGoal?.completed ?? raw.dailyGoal?.completed ?? 0),
    dailyGoalTarget: Number(source.dailyGoal?.target ?? raw.dailyGoal?.target ?? 0),
    weeklyPracticeDays: Number(source.weeklyPracticeDays ?? raw.weekly_practice_days ?? countWeeklyPracticeDays(history)),
    activitiesCompleted,
    lessonsCompleted: activitiesCompleted,
    achievements: Number(source.achievements ?? raw.achievements ?? source.unlockedAchievementIds?.length ?? raw.unlocked_achievement_ids?.length ?? 0),
    wordsCompleted: Number(
      source.wordsCompleted ?? raw.words_completed ?? raw.completed_words?.length ?? 0
    ),
    wordOfDayCompletedDate:
      source.wordOfDayCompletedDate || raw.word_of_day_completed_date || source.wordOfTheDay?.completedAt || null,
  };
}

export function isWordOfDayDoneToday(wordOfDayCompletedDate) {
  if (!wordOfDayCompletedDate) return false;
  const today = getUtc8DateString();
  return String(wordOfDayCompletedDate).slice(0, 10) === today;
}

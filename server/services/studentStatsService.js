import { supabase } from '../config/supabase.js';
import { ACHIEVEMENT_RULES, DAILY_GOAL, PHONETIC_LEVEL_REQUIREMENTS } from '../config/progressConfig.js';
import { resolveStudent } from '../utils/studentAccess.js';

const MISSING_TABLE_CODES = new Set(['PGRST205', 'PGRST204', '42P01', '42703']);

const numberOr = (value, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const arrayOrEmpty = (value) => (Array.isArray(value) ? value : []);

const toTimestamp = (item = {}) =>
  item.completed_at || item.completedAt || item.updated_at || item.updatedAt || item.created_at || item.createdAt || item.timestamp || item.date || null;

const sortByRecent = (items = []) =>
  [...items].sort((a, b) => {
    const aTime = new Date(toTimestamp(a) || 0).getTime();
    const bTime = new Date(toTimestamp(b) || 0).getTime();
    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });

const safeSelect = async (table, buildQuery) => {
  const result = await buildQuery(supabase.from(table));
  if (result.error) {
    if (MISSING_TABLE_CODES.has(result.error.code)) {
      return [];
    }
    throw result.error;
  }
  return result.data || [];
};

const safeMaybeSingle = async (table, buildQuery) => {
  const result = await buildQuery(supabase.from(table));
  if (result.error) {
    if (MISSING_TABLE_CODES.has(result.error.code) || result.error.code === 'PGRST116') {
      return null;
    }
    throw result.error;
  }
  return result.data || null;
};

const getStudentProfile = async (student) => {
  if (!student?.user_id) return null;
  return safeMaybeSingle('users', (query) =>
    query.select('id,name,email,role,status,metadata,created_at,updated_at').eq('id', student.user_id).maybeSingle()
  );
};

const resolveChildProgress = async (student) => {
  let child = null;
  const childLookups = [
    student.child_id ? { column: 'id', value: student.child_id } : null,
    student.id ? { column: 'student_id', value: student.id } : null,
    student.user_id ? { column: 'auth_uid', value: student.user_id } : null,
  ].filter(Boolean);

  for (const lookup of childLookups) {
    child = await safeMaybeSingle('children', (query) =>
      query.select('*').eq(lookup.column, lookup.value).maybeSingle()
    );
    if (child) break;
  }

  const childIds = [child?.id, student.child_id, student.id, student.user_id].filter(Boolean);
  if (!childIds.length) return { child, childProgress: null };

  const childProgress = await safeMaybeSingle('child_progress', (query) =>
    query.select('*').in('child_id', childIds).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  );

  return { child, childProgress };
};

const buildRecentActivity = ({ history, attempts, lessons, curriculum }) => {
  const historyActivity = arrayOrEmpty(history).map((entry, index) => ({
    id: entry.id || `history-${index}`,
    activityType: entry.activityType || entry.activity_type || 'pronunciation_practice',
    lessonTitle: entry.lessonTitle || entry.lesson_name || entry.word || entry.target || 'Reading practice',
    score: entry.score ?? entry.accuracy ?? entry.accuracy_percentage ?? null,
    completedAt: toTimestamp(entry),
  }));

  const attemptActivity = arrayOrEmpty(attempts).map((entry) => ({
    id: entry.id,
    activityType: entry.activity_type || 'reading_attempt',
    lessonTitle: entry.word_target || entry.expected_text || entry.sentence || 'Reading practice',
    score: entry.accuracy_score,
    completedAt: entry.completed_at,
  }));

  const lessonActivity = arrayOrEmpty(lessons).map((entry) => ({
    id: entry.id,
    activityType: 'lesson',
    lessonTitle: entry.lesson_title || entry.title || 'Lesson',
    status: entry.status,
    score: entry.score,
    completedAt: toTimestamp(entry),
  }));

  const curriculumActivity = arrayOrEmpty(curriculum).map((entry) => ({
    id: entry.id,
    activityType: 'curriculum',
    lessonTitle: entry.curriculum_items?.content || 'Curriculum practice',
    score: entry.best_accuracy,
    completedAt: toTimestamp(entry),
  }));

  return sortByRecent([...attemptActivity, ...lessonActivity, ...curriculumActivity, ...historyActivity]).slice(0, 10);
};

const buildBadges = async (student, stats, childProgress = null) => {
  const storedIds = [
    ...arrayOrEmpty(student.unlocked_achievement_ids),
    ...arrayOrEmpty(student.badges).map((badge) => (typeof badge === 'string' ? badge : badge?.id)).filter(Boolean),
    ...arrayOrEmpty(childProgress?.achievements).map((badge) => (typeof badge === 'string' ? badge : badge?.id)).filter(Boolean),
    ...arrayOrEmpty(childProgress?.badges).map((badge) => (typeof badge === 'string' ? badge : badge?.id)).filter(Boolean),
  ];
  const nextIds = new Set(storedIds);

  ACHIEVEMENT_RULES.forEach((rule) => {
    if (rule.check(stats)) nextIds.add(rule.id);
  });

  const unlockedAchievementIds = [...nextIds];
  if (student.id && unlockedAchievementIds.length !== storedIds.length) {
    await supabase
      .from('students')
      .update({
        unlocked_achievement_ids: unlockedAchievementIds,
        badges: unlockedAchievementIds,
        achievements: unlockedAchievementIds.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', student.id);
  }

  return unlockedAchievementIds.map((id) => ({ id, unlocked: true }));
};

export const getStudentStats = async (studentIdOrUserId) => {
  const student = await resolveStudent(studentIdOrUserId);
  if (!student) return null;

  const { child, childProgress } = await resolveChildProgress(student);
  const progressStudentIds = [...new Set([student.id, student.user_id, student.child_id, child?.id].filter(Boolean))];

  const [profile, attempts, lessons, curriculum, mastery, confusions, notifications] = await Promise.all([
    getStudentProfile(student),
    safeSelect('reading_attempts', (query) =>
      query.select('*').in('student_id', progressStudentIds).order('completed_at', { ascending: false }).limit(500)
    ),
    safeSelect('lesson_progress', (query) =>
      query.select('*').in('student_id', progressStudentIds).order('updated_at', { ascending: false }).limit(500)
    ),
    safeSelect('curriculum_progress', (query) =>
      query.select('*, curriculum_items(content)').in('student_id', progressStudentIds).order('updated_at', { ascending: false }).limit(500)
    ),
    safeSelect('word_mastery', (query) =>
      query.select('word, mastery_status, avg_phoneme_accuracy, avg_syllable_accuracy, last_attempt_at').in('student_id', progressStudentIds)
    ),
    safeSelect('confusion_patterns', (query) =>
      query.select('pattern_type, occurrence_count').in('student_id', progressStudentIds).order('occurrence_count', { ascending: false }).limit(5)
    ),
    safeSelect('notifications', (query) =>
      query.select('*').in('user_id', [student.user_id, student.id].filter(Boolean)).order('created_at', { ascending: false }).limit(20)
    ),
  ]);

  const history = arrayOrEmpty(student.history);
  const completedWords = [
    ...arrayOrEmpty(student.completed_words),
    ...arrayOrEmpty(childProgress?.completed_words),
  ].filter((word, index, list) => word && list.indexOf(word) === index);
  const completedLessons = lessons.filter((row) => String(row.status || '').toLowerCase() === 'completed').length;
  const completedCurriculum = curriculum.filter((row) => row.completed_at || row.is_completed || row.status === 'completed').length;
  const attemptScores = attempts.map((attempt) => numberOr(attempt.accuracy_score, null)).filter((score) => score != null);
  const historyScores = history.map((entry) => numberOr(entry.score ?? entry.accuracy ?? entry.accuracy_percentage, null)).filter((score) => score != null);
  const allScores = attemptScores.length ? attemptScores : historyScores;

  const mobileTotalAttempts = numberOr(childProgress?.total_attempts ?? student.total_attempts, 0);
  const totalAttempts = Math.max(mobileTotalAttempts, attempts.length, history.length);
  const calculatedAccuracySum = allScores.reduce((sum, score) => sum + score, 0);
  const accuracySum = numberOr(childProgress?.accuracy_sum ?? student.accuracy_sum, calculatedAccuracySum || numberOr(student.accuracy, 0) * totalAttempts);
  const correctAttempts = attempts.length
    ? attempts.filter((attempt) => numberOr(attempt.accuracy_score, 0) >= 80).length
    : history.filter((entry) => Boolean(entry.correct) || numberOr(entry.score ?? entry.accuracy, 0) >= 80).length;
  const accuracy = totalAttempts > 0 ? Math.round(accuracySum / totalAttempts) : numberOr(student.accuracy, 0);
  const activitiesCompleted = Math.max(
    numberOr(childProgress?.activities_completed ?? student.activities_completed, 0),
    numberOr(student.completed, 0),
    completedLessons + completedCurriculum
  );
  const currentLevel = student.current_phonetic_level || childProgress?.current_level || 'Easy';
  const required = PHONETIC_LEVEL_REQUIREMENTS[currentLevel] || DAILY_GOAL;
  const completed = Math.min(numberOr(student.progress_in_level ?? childProgress?.progress_in_level, 0), required);
  const wordsCompleted = Math.max(
    numberOr(student.words_completed, 0),
    numberOr(childProgress?.word_count, 0),
    completedWords.length,
    mastery.filter((row) => row.mastery_status === 'mastered').length
  );
  const recentActivity = buildRecentActivity({ history, attempts, lessons, curriculum });
  const wordOfTheDayDate = student.word_of_day_completed_date || childProgress?.word_of_day_completed_date || null;
  const lastActivityAt = toTimestamp(recentActivity[0]) || student.last_practice_date || student.updated_at || null;

  const statsBase = {
    studentId: student.id,
    childId: child?.id || student.child_id || null,
    userId: student.user_id,
    parentId: student.parent_id,
    teacherId: student.teacher_id,
    name: profile?.name || profile?.metadata?.displayName || student.name || profile?.email || 'Student',
    email: profile?.email || '',
    xp: numberOr(childProgress?.xp ?? student.xp, 0),
    level: student.reading_level || childProgress?.level || student.practice_level || 'beginner',
    practiceLevel: student.practice_level || student.reading_level || 'beginner',
    streak: numberOr(childProgress?.streak ?? student.streak, 0),
    longestStreak: numberOr(childProgress?.longest_streak ?? student.longest_streak ?? student.streak, 0),
    totalAttempts,
    total_attempts: totalAttempts,
    correctAttempts,
    correct_attempts: correctAttempts,
    accuracySum,
    accuracy_sum: accuracySum,
    accuracy,
    activitiesCompleted,
    activities_completed: activitiesCompleted,
    completed: activitiesCompleted,
    wordsCompleted,
    words_completed: wordsCompleted,
    completedWords,
    completed_words: completedWords,
    lessonsCompleted: completedLessons,
    lessons_completed: completedLessons,
    baselineAccuracy: childProgress?.baseline_accuracy ?? student.baseline_accuracy ?? null,
    baseline_accuracy: childProgress?.baseline_accuracy ?? student.baseline_accuracy ?? null,
    dailyGoal: {
      target: DAILY_GOAL,
      completed: Math.min(totalAttempts % DAILY_GOAL, DAILY_GOAL),
      percentage: DAILY_GOAL > 0 ? Math.round((Math.min(totalAttempts % DAILY_GOAL, DAILY_GOAL) / DAILY_GOAL) * 100) : 0,
    },
    wordOfTheDay: {
      completed: Boolean(wordOfTheDayDate && String(wordOfTheDayDate).slice(0, 10) === new Date().toISOString().slice(0, 10)),
      completedAt: wordOfTheDayDate,
    },
    wordOfDayCompletedDate: wordOfTheDayDate,
    word_of_day_completed_date: wordOfTheDayDate,
    progress: {
      currentLevel,
      completed,
      required,
      percentage: required > 0 ? Math.round((completed / required) * 100) : 0,
    },
    currentPhoneticLevel: currentLevel,
    current_phonetic_level: currentLevel,
    progressInCurrentLevel: completed,
    progress_in_level: completed,
    highestPhoneticLevel: student.highest_phonetic_level || currentLevel,
    highest_phonetic_level: student.highest_phonetic_level || currentLevel,
    hardCyclesCompleted: numberOr(student.hard_cycles_completed, 0),
    hard_cycles_completed: numberOr(student.hard_cycles_completed, 0),
    hadStreakBreak: Boolean(student.had_streak_break),
    had_streak_break: Boolean(student.had_streak_break),
    recentActivity,
    recentActivities: recentActivity,
    history,
    wordMastery: {
      mastered: mastery.filter((row) => row.mastery_status === 'mastered').length,
      needsPractice: mastery.filter((row) => row.mastery_status === 'needs_practice').length,
      difficult: mastery.filter((row) => row.mastery_status === 'difficult').length,
    },
    wordMasteryDetail: {
      mastered: mastery.filter((row) => row.mastery_status === 'mastered'),
      needsPractice: mastery.filter((row) => row.mastery_status === 'needs_practice'),
      difficult: mastery.filter((row) => row.mastery_status === 'difficult'),
    },
    topConfusions: confusions,
    notifications,
    lastActivityAt,
    totalLessons: lessons.length,
  };

  const badges = await buildBadges(student, statsBase, childProgress);
  return {
    ...statsBase,
    badges,
    unlockedAchievementIds: badges.map((badge) => badge.id),
    unlocked_achievement_ids: badges.map((badge) => badge.id),
    achievements: badges.length,
  };
};

export const getManyStudentStats = async (studentIds = []) => {
  const uniqueIds = [...new Set(studentIds.filter(Boolean))];
  return (await Promise.all(uniqueIds.map((id) => getStudentStats(id).catch((error) => {
    console.warn('[StudentStats] Failed to build stats:', id, error.message);
    return null;
  })))).filter(Boolean);
};

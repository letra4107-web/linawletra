import { studentService, progressService, readingService, userService, curriculumService } from './api';

const unwrapStudents = (payload) => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.students)) return data.students;
  if (Array.isArray(data?.data?.students)) return data.data.students;
  return [];
};

const isGenericStudentName = (value) =>
  ['student', 'child', 'learner'].includes(String(value || '').trim().toLowerCase());

const firstRealName = (...values) => {
  const real = values.find((value) => {
    const text = String(value || '').trim();
    return text && !isGenericStudentName(text);
  });
  return real || values.find((value) => String(value || '').trim()) || '';
};

const normalizeChild = (child = {}) => {
  const user = child.user || child.users || child.student || child.profile || {};
  const metadata = user.metadata || child.metadata || {};
  const raw = child.raw || {};
  const rawUser = raw.user || raw.users || {};
  const rawMetadata = rawUser.metadata || raw.metadata || {};
  const id = child.id || child.student_id || child._id;
  const userId = child.user_id || user.id || child.uid || id;
  const name = firstRealName(
    child.name,
    child.full_name,
    user.name,
    user.displayName,
    user.display_name,
    metadata.displayName,
    raw.name,
    raw.full_name,
    rawUser.name,
    rawUser.displayName,
    rawUser.display_name,
    rawMetadata.displayName,
    [metadata.firstName || user.first_name, metadata.lastName || user.last_name].filter(Boolean).join(' '),
    [rawMetadata.firstName || rawUser.first_name, rawMetadata.lastName || rawUser.last_name].filter(Boolean).join(' '),
    child.email,
    user.email,
    rawUser.email,
    'Child'
  );

  return {
    ...child,
    id,
    studentId: id,
    userId,
    name,
    email: child.email || user.email || '',
    grade: child.grade || child.gradeLevel || child.grade_level || child.class || '',
    gradeLevel: child.gradeLevel || child.grade_level || child.grade || '',
    readingLevel: child.readingLevel || child.reading_level || child.level || '',
    progressPercentage: child.progressPercentage ?? child.progress_percentage ?? metadata.progressPercentage ?? child.progress ?? 0,
    wordsCompleted: child.wordsCompleted ?? child.words_completed ?? metadata.wordsCompleted ?? metadata.completedWords?.length ?? 0,
    completedWords: child.completedWords ?? child.completed_words ?? metadata.completedWords ?? [],
    completedLessons: child.completedLessons ?? child.completed_lessons ?? child.lessonCompletions ?? child.lesson_completions ?? metadata.completedLessons ?? 0,
    accuracy: child.accuracy ?? child.progress_accuracy ?? metadata.accuracy ?? null,
    xp: child.xp ?? user.xp ?? metadata.xp ?? 0,
    streak: child.streak ?? metadata.streak ?? 0,
    longestStreak: child.longestStreak ?? child.longest_streak ?? metadata.longestStreak ?? 0,
    achievements: child.achievements ?? metadata.achievements ?? 0,
    unlockedAchievementIds: child.unlockedAchievementIds ?? child.unlocked_achievement_ids ?? metadata.unlockedAchievementIds ?? [],
    history: child.history ?? metadata.history ?? [],
    totalAttempts: child.totalAttempts ?? child.total_attempts ?? metadata.totalAttempts,
    accuracySum: child.accuracySum ?? child.accuracy_sum ?? metadata.accuracySum,
    activitiesCompleted: child.activitiesCompleted ?? child.activities_completed ?? child.completedLessons ?? child.completed_lessons ?? child.completed ?? 0,
    baselineAccuracy: child.baselineAccuracy ?? child.baseline_accuracy ?? metadata.baselineAccuracy,
    lastPracticeDate: child.lastPracticeDate ?? child.last_practice_date ?? child.last_login_date ?? metadata.lastPracticeDate,
    currentPhoneticLevel: child.currentPhoneticLevel ?? child.current_phonetic_level ?? metadata.currentPhoneticLevel ?? 'Easy',
    progressInCurrentLevel: child.progressInCurrentLevel ?? child.progress_in_level ?? metadata.progressInCurrentLevel ?? 0,
    wordOfDayCompletedDate: child.wordOfDayCompletedDate ?? child.word_of_day_completed_date ?? metadata.wordOfDayCompletedDate ?? null,
    raw: child,
  };
};

export const parentDashboardApi = {
  getDashboard: async () => {
    try {
      const res = await studentService.getStudents();
      const children = await Promise.all(
        unwrapStudents(res).map(async (child) => {
          const normalized = normalizeChild(child);
          try {
            const statsRes = await progressService.getCanonicalStats(normalized.studentId);
            const stats = statsRes?.data?.data ?? statsRes?.data ?? {};
            return normalizeChild({
              ...normalized,
              ...stats,
              name: firstRealName(normalized.name, stats.name),
              user: normalized.user || normalized.raw?.user,
              raw: normalized.raw || normalized,
            });
          } catch {
            return normalized;
          }
        })
      );
      return {
        childCount: children.length,
        children,
      };
    } catch (e) {
      return {};
    }
  },

  getChildren: async () => {
    try {
      const res = await studentService.getStudents();
      return Promise.all(
        unwrapStudents(res).map(async (child) => {
          const normalized = normalizeChild(child);
          try {
            const statsRes = await progressService.getCanonicalStats(normalized.studentId);
            const stats = statsRes?.data?.data ?? statsRes?.data ?? {};
            return normalizeChild({
              ...normalized,
              ...stats,
              name: firstRealName(normalized.name, stats.name),
              user: normalized.user || normalized.raw?.user,
              raw: normalized.raw || normalized,
            });
          } catch {
            return normalized;
          }
        })
      );
    } catch (e) {
      return [];
    }
  },

  getProgressByChildId: async (childId) => {
    try {
      const [studentRes, dashboardRes] = await Promise.all([
        studentService.getStudentDashboard(childId),
        progressService.getCanonicalStats(childId),
      ]);
      const studentData = studentRes?.data?.data ?? studentRes?.data ?? {};
      const dashboardData = dashboardRes?.data?.data ?? dashboardRes?.data ?? {};
      const rawStudent = studentData.student || studentData || {};
      const student = normalizeChild({
        ...rawStudent,
        ...(dashboardData || {}),
        name: firstRealName(rawStudent.name, dashboardData?.name),
        raw: rawStudent,
      });
      return {
        ...dashboardData,
        student,
      };
    } catch (e) {
      return {};
    }
  },

  getActivitiesByChildId: async (childId) => {
    try {
      const res = await progressService.getCanonicalStats(childId);
      const stats = res?.data?.data ?? res?.data ?? {};
      return stats.recentActivities || stats.recentActivity || [];
    } catch (e) {
      return [];
    }
  },

  getNotifications: async () => {
    return [];
  },

  getReportByChildId: async (childId) => {
    const res = await studentService.getStudentReport(childId);
    return res?.data?.report || res?.data || null;
  },

  downloadReportPdf: async (childId) => studentService.downloadStudentReportPdf(childId),

  getModulesByChildId: async (childId, level = 'beginner') => {
    const res = await curriculumService.getModules({ studentId: childId, level });
    return res?.data?.modules || res?.data?.data?.modules || [];
  },

  getSettings: async () => {
    const res = await userService.getProfile();
    return res?.data?.user || res?.data || null;
  },

  updateSettings: async (payload) => {
    const res = await userService.updateProfile(payload);
    return res?.data?.user || res?.data || null;
  },

  getWordMastery: async (childId) => {
    try {
      const res = await readingService.getWordMastery(childId);
      return res?.data || res || null;
    } catch (e) {
      return null;
    }
  },

  getConfusionPatterns: async (childId) => {
    try {
      const res = await readingService.getConfusionPatterns(childId);
      return res?.data?.patterns || res?.patterns || [];
    } catch (e) {
      return [];
    }
  },

  getPracticeRecommendations: async (childId) => {
    try {
      const res = await readingService.getPracticeRecommendations(childId);
      return res?.data?.words || res?.words || [];
    } catch (e) {
      return [];
    }
  },
};


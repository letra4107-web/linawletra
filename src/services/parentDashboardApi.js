import { studentService, progressService, readingService } from './api';

const unwrapStudents = (payload) => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.students)) return data.students;
  if (Array.isArray(data?.data?.students)) return data.data.students;
  return [];
};

const normalizeChild = (child = {}) => {
  const user = child.user || child.users || child.student || child.profile || {};
  const metadata = user.metadata || child.metadata || {};
  const id = child.id || child.student_id || child._id;
  const userId = child.user_id || user.id || child.uid || id;
  const name =
    child.name ||
    child.full_name ||
    user.name ||
    user.displayName ||
    user.display_name ||
    metadata.displayName ||
    [metadata.firstName || user.first_name, metadata.lastName || user.last_name].filter(Boolean).join(' ') ||
    child.email ||
    user.email ||
    'Child';

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
    completedLessons: child.completedLessons ?? child.completed_lessons ?? metadata.completedLessons ?? metadata.wordsCompleted ?? child.completed ?? 0,
    accuracy: child.accuracy ?? child.progress_accuracy ?? metadata.accuracy ?? null,
    xp: child.xp ?? user.xp ?? metadata.xp ?? 0,
    raw: child,
  };
};

export const parentDashboardApi = {
  getDashboard: async () => {
    try {
      const res = await studentService.getStudents();
      const children = unwrapStudents(res).map(normalizeChild);
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
      return unwrapStudents(res).map(normalizeChild);
    } catch (e) {
      return [];
    }
  },

  getProgressByChildId: async (childId) => {
    try {
      const res = await studentService.getStudentDashboard(childId);
      const data = res?.data?.data ?? res?.data ?? {};
      const student = data.student ? normalizeChild(data.student) : null;
      return {
        ...data,
        student,
      };
    } catch (e) {
      return {};
    }
  },

  getActivitiesByChildId: async (childId) => {
    try {
      const res = await progressService.getProgressByStudent(childId);
      return Array.isArray(res?.data) ? res.data : [];
    } catch (e) {
      return [];
    }
  },

  getNotifications: async () => {
    return [];
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


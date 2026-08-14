import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { createStudent,
  getStudentsByParent,
  getStudent,
  findStudentByIdOrUserId,
  ensureStudentRecordForAuthenticatedUser,
  updateStudent,
  deleteStudent, } from '../controllers/studentController.js';
import { supabase } from '../config/supabase.js';
import { canAccessStudentResolved, getVisibleStudentIds } from '../utils/studentAccess.js';
import { getManyStudentStats, getStudentStats } from '../services/studentStatsService.js';
import { createSimplePdf } from '../utils/simplePdf.js';

const router = express.Router();

const attachUserProfiles = async (supabase, students = []) => {
  const safeStudents = Array.isArray(students) ? students : [];
  const userIds = [...new Set(safeStudents.map((student) => student.user_id).filter(Boolean))];

  if (!userIds.length) {
    return safeStudents.map((student) => ({ ...student, user: null }));
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .in('id', userIds);

  if (error) {
    console.warn('[Students Route] Could not attach user profiles:', error.message);
    return safeStudents.map((student) => ({ ...student, user: null }));
  }

  const usersById = new Map((users || []).map((user) => [user.id, user]));
  return safeStudents.map((student) => ({
    ...student,
    user: usersById.get(student.user_id) || null,
  }));
};

const safeSelectRows = async (table, buildQuery) => {
  const result = await buildQuery(supabase.from(table));
  if (result.error) {
    if (['PGRST205', 'PGRST204', '42P01', '42703'].includes(result.error.code)) return [];
    throw result.error;
  }
  return result.data || [];
};

const attachChildProfiles = async (students = []) => {
  const safeStudents = Array.isArray(students) ? students : [];
  if (!safeStudents.length) return safeStudents;

  const studentIds = [...new Set(safeStudents.map((student) => student.id).filter(Boolean))];
  const userIds = [...new Set(safeStudents.map((student) => student.user_id).filter(Boolean))];
  const directChildIds = [...new Set(safeStudents.map((student) => student.child_id).filter(Boolean))];

  const mapRows = studentIds.length
    ? await safeSelectRows('students_children_map', (query) =>
      query.select('student_id,child_id').in('student_id', studentIds)
    )
    : [];

  const mappedChildIds = mapRows.map((row) => row.child_id).filter(Boolean);
  const childIds = [...new Set([...directChildIds, ...mappedChildIds])];
  const childRows = [];

  if (childIds.length) {
    childRows.push(...await safeSelectRows('children', (query) =>
      query.select('*').in('id', childIds)
    ));
  }

  if (studentIds.length) {
    childRows.push(...await safeSelectRows('children', (query) =>
      query.select('*').in('student_id', studentIds)
    ));
  }

  if (userIds.length) {
    childRows.push(...await safeSelectRows('children', (query) =>
      query.select('*').in('auth_uid', userIds)
    ));
  }

  const childrenById = new Map();
  const childrenByStudentId = new Map();
  const childrenByAuthUid = new Map();
  childRows.forEach((child) => {
    if (child.id) childrenById.set(child.id, child);
    if (child.student_id) childrenByStudentId.set(child.student_id, child);
    if (child.auth_uid) childrenByAuthUid.set(child.auth_uid, child);
  });

  const childIdByStudentId = new Map(mapRows.map((row) => [row.student_id, row.child_id]));

  return safeStudents.map((student) => {
    const childId = student.child_id || childIdByStudentId.get(student.id);
    const child =
      (childId ? childrenById.get(childId) : null) ||
      childrenByStudentId.get(student.id) ||
      childrenByAuthUid.get(student.user_id) ||
      null;

    return {
      ...student,
      child_id: student.child_id || child?.id || null,
      child,
    };
  });
};

const getDisplayName = (profile = {}, student = {}) => {
  const metadata = profile?.metadata || student?.metadata || {};
  const child = student?.child || {};
  return (
    profile?.name ||
    student?.name ||
    child.name ||
    child.display_name ||
    child.full_name ||
    child.metadata?.displayName ||
    metadata.displayName ||
    [metadata.firstName, metadata.lastName].filter(Boolean).join(' ') ||
    profile?.email ||
    'Unknown student'
  );
};

const getStudentStatus = (profile = {}, student = {}) => {
  const accountStatus = String(profile?.account_status || profile?.status || student?.status || '').toLowerCase();
  if (['disabled', 'inactive', 'blocked', 'archived', 'deleted'].includes(accountStatus)) return accountStatus;
  if (profile?.is_active === false) return 'disabled';
  return accountStatus || 'active';
};

const normalizeStudentForTeacher = (student = {}, stats = null) => {
  const profile = student.user || {};
  const metadata = profile.metadata || {};
  const badges = stats?.unlockedAchievementIds || stats?.unlocked_achievement_ids || student.unlocked_achievement_ids || student.badges || [];
  const badgeIds = Array.isArray(badges)
    ? badges.map((badge) => (typeof badge === 'string' ? badge : badge?.id)).filter(Boolean)
    : [];
  const profileName = getDisplayName(profile, student);
  const statsName = stats?.name && stats.name !== 'Student' ? stats.name : null;

  return {
    ...student,
    id: student.id,
    studentId: student.id,
    userId: student.user_id || null,
    childId: stats?.childId || student.child_id || student.child?.id || null,
    parentId: student.parent_id || null,
    teacherId: student.teacher_id || null,
    name: profileName !== 'Unknown student' ? profileName : statsName || profileName,
    email: profile.email || stats?.email || student.child?.username || null,
    grade: student.grade_level || student.child?.grade_level || metadata.gradeLevel || metadata.grade_level || '',
    gradeLevel: student.grade_level || student.child?.grade_level || metadata.gradeLevel || metadata.grade_level || '',
    status: getStudentStatus(profile, student),
    score: stats?.progress?.percentage ?? student.progress_in_level ?? student.accuracy ?? 0,
    accuracy: stats?.accuracy ?? student.accuracy ?? 0,
    tier: stats?.level || student.reading_level || student.practice_level || metadata.readingLevel || 'beginner',
    readingLevel: stats?.level || student.reading_level || student.practice_level || metadata.readingLevel || 'beginner',
    badgeCount: badgeIds.length,
    unlockedAchievementIds: badgeIds,
    lastActivityAt: stats?.lastActivityAt || student.last_practice_date || student.updated_at || null,
    stats,
  };
};

// Create student (Enroll child)
// Note: endpoint kept as POST /api/students to match existing frontend axios service.
router.post('/', authMiddleware, roleMiddleware('parent'), createStudent);
router.post('/enroll', authMiddleware, roleMiddleware('parent'), createStudent);


// Get all students for parent
router.get('/', authMiddleware, roleMiddleware('parent'), getStudentsByParent);

// Get all students (for teachers/admins)
router.get('/all', authMiddleware, roleMiddleware('teacher', 'admin'), async (req, res) => {
  try {
    const visibleStudentIds = await getVisibleStudentIds(req);
    let query = supabase.from('students').select('*');

    if (req.user.role !== 'admin') {
      if (!visibleStudentIds.length) {
        return res.json([]);
      }
      query = query.in('id', visibleStudentIds);
    }

    const { data: students, error } = await query;

    if (error) {
      console.error('[Get All Students] Error:', error);
      throw error;
    }

    const studentsWithProfiles = await attachChildProfiles(await attachUserProfiles(supabase, students || []));
    const statsRows = await getManyStudentStats(studentsWithProfiles.map((student) => student.id));
    const statsById = new Map(statsRows.map((stats) => [stats.studentId, stats]));
    const normalizedStudents = studentsWithProfiles.map((student) =>
      normalizeStudentForTeacher(student, statsById.get(student.id) || null)
    );
    res.json(req.user.role === 'teacher'
      ? normalizedStudents.filter((student) => student.name && student.name !== 'Unknown student')
      : normalizedStudents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get student dashboard data
router.get('/:id/dashboard', authMiddleware, async (req, res) => {
  try {
    const studentId = req.params.id;

    // Get student and attach profile separately to avoid depending on FK cache names.
    let { student, error } = await findStudentByIdOrUserId(studentId);

    if (error || !student) {
      const ensured = await ensureStudentRecordForAuthenticatedUser(req, studentId);
      student = ensured.student;
      error = ensured.error;
    }

    if (error || !student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!(await canAccessStudentResolved(req, student))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const [studentWithUser] = await attachUserProfiles(supabase, [student]);
    res.json({ student: studentWithUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const noRecords = (value) => {
  if (value === undefined || value === null || value === '') return 'No records available.';
  if (Array.isArray(value) && value.length === 0) return 'No records available.';
  return value;
};

const buildStudentReport = async (req, studentId) => {
  let { student, error } = await findStudentByIdOrUserId(studentId);

  if (error || !student) {
    const ensured = await ensureStudentRecordForAuthenticatedUser(req, studentId);
    student = ensured.student;
    error = ensured.error;
  }

  if (error || !student) {
    return { status: 404, body: { success: false, message: 'Student not found' } };
  }

  if (!(await canAccessStudentResolved(req, student))) {
    return { status: 403, body: { success: false, message: 'You do not have permission to access this student report' } };
  }

  const [studentWithUser] = await attachUserProfiles(supabase, [student]);
  const stats = await getStudentStats(student.id);
  const profile = studentWithUser.user || {};
  const name = stats?.name || profile.name || profile.metadata?.displayName || profile.email || 'Student';
  const report = {
    child: {
      id: student.id,
      userId: student.user_id,
      childId: stats?.childId || student.child_id || null,
      name,
      grade: student.grade_level || 'No records available.',
      readingLevel: stats?.level || student.reading_level || 'No records available.',
      currentModule: stats?.currentModule || 'No records available.',
    },
    summary: {
      overallProgress: stats?.progress?.percentage ?? 0,
      practiceAttempts: stats?.totalAttempts ?? 0,
      accuracy: stats?.accuracy ?? 0,
      wordsPracticed: stats?.totalAttempts ?? 0,
      wordsMastered: stats?.wordMastery?.mastered ?? 0,
      difficultWords: stats?.wordMasteryDetail?.difficult || [],
      modulesCompleted: stats?.modulesCompleted ?? 0,
      assessmentsPassed: stats?.assessmentsPassed ?? 0,
      xp: stats?.xp ?? 0,
      streak: stats?.streak ?? 0,
      longestStreak: stats?.longestStreak ?? 0,
      activeDays: stats?.activeDays ?? 0,
      learningTime: stats?.learningTimeAvailable ? `${stats.trackedPracticeMinutes} minutes` : 'Learning time tracking is not available yet.',
    },
    badges: stats?.badges || [],
    modules: stats?.modules || { completed: 0, totalRecords: 0, records: [] },
    assessments: stats?.assessments || { passed: 0, total: 0, records: [] },
    recentActivity: stats?.recentActivities || [],
    progressOverTime: stats?.readingProgressOverTime || [],
    insights: stats?.ruleBasedInsights?.length ? stats.ruleBasedInsights : ['More learning activity is needed to generate insights.'],
  };

  return { status: 200, body: { success: true, report, stats } };
};

const buildReportPdfLines = (report) => [
  `Generated: ${new Date().toISOString()}`,
  '',
  'CHILD INFORMATION',
  `Name: ${noRecords(report.child.name)}`,
  `Grade: ${noRecords(report.child.grade)}`,
  `Reading level: ${noRecords(report.child.readingLevel)}`,
  `Current module: ${noRecords(report.child.currentModule)}`,
  '',
  'PROGRESS SUMMARY',
  `Overall progress: ${report.summary.overallProgress}%`,
  `Practice attempts: ${report.summary.practiceAttempts}`,
  `Accuracy: ${report.summary.accuracy}%`,
  `Words practiced: ${report.summary.wordsPracticed}`,
  `Words mastered: ${report.summary.wordsMastered}`,
  `Modules completed: ${report.summary.modulesCompleted}`,
  `Assessments passed: ${report.summary.assessmentsPassed}`,
  `XP: ${report.summary.xp}`,
  `Current streak: ${report.summary.streak}`,
  `Longest streak: ${report.summary.longestStreak}`,
  `Active days: ${report.summary.activeDays}`,
  `Learning time: ${report.summary.learningTime}`,
  '',
  'DIFFICULT WORDS',
  noRecords((report.summary.difficultWords || []).map((row) => row.word).filter(Boolean).join(', ')),
  '',
  'BADGES',
  noRecords((report.badges || []).map((badge) => badge.id || badge.name).filter(Boolean).join(', ')),
  '',
  'RECENT LEARNING ACTIVITY',
  ...((report.recentActivity || []).length
    ? report.recentActivity.slice(0, 8).map((item) => `${item.lessonTitle || item.activityType || 'Activity'} - ${item.completedAt || 'No date'}${item.score != null ? ` - ${Math.round(Number(item.score))}%` : ''}`)
    : ['No records available.']),
  '',
  'PROGRESS OVER TIME',
  ...((report.progressOverTime || []).length
    ? report.progressOverTime.map((point) => `${point.date}: ${point.value}%`)
    : ['No records available.']),
  '',
  'RULE-BASED INSIGHTS',
  ...((report.insights || []).length ? report.insights : ['More learning activity is needed to generate insights.']),
];

router.get('/:id/report', authMiddleware, async (req, res) => {
  try {
    const result = await buildStudentReport(req, req.params.id);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('[Students] Report error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to build student report' });
  }
});

router.get('/:id/report/pdf', authMiddleware, async (req, res) => {
  try {
    const result = await buildStudentReport(req, req.params.id);
    if (result.status !== 200) return res.status(result.status).json(result.body);

    const report = result.body.report;
    const pdf = createSimplePdf(`LinawLetra Parent Report - ${report.child.name}`, buildReportPdfLines(report));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="parent-report-${req.params.id}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    return res.send(pdf);
  } catch (error) {
    console.error('[Students] PDF report error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to generate student report PDF' });
  }
});

// Get single student
router.get('/:id', authMiddleware, getStudent);

// Update student
router.put('/:id', authMiddleware, updateStudent);

// Delete student
router.delete('/:id', authMiddleware, deleteStudent);

export default router;





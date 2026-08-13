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

    const studentsWithProfiles = await attachUserProfiles(supabase, students || []);
    const statsRows = await getManyStudentStats(studentsWithProfiles.map((student) => student.id));
    const statsById = new Map(statsRows.map((stats) => [stats.studentId, stats]));
    res.json(studentsWithProfiles.map((student) => ({
      ...student,
      stats: statsById.get(student.id) || null,
    })));
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





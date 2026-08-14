import express from 'express';
import crypto from 'crypto';
import { verifyAdmin } from '../middleware/auth.js';
import { supabase, getSupabaseAuthClient } from '../config/supabase.js';
import User from '../models/User.js';
import Feedback from '../models/Feedback.js';
import Progress from '../models/Progress.js';
import Setting from '../models/Setting.js';
import Log from '../models/Log.js';
import { sendTeacherAccountEmail } from '../services/emailService.js';
import { getManyStudentStats } from '../services/studentStatsService.js';

const router = express.Router();
const SETTINGS_DOC_ID = 'system';

const DEFAULT_SETTINGS = {
  websiteName: 'LinawLetra',
  logoUrl: '',
  homepageText: 'Welcome to the LinawLetra learning platform.',
  announcements: [],
};

const normalizeEmail = (email = '') => String(email).trim().toLowerCase();

const generateTeacherPassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const randomPart = Array.from(crypto.randomBytes(10))
    .map((byte) => alphabet[byte % alphabet.length])
    .join('');
  return `Teacher-${randomPart}!`;
};

const verifyTeacherPasswordSignIn = async (email, password) => {
  const { data, error } = await getSupabaseAuthClient().auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data?.user) {
    throw error || new Error('Teacher password verification failed.');
  }

  await getSupabaseAuthClient().auth.signOut().catch(() => null);
  return data.user;
};

const sendError = (res, status, message, error = null) => {
  const payload = { status, message };
  if (error) payload.error = String(error);
  return res.status(status).json(payload);
};

const normalizeRecord = (record) => {
  if (!record) return record;
  return {
    ...record,
    id: record.id || record.uid,
    createdAt: record.created_at || record.createdAt,
    updatedAt: record.updated_at || record.updatedAt,
  };
};

const normalizeRole = (role = '') => String(role || 'unassigned').trim().toLowerCase();

const isDisabledStatus = (status = '') =>
  ['disabled', 'inactive', 'blocked', 'banned', 'deleted', 'archived'].includes(String(status || '').toLowerCase());

// Accepts both raw Supabase rows (snake_case) and normalized User model
// instances (camelCase) so status is computed consistently regardless of source.
const getUserStatus = (user = {}, authUser = null) => {
  const rawStatus = user.account_status ?? user.accountStatus;
  const rawIsActive = user.is_active ?? user.isActive;
  const explicitStatus = String(rawStatus || '').toLowerCase();
  if (explicitStatus === 'deleted' || authUser?.deleted_at) return 'deleted';
  if (explicitStatus === 'archived') return 'archived';
  if (rawIsActive === false || user.metadata?.isActive === false || isDisabledStatus(explicitStatus) || authUser?.banned_until) {
    return 'disabled';
  }
  return 'active';
};

const getUserDisplayName = (user = {}) => {
  const metadata = user.metadata || {};
  return user.name ||
    metadata.displayName ||
    [metadata.firstName, metadata.lastName].filter(Boolean).join(' ') ||
    user.email ||
    'Unnamed user';
};

// Derived from `metadata.platforms`, populated by the shared authMiddleware the moment a
// user makes a real authenticated request from web or mobile (see server/middleware/auth.js).
// Accounts that registered but have not yet made an authenticated request since this was
// added will read as 'unknown' rather than a fabricated default.
const getUserPlatform = (user = {}) => {
  const platforms = user.metadata?.platforms || {};
  const hasWeb = Boolean(platforms.web);
  const hasMobile = Boolean(platforms.mobile);
  if (hasWeb && hasMobile) return 'Web + Mobile';
  if (hasMobile) return 'Mobile';
  if (hasWeb) return 'Web';
  return 'Unknown';
};

const listAuthUsersById = async () => {
  const byId = new Map();
  let page = 1;
  const perPage = 1000;

  while (page < 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    users.forEach((user) => byId.set(user.id, user));
    if (users.length < perPage) break;
    page += 1;
  }

  return byId;
};

// Auth admin lookups require a valid SUPABASE_SERVICE_ROLE_KEY. If that call fails
// (misconfigured env, transient outage) the users list must still render from the
// `users` table alone rather than taking the whole page down with it.
const enrichUsersWithAuth = async (users = []) => {
  let authById = new Map();
  try {
    authById = await listAuthUsersById();
  } catch (error) {
    console.warn('[Admin] Could not load Supabase Auth users; falling back to database-only user data:', error.message);
  }
  return (users || []).map((user) => {
    const authUser = authById.get(user.id);
    const status = getUserStatus(user, authUser);
    return normalizeRecord({
      ...user,
      name: getUserDisplayName(user),
      role: normalizeRole(user.role),
      status,
      accountStatus: user.account_status || status,
      isActive: status === 'active',
      platform: getUserPlatform(user),
      email: user.email || authUser?.email || null,
      emailVerified: Boolean(user.email_verified || authUser?.email_confirmed_at),
      emailConfirmedAt: authUser?.email_confirmed_at || user.verified_at || null,
      registeredAt: user.created_at || authUser?.created_at || null,
      lastActivityAt: user.lastLoginAt || authUser?.last_sign_in_at || user.updated_at || null,
      lastSignInAt: authUser?.last_sign_in_at || null,
      authProvider: authUser?.app_metadata?.provider || authUser?.raw_app_meta_data?.provider || null,
      authAccountExists: Boolean(authUser),
    });
  });
};

const countByRole = (users = [], role) =>
  users.filter((user) => normalizeRole(user.role) === role).length;

const countCompletedRows = async (table, column = 'status') =>
  countRows(table, (query) => query.in(column, ['completed', 'passed', 'mastered']));

const average = (values = []) => {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return 0;
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
};

const safeSelectRows = async (table, buildQuery) => {
  const result = await buildQuery(supabase.from(table));
  if (result.error) {
    if (['PGRST205', 'PGRST204', '42P01', '42703'].includes(result.error.code)) return [];
    throw result.error;
  }
  return result.data || [];
};

const toPdfText = (value = '') =>
  String(value ?? '')
    .replace(/[\\()]/g, (match) => `\\${match}`)
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');

const wrapPdfLine = (line = '', max = 92) => {
  const words = String(line || '').split(/\s+/);
  const lines = [];
  let current = '';
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [''];
};

const createSimplePdf = (title, lines = []) => {
  const wrappedLines = [title, '', ...lines].flatMap((line) => wrapPdfLine(line));
  const pages = [];
  for (let i = 0; i < wrappedLines.length; i += 42) {
    pages.push(wrappedLines.slice(i, i + 42));
  }

  const objects = [''];
  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push(`2 0 obj << /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >> endobj`);

  pages.forEach((pageLines, index) => {
    const pageObj = 3 + index * 2;
    const contentObj = pageObj + 1;
    const content = [
      'BT',
      '/F1 11 Tf',
      '50 790 Td',
      '14 TL',
      ...pageLines.map((line, lineIndex) => `${lineIndex === 0 ? '' : 'T* '}${lineIndex === 0 ? '' : ''}(${toPdfText(line)}) Tj`),
      'ET',
    ].join('\n');
    objects.push(`${pageObj} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 100 0 R >> >> /Contents ${contentObj} 0 R >> endobj`);
    objects.push(`${contentObj} 0 obj << /Length ${Buffer.byteLength(content)} >> stream\n${content}\nendstream endobj`);
  });

  objects.push('100 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = Buffer.byteLength(pdf);
    pdf += `${objects[i]}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
};

const buildStudentReportLines = async (studentId) => {
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('*')
    .eq('id', studentId)
    .maybeSingle();

  if (studentError) throw studentError;
  if (!student) return null;

  const refs = [...new Set([student.id, student.user_id, student.child_id].filter(Boolean))];
  const { data: user } = student.user_id
    ? await supabase.from('users').select('*').eq('id', student.user_id).maybeSingle()
    : { data: null };

  const [
    readingAttempts,
    pronunciationSessions,
    contentAttempts,
    curriculumProgress,
    moduleProgress,
    assessments,
    mastery,
  ] = await Promise.all([
    safeSelectRows('reading_attempts', (query) => query.select('*').in('student_id', refs).order('completed_at', { ascending: false }).limit(200)),
    safeSelectRows('pronunciation_practice_sessions', (query) => query.select('*').in('student_id', refs).order('created_at', { ascending: false }).limit(200)),
    safeSelectRows('student_content_attempts', (query) => query.select('*').in('student_id', refs).order('created_at', { ascending: false }).limit(200)),
    safeSelectRows('curriculum_progress', (query) => query.select('*').in('student_id', refs).order('updated_at', { ascending: false }).limit(200)),
    safeSelectRows('student_module_progress', (query) => query.select('*').in('student_id', refs).order('updated_at', { ascending: false }).limit(200)),
    safeSelectRows('assessments', (query) => query.select('*').in('student_id', refs).order('updated_at', { ascending: false }).limit(100)),
    safeSelectRows('word_mastery', (query) => query.select('*').in('student_id', refs).order('last_attempt_at', { ascending: false }).limit(200)),
  ]);

  const displayName = getUserDisplayName(user || student);
  const readingScores = readingAttempts.map((row) => Number(row.accuracy_score)).filter(Number.isFinite);
  const pronunciationScores = pronunciationSessions.map((row) => Number(row.accuracy_percentage)).filter(Number.isFinite);
  const contentScores = contentAttempts.map((row) => Number(row.accuracy)).filter(Number.isFinite);
  const allPracticeScores = [...readingScores, ...pronunciationScores, ...contentScores];
  const successfulAttempts = allPracticeScores.filter((score) => score >= 75).length;
  const badges = [
    ...(Array.isArray(student.badges) ? student.badges : []),
    ...(Array.isArray(student.unlocked_achievement_ids) ? student.unlocked_achievement_ids : []),
  ].filter((badge, index, list) => badge && list.indexOf(badge) === index);

  const completedModules = moduleProgress.filter((row) => String(row.status || '').toLowerCase() === 'completed' || row.completed_at).length;
  const completedCurriculum = curriculumProgress.filter((row) =>
    ['completed', 'passed', 'mastered', 'mastered_100'].includes(String(row.status || '').toLowerCase()) ||
    row.passed_at ||
    row.mastered_at
  ).length;

  const lines = [
    `Generated: ${new Date().toISOString()}`,
    '',
    'STUDENT PROFILE',
    `Name: ${displayName}`,
    `Email: ${user?.email || 'No recorded data available.'}`,
    `Grade: ${student.grade_level || 'No recorded data available.'}`,
    `Reading level: ${student.reading_level || student.practice_level || 'No recorded data available.'}`,
    `Account status: ${user?.account_status || (user?.is_active === false ? 'disabled' : 'active')}`,
    '',
    'LEARNING PROGRESS',
    `Current reading level: ${student.current_phonetic_level || student.reading_level || 'No recorded data available.'}`,
    `Completed curriculum records: ${completedCurriculum}`,
    `Completed modules: ${completedModules}`,
    `Curriculum progress records: ${curriculumProgress.length}`,
    `Module progress records: ${moduleProgress.length}`,
    `Assessment records: ${assessments.length}`,
    '',
    'PRONUNCIATION / PRACTICE',
    `Total practice attempts: ${allPracticeScores.length}`,
    `Successful attempts: ${successfulAttempts}`,
    `Failed attempts: ${Math.max(0, allPracticeScores.length - successfulAttempts)}`,
    `Average pronunciation accuracy: ${pronunciationScores.length ? `${average(pronunciationScores)}%` : 'No recorded data available.'}`,
    `Average overall practice accuracy: ${allPracticeScores.length ? `${average(allPracticeScores)}%` : 'No recorded data available.'}`,
    `Recent pronunciation scores: ${pronunciationScores.slice(0, 8).join(', ') || 'No recorded data available.'}`,
    `Most practiced words: ${pronunciationSessions.map((row) => row.word).filter(Boolean).slice(0, 8).join(', ') || 'No recorded data available.'}`,
    `Difficult words: ${mastery.filter((row) => row.mastery_status === 'difficult').map((row) => row.word).slice(0, 8).join(', ') || 'No recorded data available.'}`,
    '',
    'ACHIEVEMENTS',
    `XP: ${student.xp ?? 0}`,
    `Current streak: ${student.streak ?? 0}`,
    `Longest streak: ${student.longest_streak ?? 'No recorded data available.'}`,
    `Badges earned: ${badges.length ? badges.join(', ') : 'No recorded data available.'}`,
    '',
    'ACTIVITY HISTORY',
    `Recent reading attempts: ${readingAttempts.slice(0, 5).map((row) => `${row.word_target || row.expected_text || 'practice'} (${row.accuracy_score ?? 'no score'}%)`).join('; ') || 'No recorded data available.'}`,
    `Recent practice dates: ${[...readingAttempts, ...pronunciationSessions, ...contentAttempts].map((row) => row.completed_at || row.created_at).filter(Boolean).slice(0, 8).join(', ') || 'No recorded data available.'}`,
    '',
    'PROGRESS OVER TIME',
    allPracticeScores.length >= 2
      ? `Recorded accuracy range: first ${Math.round(allPracticeScores[allPracticeScores.length - 1])}%, latest ${Math.round(allPracticeScores[0])}%.`
      : 'No recorded data available.',
  ];

  return { student, user, lines, displayName };
};

const attachStudentDetailsToUsers = async (users = []) => {
  const normalizedUsers = (users || []).map(normalizeRecord);
  const studentUserIds = normalizedUsers
    .filter((user) => String(user.role || '').toLowerCase() === 'student')
    .map((user) => user.id || user.uid)
    .filter(Boolean);

  if (!studentUserIds.length) {
    return normalizedUsers;
  }

  const { data: students, error } = await supabase
    .from('students')
    .select('id,user_id,parent_id,teacher_id,grade_level,reading_level,xp,words_completed,accuracy,streak,current_phonetic_level,progress_in_level')
    .in('user_id', studentUserIds);

  if (error) {
    console.warn('[Admin] Could not attach student details:', error.message);
    return normalizedUsers;
  }

  const statsRows = await getManyStudentStats((students || []).map((student) => student.id));
  const statsByStudentId = new Map(statsRows.map((stats) => [stats.studentId, stats]));
  const studentsByUserId = new Map((students || []).map((student) => [student.user_id, student]));
  return normalizedUsers.map((user) => {
    const student = studentsByUserId.get(user.id || user.uid);
    const stats = student ? statsByStudentId.get(student.id) : null;
    if (!student) return user;
    return {
      ...user,
      studentId: student.id,
      parentId: student.parent_id,
      teacherId: student.teacher_id,
      gradeLevel: student.grade_level,
      readingLevel: student.reading_level,
      xp: stats?.xp ?? student.xp ?? 0,
      wordsCompleted: stats?.wordsCompleted ?? student.words_completed ?? 0,
      accuracy: stats?.accuracy ?? student.accuracy ?? 0,
      streak: stats?.streak ?? student.streak ?? 0,
      currentPhoneticLevel: stats?.currentPhoneticLevel ?? student.current_phonetic_level ?? 'Easy',
      progressInCurrentLevel: stats?.progressInCurrentLevel ?? student.progress_in_level ?? 0,
      stats,
    };
  });
};

const countRows = async (table, filterFn) => {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  if (typeof filterFn === 'function') {
    query = filterFn(query);
  }
  const { count, error } = await query;
  if (error) {
    if (error.code === 'PGRST205') {
      console.warn(`[Admin] Optional table ${table} is not available; using count 0.`);
      return 0;
    }
    throw error;
  }
  return count || 0;
};

const countCompletedLessonProgress = async () => {
  const statusResult = await supabase
    .from('lesson_progress')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed');

  if (!statusResult.error) return statusResult.count || 0;

  const completedResult = await supabase
    .from('lesson_progress')
    .select('id', { count: 'exact', head: true })
    .eq('completed', true);

  if (completedResult.error) {
    console.warn('[Admin] Could not count completed lesson progress:', completedResult.error.message);
    return 0;
  }

  return completedResult.count || 0;
};

const logAdminAction = async (req, action, targetType = '', targetId = null, details = {}) => {
  try {
    const log = new Log({
      adminId: req.user.id,
      adminName: req.user.email || req.user.id,
      action,
      targetType,
      targetId,
      details,
      createdAt: new Date().toISOString(),
    });
    await log.save();
  } catch (error) {
    console.error('Failed to write admin log', error);
  }
};

router.get('/health', async (req, res) => {
  const startedAt = Date.now();
  try {
    const { error: dbError } = await supabase.from('users').select('id', { count: 'exact', head: true });
    return res.json({
      status: dbError ? 'degraded' : 'ok',
      api: 'ok',
      database: dbError ? 'unreachable' : 'ok',
      databaseError: dbError ? dbError.message : null,
      responseTimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Admin health error:', error);
    return res.status(200).json({
      status: 'degraded',
      api: 'ok',
      database: 'unreachable',
      databaseError: error.message,
      responseTimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  }
});

router.use(verifyAdmin);

router.get('/reports/students/:id', async (req, res) => {
  try {
    const report = await buildStudentReportLines(req.params.id);
    if (!report) {
      return sendError(res, 404, 'Student not found');
    }

    return res.json({
      student: normalizeRecord(report.student),
      user: report.user ? normalizeRecord(report.user) : null,
      displayName: report.displayName,
      lines: report.lines,
    });
  } catch (error) {
    console.error('Student report error:', error);
    return sendError(res, 500, 'Failed to build student report', error.message);
  }
});

router.get('/reports/students/:id/pdf', async (req, res) => {
  try {
    const report = await buildStudentReportLines(req.params.id);
    if (!report) {
      return sendError(res, 404, 'Student not found');
    }

    const pdf = createSimplePdf(`LinawLetra Student Report - ${report.displayName}`, report.lines);
    const filename = `student-report-${req.params.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdf.length);
    return res.send(pdf);
  } catch (error) {
    console.error('Student PDF report error:', error);
    return sendError(res, 500, 'Failed to generate student PDF report', error.message);
  }
});

router.get('/overview', async (req, res) => {
  try {
    const { data: userRows, error: usersError } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    if (usersError) throw usersError;

    const users = await enrichUsersWithAuth(userRows || []);
    const statuses = users.reduce((acc, user) => {
      acc[user.status] = (acc[user.status] || 0) + 1;
      return acc;
    }, {});

    const [
      totalCurriculumItems,
      totalCurriculumModules,
      totalAssessments,
      totalCurriculumProgress,
      completedCurriculumProgress,
      totalModuleProgress,
      completedModuleProgress,
      totalAttempts,
      totalNotifications,
    ] = await Promise.all([
      countRows('curriculum_items'),
      countRows('curriculum_modules'),
      countRows('assessments'),
      countRows('curriculum_progress'),
      countCompletedRows('curriculum_progress'),
      countRows('student_module_progress'),
      countCompletedRows('student_module_progress'),
      countRows('reading_attempts'),
      countRows('notifications'),
    ]);

    const userRoleBreakdown = users.reduce((acc, row) => {
      const role = normalizeRole(row.role);
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentRegistrations = users.filter((row) => {
      const created = new Date(row.registeredAt || row.created_at || 0).getTime();
      return Number.isFinite(created) && created >= sevenDaysAgo;
    }).length;

    const { data: recentAttempts } = await supabase
      .from('reading_attempts')
      .select('id,student_id,activity_type,completed_at,accuracy_score')
      .order('completed_at', { ascending: false })
      .limit(6);

    const { data: scoreRows, error: scoreError } = await supabase
      .from('reading_attempts')
      .select('accuracy_score')
      .not('accuracy_score', 'is', null);
    if (scoreError) throw scoreError;

    const totalProgress = totalCurriculumProgress + totalModuleProgress;
    const completedProgress = completedCurriculumProgress + completedModuleProgress;
    const averageScore = average((scoreRows || []).map((row) => row.accuracy_score));
    const recentActivities = (recentAttempts || []).map((item) => ({
      id: item.id,
      type: item.activity_type || 'reading_attempt',
      when: item.completed_at || null,
      createdAt: item.completed_at || null,
      description: `Reading attempt recorded${Number.isFinite(Number(item.accuracy_score)) ? ` (${Math.round(Number(item.accuracy_score))}%)` : ''}`,
    }));

    const response = {
      totalUsers: users.length,
      totalParents: countByRole(users, 'parent'),
      totalTeachers: countByRole(users, 'teacher'),
      totalStudents: countByRole(users, 'student'),
      totalAdmins: countByRole(users, 'admin'),
      activeUsers: statuses.active || 0,
      disabledUsers: statuses.disabled || 0,
      archivedUsers: statuses.archived || 0,
      deletedUsers: statuses.deleted || 0,
      inactiveUsers: (statuses.disabled || 0) + (statuses.deleted || 0),
      recentRegistrations,
      pendingApprovals: users.filter((user) => user.emailVerified === false).length,
      totalLessons: totalCurriculumItems,
      totalCurriculumItems,
      totalCurriculumModules,
      totalAssessments,
      totalProgress,
      completedProgress,
      completionRate: totalProgress > 0 ? Math.round((completedProgress / totalProgress) * 100) : 0,
      averageScore,
      lessonCompletion: totalProgress > 0 ? Math.round((completedProgress / totalProgress) * 100) : 0,
      userRoleBreakdown,
      platformSummary: {
        totalCurriculumItems,
        totalCurriculumModules,
        totalAssessments,
        totalProgress,
        completedProgress,
        totalAttempts,
        totalNotifications,
      },
      recentActivities: recentActivities.slice(0, 6),
    };

    return res.json(response);
  } catch (error) {
    console.error('Admin overview error:', error);
    return sendError(res, 500, 'Failed to fetch admin overview', error.message);
  }
});

router.get('/users', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(10, parseInt(req.query.limit, 10) || 100), 500);
    const roleFilter = req.query.role ? normalizeRole(req.query.role) : '';
    const statusFilter = String(req.query.status || '').trim().toLowerCase();
    const search = req.query.search?.trim();

    let query = supabase.from('users').select('*').order('created_at', { ascending: false });
    if (roleFilter && roleFilter !== 'all') {
      query = query.ilike('role', roleFilter);
    }
    if (search) {
      const term = `%${search}%`;
      query = query.or(`name.ilike.${term},email.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST205') {
        return res.json({ users: [], page, limit });
      }
      throw error;
    }

    let users = await enrichUsersWithAuth(data || []);
    if (statusFilter && statusFilter !== 'all') {
      users = users.filter((user) => user.status === statusFilter || user.accountStatus === statusFilter);
    }

    const offset = (page - 1) * limit;
    const pagedUsers = users.slice(offset, offset + limit);

    return res.json({
      users: await attachStudentDetailsToUsers(pagedUsers),
      pagination: {
        page,
        limit,
        total: users.length,
        pages: Math.max(1, Math.ceil(users.length / limit)),
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    return sendError(res, 500, 'Unable to load users. Please try again later.', error.message);
  }
});

router.get('/archive/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('account_status', 'archived')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const archivedUsers = (await enrichUsersWithAuth(data || [])).map((user) => ({
      ...user,
      archivedDate: user.metadata?.archivedAt || user.updatedAt || user.updated_at || null,
      archivedBy: user.metadata?.archivedBy || null,
      previousStatus: user.metadata?.previousStatus || 'active',
    }));

    return res.json({ archivedUsers });
  } catch (error) {
    console.error('Get archive users error:', error);
    return sendError(res, 500, 'Unable to load archived users.', error.message);
  }
});

router.get('/teachers', async (req, res) => {
  try {
    const { data: userRows, error: teacherError } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (teacherError) {
      throw teacherError;
    }

    const teacherRows = (userRows || []).filter((row) => normalizeRole(row.role) === 'teacher');
    const teacherIds = teacherRows.map((teacher) => teacher.uid || teacher.id).filter(Boolean);
    let studentRows = [];

    if (teacherIds.length) {
      const { data: assignedStudents, error: studentError } = await supabase
        .from('students')
        .select('id,user_id,teacher_id,grade_level,reading_level')
        .in('teacher_id', teacherIds);

      if (studentError) throw studentError;
      studentRows = assignedStudents || [];
    }

    const studentUserIds = [...new Set(studentRows.map((student) => student.user_id).filter(Boolean))];
    const { data: studentUsers } = studentUserIds.length
      ? await supabase.from('users').select('id,name,email,metadata').in('id', studentUserIds)
      : { data: [] };
    const studentUsersById = new Map((studentUsers || []).map((user) => [user.id, user]));

    const teacherMap = teacherIds.reduce((acc, id) => {
      acc[id] = { assignedStudents: new Set() };
      return acc;
    }, {});

    studentRows.forEach((student) => {
      const teacherId = student.teacher_id;
      if (!teacherId || !teacherMap[teacherId]) return;
      const studentUser = studentUsersById.get(student.user_id);
      teacherMap[teacherId].assignedStudents.add(getUserDisplayName(studentUser || student));
    });

    const enrichedTeachers = await enrichUsersWithAuth(teacherRows);
    const teachers = enrichedTeachers.map((teacher) => {
      const uid = teacher.uid || teacher.id;
      const { assignedStudents = new Set() } = teacherMap[uid] || {};
      return {
        ...teacher,
        email: teacher.email,
        role: teacher.role || 'teacher',
        gradeLevel: teacher.metadata?.gradeLevel || teacher.gradeLevel || null,
        assignedStudents: Array.from(assignedStudents).slice(0, 10),
        assignedStudentCount: assignedStudents.size,
      };
    });

    return res.json({ teachers });
  } catch (error) {
    console.error('Get teachers error:', error);
    return sendError(res, 500, 'Unable to load teachers. Please try again later.', error.message);
  }
});

router.post('/teachers/create', async (req, res) => {
  let authUserId = null;

  try {
    const {
      firstName = '',
      lastName = '',
      name = '',
      email = '',
      gradeLevel = 'Grade 1',
      password,
    } = req.body || {};

    const normalizedEmail = normalizeEmail(email);
    const cleanFirstName = String(firstName || '').trim();
    const cleanLastName = String(lastName || '').trim();
    const displayName = String(name || `${cleanFirstName} ${cleanLastName}`).trim();

    if (!displayName || !normalizedEmail) {
      return sendError(res, 400, 'Teacher name and email are required.');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return sendError(res, 400, 'Please enter a valid teacher email address.');
    }

    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('users')
      .select('id,email,role')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (existingProfileError) throw existingProfileError;

    if (existingProfile) {
      return sendError(res, 409, 'A user profile with this email already exists.');
    }

    const { data: authList, error: authListError } = await supabase.auth.admin.listUsers();
    if (authListError) throw authListError;

    const existingAuthUser = (authList?.users || []).find(
      (user) => normalizeEmail(user.email) === normalizedEmail
    );
    if (existingAuthUser) {
      return sendError(res, 409, 'This email is already registered in Supabase Auth.');
    }

    const teacherPassword = password || generateTeacherPassword();
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: teacherPassword,
      email_confirm: true,
      user_metadata: {
        role: 'teacher',
        approved: true,
      },
    });

    if (authError || !authData?.user) {
      throw authError || new Error('Failed to create teacher auth account.');
    }

    authUserId = authData.user.id;

    try {
      await verifyTeacherPasswordSignIn(normalizedEmail, teacherPassword);
    } catch (verifyError) {
      console.warn('Teacher password did not verify immediately; resetting password once:', verifyError.message);
      const { error: resetPasswordError } = await supabase.auth.admin.updateUserById(authUserId, {
        password: teacherPassword,
        email_confirm: true,
      });

      if (resetPasswordError) throw resetPasswordError;
      await verifyTeacherPasswordSignIn(normalizedEmail, teacherPassword);
    }

    const metadata = {
      displayName,
      firstName: cleanFirstName || displayName.split(' ')[0] || 'Teacher',
      lastName: cleanLastName || displayName.split(' ').slice(1).join(' ') || '',
      gradeLevel,
      approved: true,
      firstLoginOtpCompleted: true,
      createdByAdmin: req.user.id,
    };

    const { data: teacherProfile, error: profileError } = await supabase
      .from('users')
      .upsert({
        id: authUserId,
        email: normalizedEmail,
        name: displayName,
        role: 'teacher',
        email_verified: true,
        is_active: true,
        account_status: 'active',
        metadata,
      }, { onConflict: 'id' })
      .select()
      .single();

    if (profileError) {
      await supabase.auth.admin.deleteUser(authUserId).catch(() => null);
      throw profileError;
    }

    await logAdminAction(req, 'Created teacher account', 'teacher', authUserId, {
      email: normalizedEmail,
      gradeLevel,
    });

    // Send credentials email to teacher
    const emailSent = await sendTeacherAccountEmail(
      normalizedEmail,
      displayName,
      teacherPassword
    );

    if (!emailSent) {
      // Roll back user if email fails
      await supabase.auth.admin.deleteUser(authUserId).catch(() => null);
      await supabase.from('users').delete().eq('id', authUserId);
      return sendError(res, 500, 'Teacher account was created but email delivery failed. The account has been rolled back. Please check your email configuration.');
    }

    return res.status(201).json({
      teacher: {
        ...normalizeRecord(teacherProfile),
        gradeLevel,
        status: 'active',
        assignedStudentCount: 0,
      },
      credentials: {
        email: normalizedEmail,
        password: teacherPassword,
      },
      message: 'Teacher account created and email sent successfully.',
    });
  } catch (error) {
    console.error('Create teacher error:', error);
    if (authUserId) {
      await supabase.auth.admin.deleteUser(authUserId).catch(() => null);
    }
    return sendError(res, 500, 'Could not create teacher account. Please try again.', error.message);
  }
});

router.get('/pending-users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'teacher')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return res.json({ pendingUsers: (data || []).map(normalizeRecord) });
  } catch (error) {
    console.error('Get pending users error:', error);
    return sendError(res, 500, 'Unable to load pending users. Please try again later.', error.message);
  }
});

const approveTeacherAccount = async (teacherId) => {
  const user = await User.findById(teacherId);
  if (!user) {
    const error = new Error('Teacher user not found');
    error.status = 404;
    throw error;
  }

  const userRole = String(user.role || '').toLowerCase();
  if (userRole !== 'teacher') {
    const error = new Error('Only teacher accounts are eligible for approval');
    error.status = 400;
    throw error;
  }

  const updateData = {
    metadata: { approved: true },
  };

  const updatedUser = await User.findByIdAndUpdate(teacherId, updateData);
  const { error: authError } = await supabase.auth.admin.updateUserById(teacherId, {
    user_metadata: { role: 'teacher', approved: true },
  });

  if (authError) {
    console.warn('Supabase auth metadata update failed:', authError);
  }

  return updatedUser;
};

router.put('/pending-users/:id', async (req, res) => {
  try {
    const { accountStatus } = req.body;
    if (!['approved', 'rejected'].includes(accountStatus)) {
      return res.status(400).json({ message: 'Invalid account status' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, {
      metadata: { approved: accountStatus === 'approved' },
    });

    await logAdminAction(req, `Account ${accountStatus}`, 'user', req.params.id, { userEmail: updatedUser.email });
    return res.json(updatedUser);
  } catch (error) {
    console.error('Update pending user error:', error);
    return sendError(res, 500, 'Failed to update pending user', error.message);
  }
});

router.put('/approve-user/:id', async (req, res) => {
  try {
    const approvedUser = await approveTeacherAccount(req.params.id);
    await logAdminAction(req, 'Approved teacher account', 'teacher', req.params.id, { email: approvedUser.email });
    return res.json(approvedUser);
  } catch (error) {
    console.error('Approve user error:', error);
    if (error.status === 404) return sendError(res, 404, error.message);
    if (error.status === 400) return sendError(res, 400, error.message);
    return sendError(res, 500, 'Failed to approve teacher account', error.message);
  }
});

router.put('/approve-teacher/:id', async (req, res) => {
  try {
    const approvedUser = await approveTeacherAccount(req.params.id);
    await logAdminAction(req, 'Approved teacher account', 'teacher', req.params.id, { email: approvedUser.email });
    return res.json(approvedUser);
  } catch (error) {
    console.error('Approve teacher error:', error);
    if (error.status === 404) return sendError(res, 404, error.message);
    if (error.status === 400) return sendError(res, 400, error.message);
    return sendError(res, 500, 'Failed to approve teacher account', error.message);
  }
});

router.get('/settings', async (req, res) => {
  try {
    const settings = await Setting.findById(SETTINGS_DOC_ID);
    return res.json({ settings: settings || { id: SETTINGS_DOC_ID, ...DEFAULT_SETTINGS } });
  } catch (error) {
    console.error('Get settings error:', error);
    return sendError(res, 500, 'Failed to load admin settings', error.message);
  }
});

router.put('/settings', async (req, res) => {
  try {
    const { websiteName, logoUrl, homepageText, announcements } = req.body;
    const updateData = {
      websiteName: websiteName !== undefined ? websiteName : DEFAULT_SETTINGS.websiteName,
      logoUrl: logoUrl !== undefined ? logoUrl : DEFAULT_SETTINGS.logoUrl,
      homepageText: homepageText !== undefined ? homepageText : DEFAULT_SETTINGS.homepageText,
      announcements: Array.isArray(announcements) ? announcements : DEFAULT_SETTINGS.announcements,
      updatedAt: new Date().toISOString(),
    };

    const existingSettings = await Setting.findById(SETTINGS_DOC_ID);
    let settings;

    if (existingSettings) {
      settings = await Setting.findByIdAndUpdate(SETTINGS_DOC_ID, updateData);
    } else {
      const newSettings = new Setting({ id: SETTINGS_DOC_ID, ...DEFAULT_SETTINGS, ...updateData });
      settings = await newSettings.save();
    }

    await logAdminAction(req, 'Update settings', 'settings', SETTINGS_DOC_ID, updateData);
    return res.json({ settings });
  } catch (error) {
    console.error('Update settings error:', error);
    return sendError(res, 500, 'Failed to update admin settings', error.message);
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { role, isActive, status, fullName, name, email } = req.body;
    const updateData = {};

    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      return sendError(res, 404, 'User not found');
    }

    if (role !== undefined) updateData.role = role;
    const nextIsActive = isActive !== undefined
      ? Boolean(isActive)
      : status !== undefined
        ? !isDisabledStatus(status)
        : undefined;
    if (nextIsActive !== undefined) {
      updateData.isActive = nextIsActive;
      updateData.accountStatus = nextIsActive ? 'active' : 'disabled';
      updateData.metadata = {
        ...(existingUser?.metadata || {}),
        isActive: nextIsActive,
        disabledAt: nextIsActive ? null : new Date().toISOString(),
        disabledBy: nextIsActive ? null : req.user.id,
      };
    }
    if (fullName !== undefined) updateData.name = fullName;
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = String(email).toLowerCase();

    const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData);

    if (email !== undefined || role !== undefined || nextIsActive !== undefined) {
      const authPayload = {};
      if (email !== undefined) authPayload.email = String(email).toLowerCase();
      if (role !== undefined || nextIsActive !== undefined) {
        authPayload.user_metadata = {
          ...(existingUser.metadata || {}),
          ...(role !== undefined ? { role } : {}),
          ...(nextIsActive !== undefined ? { isActive: nextIsActive, accountStatus: nextIsActive ? 'active' : 'disabled' } : {}),
        };
      }
      if (nextIsActive !== undefined) {
        authPayload.ban_duration = nextIsActive ? 'none' : '876600h';
      }
      if (Object.keys(authPayload).length) {
        const { error: authError } = await supabase.auth.admin.updateUserById(req.params.id, authPayload);
        if (authError) {
          console.warn('Supabase auth update error:', authError);
        }
      }
    }

    await logAdminAction(req, 'Update user', 'user', req.params.id, updateData);
    const [enrichedUser] = await enrichUsersWithAuth(updatedUser ? [updatedUser] : []);
    return res.json(enrichedUser || updatedUser);
  } catch (error) {
    console.error('Update user error:', error);
    return sendError(res, 500, 'Failed to update user', error.message);
  }
});

router.post('/users/:id/restore', async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) {
      return sendError(res, 400, 'User ID is required');
    }

    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return sendError(res, 404, 'User not found');
    }

    const restoredMetadata = {
      ...(existingUser.metadata || {}),
      isActive: true,
      accountStatus: 'active',
      previousStatus: existingUser.metadata?.previousStatus || null,
      restoredAt: new Date().toISOString(),
      restoredBy: req.user.id,
      archivedAt: null,
      archivedBy: null,
    };

    const restoredUser = await User.findByIdAndUpdate(userId, {
      isActive: true,
      accountStatus: 'active',
      metadata: restoredMetadata,
    });

    const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
      user_metadata: {
        ...(existingUser.metadata || {}),
        isActive: true,
        accountStatus: 'active',
      },
    });

    if (authError && !String(authError.message).toLowerCase().includes('not found')) {
      console.warn('Supabase auth restore update error:', authError);
    }

    await logAdminAction(req, 'Restore user', 'user', userId, {
      email: existingUser.email || 'unknown',
    });

    const [enrichedUser] = await enrichUsersWithAuth(restoredUser ? [restoredUser] : []);
    return res.json({
      message: 'User restored successfully.',
      user: enrichedUser || restoredUser,
    });
  } catch (error) {
    console.error('Restore user error:', error);
    return sendError(res, 500, 'Failed to restore user', error.message);
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    const userId = req.params.id;
    if (!userId) {
      return sendError(res, 400, 'User ID is required');
    }

    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return sendError(res, 404, 'User not found');
    }

    const previousStatus = String(existingUser.accountStatus || existingUser.account_status || 'active').toLowerCase();
    const archiveMetadata = {
      ...(existingUser.metadata || {}),
      isActive: false,
      accountStatus: 'archived',
      archivedAt: new Date().toISOString(),
      archivedBy: req.user.id,
      previousStatus,
    };

    const archivedUser = await User.findByIdAndUpdate(userId, {
      isActive: false,
      accountStatus: 'archived',
      metadata: archiveMetadata,
    });

    const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: '876600h',
      user_metadata: {
        ...(existingUser.metadata || {}),
        isActive: false,
        accountStatus: 'archived',
      },
    });

    if (authError && !String(authError.message).toLowerCase().includes('not found')) {
      console.warn('Supabase auth archive update error:', authError);
    }

    await logAdminAction(req, 'Archive user', 'user', userId, {
      email: existingUser.email || 'unknown',
      previousStatus,
    });

    const [enrichedUser] = await enrichUsersWithAuth(archivedUser ? [archivedUser] : []);
    return res.json({
      message: 'User archived successfully. Learning history and profile data were preserved.',
      user: enrichedUser || archivedUser,
    });
  } catch (error) {
    console.error('Archive user error:', error);
    return sendError(res, 500, 'Failed to archive user', error.message);
  }
});

// Check if an email is registered in Supabase Auth
// Useful for debugging "Email already registered" errors
router.get('/email-check/:email', async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) {
      return sendError(res, 400, 'Email is required');
    }

    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) {
      console.error('Error fetching Supabase Auth users:', error);
      return sendError(res, 500, 'Failed to check email registration', error.message);
    }

    const user = (data.users || []).find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.json({
        email,
        exists: false,
        message: 'Email is NOT registered in Supabase Auth (safe to register)',
      });
    }

    return res.json({
      email,
      exists: true,
      userId: user.id,
      emailConfirmed: !!user.email_confirmed_at,
      createdAt: user.created_at,
      message: 'Email is registered in Supabase Auth',
    });
  } catch (error) {
    console.error('Email check error:', error);
    return sendError(res, 500, 'Failed to check email', error.message);
  }
});

// Delete a user by email from Supabase Auth
// Used for cleanup when "Email already registered" prevents re-registration
router.delete('/email-cleanup/:email', async (req, res) => {
  try {
    const { email } = req.params;
    if (!email) {
      return sendError(res, 400, 'Email is required');
    }

    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) {
      console.error('Error fetching Supabase Auth users:', error);
      return sendError(res, 500, 'Failed to find user by email', error.message);
    }

    const user = (data.users || []).find((u) => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.json({
        email,
        deleted: false,
        message: 'Email is NOT registered in Supabase Auth (nothing to delete)',
      });
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);

    if (deleteError && !String(deleteError.message).toLowerCase().includes('not found')) {
      console.error('Error deleting user from Supabase Auth:', deleteError);
      return sendError(res, 500, 'Failed to delete user from Supabase Auth', deleteError.message);
    }

    await logAdminAction(req, 'Email cleanup - delete from Auth', 'email', email, {
      userId: user.id,
      emailConfirmed: !!user.email_confirmed_at,
    });

    return res.json({
      email,
      deleted: true,
      userId: user.id,
      message: `Successfully deleted user from Supabase Auth. Email "${email}" can now be re-registered.`,
    });
  } catch (error) {
    console.error('Email cleanup error:', error);
    return sendError(res, 500, 'Failed to cleanup email', error.message);
  }
});

router.get('/analytics', async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const since = sevenDaysAgo.toISOString();

    const [
      usersResult,
      studentRowsResult,
      curriculumProgressResult,
      moduleProgressResult,
      curriculumItemsResult,
      readingAttemptsResult,
      pronunciationResult,
      contentAttemptsResult,
      contentCompletionsResult,
      wordMasteryResult,
      confusionResult,
    ] = await Promise.all([
      supabase.from('users').select('created_at').gt('created_at', since),
      supabase.from('students').select('id,user_id,reading_level,practice_level,words_completed,completed,streak,total_attempts,accuracy_sum,activities_completed,badges,last_practice_date'),
      supabase.from('curriculum_progress').select('id,student_id,status,best_accuracy,attempts_count,last_attempt_at,curriculum_item_id'),
      supabase.from('student_module_progress').select('id,student_id,module_id,status,progress,assessment_score,assessment_passed,completed_at,last_activity_at'),
      supabase.from('curriculum_items').select('id,item_type,reading_level'),
      supabase.from('reading_attempts').select('id,student_id,accuracy_score,activity_type,completed_at,word_target,confusion_tags,phoneme_accuracy,syllable_accuracy,word_accuracy'),
      supabase.from('pronunciation_practice_sessions').select('id,student_id,word,accuracy_percentage,is_correct,created_at,attempts,confidence_score'),
      supabase.from('student_content_attempts').select('id,student_id,content_id,accuracy,duration_seconds,is_full_submission,created_at'),
      supabase.from('student_content_completions').select('id,student_id,content_id,completed_at'),
      supabase.from('word_mastery').select('id,student_id,word,mastery_status,attempt_count,correct_count,avg_pronunciation_score,last_attempt_at'),
      supabase.from('confusion_patterns').select('id,student_id,pattern_type,occurrence_count,last_seen_at,example_words'),
    ]);

    if (usersResult.error) throw usersResult.error;
    if (studentRowsResult.error) throw studentRowsResult.error;
    if (curriculumProgressResult.error) throw curriculumProgressResult.error;
    if (moduleProgressResult.error) throw moduleProgressResult.error;
    if (curriculumItemsResult.error) throw curriculumItemsResult.error;
    if (readingAttemptsResult.error) throw readingAttemptsResult.error;
    if (pronunciationResult.error) throw pronunciationResult.error;
    if (contentAttemptsResult.error) throw contentAttemptsResult.error;
    if (contentCompletionsResult.error) throw contentCompletionsResult.error;
    if (wordMasteryResult.error) throw wordMasteryResult.error;
    if (confusionResult.error) throw confusionResult.error;

    const { data: userRows, error: allUsersError } = await supabase.from('users').select('*');
    if (allUsersError) throw allUsersError;
    const users = await enrichUsersWithAuth(userRows || []);

    const enrollmentMap = {};
    for (let i = 0; i < 7; i += 1) {
      const date = new Date(sevenDaysAgo);
      date.setDate(sevenDaysAgo.getDate() + i + 1);
      enrollmentMap[date.toISOString().split('T')[0]] = 0;
    }

    (usersResult.data || []).forEach((item) => {
      const createdAt = item.created_at || item.createdAt;
      if (!createdAt) return;
      const dayKey = new Date(createdAt).toISOString().split('T')[0];
      if (enrollmentMap[dayKey] !== undefined) {
        enrollmentMap[dayKey] += 1;
      }
    });

    const students = studentRowsResult.data || [];
    const curriculumProgress = curriculumProgressResult.data || [];
    const moduleProgress = moduleProgressResult.data || [];
    const curriculumItemsById = new Map((curriculumItemsResult.data || []).map((item) => [item.id, item]));
    const readingAttempts = readingAttemptsResult.data || [];
    const pronunciationSessions = pronunciationResult.data || [];
    const contentAttempts = contentAttemptsResult.data || [];
    const contentCompletions = contentCompletionsResult.data || [];
    const wordMastery = wordMasteryResult.data || [];
    const confusionPatterns = confusionResult.data || [];

    const levelDistribution = students.reduce((acc, row) => {
      const level = String(row.reading_level || row.practice_level || 'beginner').toLowerCase();
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {});

    const totalAttempts = readingAttempts.length + pronunciationSessions.length + contentAttempts.length;
    const successfulAttempts = [
      ...readingAttempts.filter((attempt) => Number(attempt.accuracy_score) >= 75),
      ...pronunciationSessions.filter((attempt) => attempt.is_correct || Number(attempt.accuracy_percentage) >= 75),
      ...contentAttempts.filter((attempt) => Number(attempt.accuracy) >= 75),
    ].length;
    const failedAttempts = Math.max(0, totalAttempts - successfulAttempts);
    const averageProgressScore = average([
      ...curriculumProgress.map((item) => item.best_accuracy),
      ...moduleProgress.map((item) => item.assessment_score),
      ...readingAttempts.map((item) => item.accuracy_score),
      ...pronunciationSessions.map((item) => item.accuracy_percentage),
      ...contentAttempts.map((item) => item.accuracy),
    ]);
    const averageAccuracy = average([
      ...readingAttempts.map((item) => item.accuracy_score),
      ...pronunciationSessions.map((item) => item.accuracy_percentage),
      ...contentAttempts.map((item) => item.accuracy),
    ]);
    const totalWordsCompleted = students.reduce((sum, student) => sum + Number(student.words_completed || 0), 0);
    const totalActivitiesCompleted = students.reduce((sum, student) => sum + Number(student.activities_completed || 0), 0) + contentCompletions.length;
    const completedCurriculum = curriculumProgress.filter((item) => ['completed', 'passed', 'mastered'].includes(String(item.status).toLowerCase())).length;
    const completedModules = moduleProgress.filter((item) => ['completed', 'passed', 'mastered'].includes(String(item.status).toLowerCase()) || item.assessment_passed).length;
    const totalProgressRecords = curriculumProgress.length + moduleProgress.length;
    const totalBadgeUnlocks = students.reduce((sum, student) => sum + (Array.isArray(student.badges) ? student.badges.length : 0), 0);
    const badgeCounts = students.reduce((acc, student) => {
      (Array.isArray(student.badges) ? student.badges : []).forEach((badge) => {
        const id = typeof badge === 'string' ? badge : badge?.id;
        if (id) acc[id] = (acc[id] || 0) + 1;
      });
      return acc;
    }, {});
    const activeUsers = users.filter((user) => user.status === 'active').length;
    const disabledUsers = users.filter((user) => user.status === 'disabled').length;
    const activeStudents = students.filter((student) => {
      const last = new Date(student.last_practice_date || 0).getTime();
      return Number.isFinite(last) && last >= Date.now() - (30 * 24 * 60 * 60 * 1000);
    }).length;
    const wordOfDayCompletions = readingAttempts.filter((attempt) => attempt.activity_type === 'word_of_day').length;
    const readingEngagement = students.length
      ? Math.round((students.filter((student) => Number(student.total_attempts || 0) > 0 || readingAttempts.some((attempt) => attempt.student_id === student.id)).length / students.length) * 100)
      : 0;
    const difficultWords = wordMastery
      .filter((row) => String(row.mastery_status || '').toLowerCase() !== 'mastered')
      .sort((a, b) => Number(b.attempt_count || 0) - Number(a.attempt_count || 0))
      .slice(0, 10)
      .map((row) => ({
        word: row.word,
        attempts: row.attempt_count || 0,
        correct: row.correct_count || 0,
        score: row.avg_pronunciation_score || 0,
      }));
    const phonemeConfusionPatterns = confusionPatterns
      .sort((a, b) => Number(b.occurrence_count || 0) - Number(a.occurrence_count || 0))
      .slice(0, 10)
      .map((row) => ({
        pattern: row.pattern_type,
        count: row.occurrence_count || 0,
        examples: row.example_words || [],
      }));
    const sessionDurations = [
      ...pronunciationSessions.map((session) => Number(session.duration_seconds || 0)),
      ...contentAttempts.map((attempt) => Number(attempt.duration_seconds || 0)),
    ].filter((seconds) => Number.isFinite(seconds) && seconds > 0);
    const averageSessionMinutes = sessionDurations.length
      ? Math.round((sessionDurations.reduce((sum, seconds) => sum + seconds, 0) / sessionDurations.length) / 60)
      : null;
    const completedByItemType = curriculumProgress
      .filter((item) => ['completed', 'passed', 'mastered'].includes(String(item.status).toLowerCase()))
      .reduce((acc, progress) => {
        const itemType = String(curriculumItemsById.get(progress.curriculum_item_id)?.item_type || 'unknown').toLowerCase();
        acc[itemType] = (acc[itemType] || 0) + 1;
        return acc;
      }, {});
    const readingAnalytics = [
      { label: 'Accuracy', value: averageAccuracy },
      { label: 'Engagement', value: readingEngagement },
      {
        label: 'Completion',
        value: totalProgressRecords
          ? Math.round(((completedCurriculum + completedModules) / totalProgressRecords) * 100)
          : 0,
      },
    ];

    return res.json({
      totalStudents: countByRole(users, 'student'),
      totalTeachers: countByRole(users, 'teacher'),
      totalParents: countByRole(users, 'parent'),
      activeUsers,
      disabledUsers,
      enrollmentLabels: Object.keys(enrollmentMap),
      enrollmentTrends: Object.values(enrollmentMap),
      completionRate: totalProgressRecords ? Math.round(((completedCurriculum + completedModules) / totalProgressRecords) * 100) : 0,
      averageProgressScore,
      averageAccuracy,
      readingEngagement,
      readingAttempts: readingAttempts.length,
      practiceSessions: pronunciationSessions.length,
      totalAttempts,
      successfulAttempts,
      failedAttempts,
      wordsCompleted: totalWordsCompleted,
      completedWords: totalWordsCompleted,
      completedPhonetics: completedByItemType.phonetic || completedByItemType.phonetics || 0,
      completedPhrases: completedByItemType.phrase || completedByItemType.phrases || 0,
      completedSentences: completedByItemType.sentence || completedByItemType.sentences || 0,
      completedParagraphs: completedByItemType.paragraph || completedByItemType.paragraphs || 0,
      modulesCompleted: completedModules,
      moduleCompletion: moduleProgress.length ? Math.round((completedModules / moduleProgress.length) * 100) : 0,
      activitiesCompleted: totalActivitiesCompleted,
      wordOfDayCompletions,
      totalBadgeUnlocks,
      badgeCounts,
      badgeStats: {
        studentCount: students.length,
        totalUnlocked: totalBadgeUnlocks,
        counts: badgeCounts,
      },
      levelDistribution,
      beginnerStudents: levelDistribution.beginner || 0,
      intermediateStudents: levelDistribution.intermediate || 0,
      advancedStudents: levelDistribution.advanced || 0,
      activeStudents,
      difficultWords,
      phonemeConfusionPatterns,
      readingAnalytics,
      averageSessionMinutes,
      totalProgressRecords,
      weeklyEnrollments: usersResult.data?.length || 0,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return sendError(res, 500, 'Failed to fetch analytics', error.message);
  }
});

router.get('/reports', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(10, parseInt(req.query.limit, 10) || 25), 100);
    const reportType = String(req.query.type || 'all').toLowerCase();
    const search = String(req.query.search || '').trim().toLowerCase();
    const sortBy = String(req.query.sortBy || 'lastUpdated');
    const sortDir = String(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    const offset = (page - 1) * limit;

    const [
      usersResult,
      studentsResult,
      curriculumItemsResult,
      curriculumProgressResult,
      moduleProgressResult,
      assessmentsResult,
      readingAttemptsResult,
      contentCompletionsResult,
    ] = await Promise.all([
      supabase.from('users').select('*').order('created_at', { ascending: false }),
      supabase.from('students').select('*').order('created_at', { ascending: false }),
      supabase.from('curriculum_items').select('id,item_type,reading_level,content,display_text,is_active,updated_at').order('sequence_no', { ascending: true }).limit(200),
      supabase.from('curriculum_progress').select('*').order('updated_at', { ascending: false }).limit(500),
      supabase.from('student_module_progress').select('*').order('updated_at', { ascending: false }).limit(500),
      supabase.from('assessments').select('*').order('updated_at', { ascending: false }).limit(500),
      supabase.from('reading_attempts').select('*').order('completed_at', { ascending: false }).limit(500),
      supabase.from('student_content_completions').select('*').order('completed_at', { ascending: false }).limit(500),
    ]);

    [
      usersResult,
      studentsResult,
      curriculumItemsResult,
      curriculumProgressResult,
      moduleProgressResult,
      assessmentsResult,
      readingAttemptsResult,
      contentCompletionsResult,
    ].forEach((result) => {
      if (result.error) throw result.error;
    });

    const users = await enrichUsersWithAuth(usersResult.data || []);
    const usersById = new Map(users.map((user) => [user.id, user]));
    const students = studentsResult.data || [];
    const studentsById = new Map(students.map((student) => [student.id, student]));
    const curriculumItems = curriculumItemsResult.data || [];
    const curriculumById = new Map(curriculumItems.map((item) => [item.id, item]));

    const studentName = (studentId) => {
      const student = studentsById.get(studentId);
      const user = student ? usersById.get(student.user_id) : null;
      return getUserDisplayName(user || student || {});
    };

    const reportRows = [];

    users.forEach((user) => {
      reportRows.push({
        id: `user-${user.id}`,
        type: 'Account/user report',
        studentId: user.role === 'student' ? user.studentId : null,
        student: user.role === 'student' ? user.name : '',
        subject: user.name,
        detail: user.email || '',
        status: user.status,
        score: user.emailVerified ? 100 : 0,
        percentageComplete: user.emailVerified ? 100 : 0,
        lastUpdated: user.lastActivityAt || user.updatedAt || user.registeredAt,
      });
    });

    students.forEach((student) => {
      const user = usersById.get(student.user_id);
      reportRows.push({
        id: `student-${student.id}`,
        type: 'Student report',
        studentId: student.id,
        student: getUserDisplayName(user || student),
        subject: student.reading_level || student.practice_level || 'Reading level unavailable',
        detail: `Grade ${student.grade_level || 'unavailable'} | Streak ${student.streak || 0}`,
        status: user?.status || 'active',
        score: Number(student.accuracy || 0),
        percentageComplete: Number(student.activities_completed || student.completed || 0),
        lastUpdated: student.last_practice_date || student.updated_at || student.created_at,
      });
    });

    users.filter((user) => user.role === 'teacher').forEach((teacher) => {
      const assignedCount = students.filter((student) => student.teacher_id === teacher.id).length;
      reportRows.push({
        id: `teacher-${teacher.id}`,
        type: 'Teacher report',
        student: '',
        subject: teacher.name,
        detail: `${assignedCount} assigned students`,
        status: teacher.status,
        score: assignedCount,
        percentageComplete: assignedCount,
        lastUpdated: teacher.lastActivityAt || teacher.updatedAt || teacher.registeredAt,
      });
    });

    curriculumItems.forEach((item) => {
      reportRows.push({
        id: `curriculum-${item.id}`,
        type: 'Curriculum report',
        student: '',
        subject: item.display_text || item.content,
        detail: `${item.reading_level} | ${item.item_type}`,
        status: item.is_active ? 'active' : 'inactive',
        score: '',
        percentageComplete: '',
        lastUpdated: item.updated_at,
      });
    });

    (curriculumProgressResult.data || []).forEach((progress) => {
      const item = curriculumById.get(progress.curriculum_item_id);
      reportRows.push({
        id: `progress-${progress.id}`,
        type: 'Progress report',
        studentId: progress.student_id,
        student: studentName(progress.student_id),
        subject: item?.display_text || item?.content || progress.curriculum_item_id,
        detail: `${progress.attempts_count || 0} attempts`,
        status: progress.status,
        score: Number(progress.best_accuracy || 0),
        percentageComplete: ['completed', 'passed', 'mastered'].includes(String(progress.status).toLowerCase()) ? 100 : 0,
        lastUpdated: progress.updated_at || progress.last_attempt_at,
      });
    });

    (moduleProgressResult.data || []).forEach((progress) => {
      reportRows.push({
        id: `module-${progress.id}`,
        type: 'Progress report',
        studentId: progress.student_id,
        student: studentName(progress.student_id),
        subject: progress.module_id,
        detail: `Module progress ${Math.round(Number(progress.progress || 0))}%`,
        status: progress.status,
        score: progress.assessment_score ?? '',
        percentageComplete: Math.round(Number(progress.progress || 0)),
        lastUpdated: progress.updated_at || progress.last_activity_at,
      });
    });

    (assessmentsResult.data || []).forEach((assessment) => {
      reportRows.push({
        id: `assessment-${assessment.id}`,
        type: 'Assessment report',
        studentId: assessment.student_id,
        student: studentName(assessment.student_id),
        subject: 'Assessment',
        detail: assessment.difficulty_adaptation || assessment.recommended_start_level || '',
        status: assessment.completed_at ? 'completed' : 'started',
        score: assessment.overall_score ?? '',
        percentageComplete: assessment.completed_at ? 100 : 0,
        lastUpdated: assessment.updated_at || assessment.completed_at || assessment.created_at,
      });
    });

    (readingAttemptsResult.data || []).forEach((attempt) => {
      reportRows.push({
        id: `attempt-${attempt.id}`,
        type: 'Assessment report',
        studentId: attempt.student_id,
        student: studentName(attempt.student_id),
        subject: attempt.word_target || attempt.expected_text || attempt.sentence,
        detail: attempt.activity_type || attempt.mode || 'reading attempt',
        status: Number(attempt.accuracy_score) >= 75 ? 'successful' : 'failed',
        score: Math.round(Number(attempt.accuracy_score || 0)),
        percentageComplete: Math.round(Number(attempt.accuracy_score || 0)),
        lastUpdated: attempt.completed_at,
      });
    });

    (contentCompletionsResult.data || []).forEach((completion) => {
      reportRows.push({
        id: `completion-${completion.id}`,
        type: 'Progress report',
        studentId: completion.student_id,
        student: studentName(completion.student_id),
        subject: completion.content_id,
        detail: 'Content completion',
        status: 'completed',
        score: 100,
        percentageComplete: 100,
        lastUpdated: completion.completed_at,
      });
    });

    let filteredRows = reportType === 'all'
      ? reportRows
      : reportRows.filter((row) => row.type.toLowerCase().includes(reportType));

    if (search) {
      filteredRows = filteredRows.filter((row) =>
        [row.student, row.subject, row.detail, row.status]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(search))
      );
    }

    const sortableFields = new Set(['lastUpdated', 'student', 'subject', 'status', 'score', 'percentageComplete', 'type']);
    const sortField = sortableFields.has(sortBy) ? sortBy : 'lastUpdated';
    const sortedRows = [...filteredRows].sort((a, b) => {
      if (sortField === 'lastUpdated') {
        return sortDir * (new Date(a.lastUpdated || 0) - new Date(b.lastUpdated || 0));
      }
      if (sortField === 'score' || sortField === 'percentageComplete') {
        return sortDir * ((Number(a[sortField]) || 0) - (Number(b[sortField]) || 0));
      }
      return sortDir * String(a[sortField] || '').localeCompare(String(b[sortField] || ''));
    });
    const reportData = sortedRows.slice(offset, offset + limit);

    return res.json({
      reports: reportData,
      reportData,
      summary: {
        total: filteredRows.length,
        users: users.length,
        students: students.length,
        curriculumItems: curriculumItems.length,
        progressRecords: (curriculumProgressResult.data || []).length + (moduleProgressResult.data || []).length,
        assessments: (assessmentsResult.data || []).length + (readingAttemptsResult.data || []).length,
      },
      page,
      limit,
      pagination: {
        page,
        limit,
        total: filteredRows.length,
        pages: Math.max(1, Math.ceil(filteredRows.length / limit)),
      },
    });
  } catch (error) {
    console.error('Reports error:', error);
    return sendError(res, 500, 'Failed to fetch reports', error.message);
  }
});

router.get('/feedback', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(10, parseInt(req.query.limit, 10) || 25), 100);
    const offset = (page - 1) * limit;

    const { data, error } = await supabase
      .from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return res.json({ feedback: (data || []).map(normalizeRecord), page, limit });
  } catch (error) {
    console.error('Feedback fetch error:', error);
    return sendError(res, 500, 'Failed to fetch feedback', error.message);
  }
});

router.put('/feedback/:id', async (req, res) => {
  try {
    const { reply, status } = req.body;
    const existingFeedback = await Feedback.findById(req.params.id);
    if (!existingFeedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }

    const updatedFeedback = await Feedback.findByIdAndUpdate(req.params.id, {
      reply,
      status,
    });

    await logAdminAction(req, 'Reply feedback', 'feedback', req.params.id, { status });
    return res.json(updatedFeedback);
  } catch (error) {
    console.error('Update feedback error:', error);
    return sendError(res, 500, 'Failed to update feedback', error.message);
  }
});

router.delete('/feedback/:id', async (req, res) => {
  try {
    const existingFeedback = await Feedback.findById(req.params.id);
    if (!existingFeedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }

    await Feedback.findByIdAndDelete(req.params.id);
    await logAdminAction(req, 'Delete feedback', 'feedback', req.params.id, {});
    return res.json({ message: 'Feedback deleted successfully' });
  } catch (error) {
    console.error('Delete feedback error:', error);
    return sendError(res, 500, 'Failed to delete feedback', error.message);
  }
});

router.get('/logs', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(10, parseInt(req.query.limit, 10) || 100), 200);
    const offset = (page - 1) * limit;

    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    return res.json({ logs: (data || []).map(normalizeRecord), page, limit });
  } catch (error) {
    console.error('Logs fetch error:', error);
    return sendError(res, 500, 'Failed to fetch logs', error.message);
  }
});

// Admin-only view of the real user-facing notifications table (lesson completions,
// practice results, badge unlocks, etc). This is intentionally read-only and scoped
// behind verifyAdmin — it must never be reachable with a browser-supplied userId.
router.get('/notifications', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(Math.max(10, parseInt(req.query.limit, 10) || 50), 200);
    const typeFilter = String(req.query.type || 'all').toLowerCase();
    const offset = (page - 1) * limit;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      if (error.code === 'PGRST205') {
        return res.json({ notifications: [], page, limit, pagination: { page, limit, total: 0, pages: 1 } });
      }
      throw error;
    }

    const rows = data || [];
    const userIds = [...new Set(rows.flatMap((row) => [row.user_id, row.parent_id]).filter(Boolean))];
    const { data: userRows } = userIds.length
      ? await supabase.from('users').select('id,name,email,role').in('id', userIds)
      : { data: [] };
    const usersById = new Map((userRows || []).map((user) => [user.id, user]));

    let notifications = rows.map((row) => {
      const user = usersById.get(row.user_id) || usersById.get(row.parent_id);
      return {
        id: row.id,
        userId: row.user_id,
        userName: getUserDisplayName(user || {}),
        userEmail: user?.email || null,
        userRole: user?.role || null,
        studentId: row.student_id || null,
        title: row.title || null,
        message: row.message || row.body || '',
        type: row.type || 'general',
        isRead: Boolean(row.is_read ?? row.read),
        createdAt: row.created_at,
      };
    });

    if (typeFilter !== 'all') {
      notifications = notifications.filter((row) => String(row.type).toLowerCase() === typeFilter);
    }

    const total = notifications.length;
    const pagedNotifications = notifications.slice(offset, offset + limit);

    return res.json({
      notifications: pagedNotifications,
      page,
      limit,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error('Admin notifications fetch error:', error);
    return sendError(res, 500, 'Failed to fetch notifications', error.message);
  }
});

// Read-only aggregate of the real curriculum library (modules + items). There is no
// generic CMS backend in this product yet, so this intentionally does not expose
// create/edit/delete actions that would not persist anywhere.
router.get('/content', async (req, res) => {
  try {
    const [modulesResult, itemsResult] = await Promise.all([
      supabase.from('curriculum_modules').select('id,title,module_number,reading_level,is_active').order('module_number', { ascending: true }),
      supabase.from('curriculum_items').select('id,item_type,reading_level,is_active'),
    ]);

    if (modulesResult.error) throw modulesResult.error;
    if (itemsResult.error) throw itemsResult.error;

    const modules = modulesResult.data || [];
    const items = itemsResult.data || [];
    // curriculum_items has no module_id foreign key in the live schema; items are
    // organized by reading_level rather than a direct module relationship, so we
    // approximate each module's item pool by matching reading_level instead of
    // inventing a link that doesn't exist in the database.
    const itemCountByLevel = items.reduce((acc, item) => {
      const level = String(item.reading_level || '').toLowerCase();
      if (!level) return acc;
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {});

    const modulesWithCounts = modules.map((module) => ({
      ...module,
      itemCount: itemCountByLevel[String(module.reading_level || '').toLowerCase()] || 0,
    }));

    const itemsByType = items.reduce((acc, item) => {
      const type = String(item.item_type || 'unknown').toLowerCase();
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const itemsByLevel = items.reduce((acc, item) => {
      const level = String(item.reading_level || 'unspecified').toLowerCase();
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {});

    return res.json({
      modules: modulesWithCounts,
      summary: {
        totalModules: modules.length,
        activeModules: modules.filter((module) => module.is_active !== false).length,
        totalItems: items.length,
        activeItems: items.filter((item) => item.is_active !== false).length,
        itemsByType,
        itemsByLevel,
      },
    });
  } catch (error) {
    console.error('Admin content fetch error:', error);
    return sendError(res, 500, 'Failed to fetch content', error.message);
  }
});

export default router;




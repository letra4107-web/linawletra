const express = require('express');
const crypto = require('crypto');
const { verifyAdmin } = require('../middleware/auth');
const { supabase, getSupabaseAuthClient } = require('../config/supabase');
const User = require('../models/User');
const Feedback = require('../models/Feedback');
const Progress = require('../models/Progress');
const Setting = require('../models/Setting');
const Log = require('../models/Log');

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

const countRows = async (table, filterFn) => {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  if (typeof filterFn === 'function') {
    query = filterFn(query);
  }
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
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
  try {
    return res.json({
      status: 'ok',
      backend: 'Supabase',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Admin health error:', error);
    return sendError(res, 500, 'Failed to verify admin health', error.message);
  }
});

router.use(verifyAdmin);

router.get('/overview', async (req, res) => {
  try {
    const [
      totalUsers,
      totalParents,
      totalTeachers,
      totalStudents,
      activeUsers,
      totalLessons,
      totalAssessments,
      totalProgress,
      completedProgress,
      pendingApprovals,
    ] = await Promise.all([
      countRows('users'),
      countRows('users', (query) => query.eq('role', 'parent')),
      countRows('users', (query) => query.eq('role', 'teacher')),
      countRows('users', (query) => query.eq('role', 'student')),
      countRows('users'),
      countRows('lessons'),
      countRows('assessments'),
      countRows('student_progress'),
      countRows('student_progress', (query) => query.eq('completed', true)),
      0,
    ]);

    const { data: roleData, error: roleError } = await supabase.from('users').select('role');
    if (roleError) {
      throw roleError;
    }

    const { data: recentLogData, error: recentLogError } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(6);

    if (recentLogError) {
      throw recentLogError;
    }

    const userRoleBreakdown = (roleData || []).reduce((acc, row) => {
      const role = String(row.role || 'unassigned').toLowerCase();
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});

    const recentActivities = (recentLogData || []).map((item) => ({
      type: item.resource_type || item.action || 'event',
      who: item.user_id || item.user_email || item.user_name || 'System',
      when: item.created_at || item.createdAt || null,
      description: item.action || item.details?.message || 'Action recorded',
    }));

    const response = {
      totalUsers,
      totalParents,
      totalTeachers,
      totalStudents,
      activeUsers,
      pendingApprovals,
      totalLessons,
      totalAssessments,
      totalProgress,
      completedProgress,
      lessonCompletion: totalProgress > 0 ? Math.round((completedProgress / totalProgress) * 100) : 0,
      userRoleBreakdown,
      platformSummary: {
        totalLessons,
        totalAssessments,
        totalProgress,
        completedProgress,
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
    const limit = Math.min(Math.max(10, parseInt(req.query.limit, 10) || 20), 50);
    const offset = (page - 1) * limit;
    const roleFilter = req.query.role;
    const statusFilter = String(req.query.status || '').trim().toLowerCase();
    const search = req.query.search?.trim();

    const statusMapping = {
      pending: 'pending_approval',
      pending_approval: 'pending_approval',
      blocked: 'blocked',
      approved: 'approved',
      rejected: 'rejected',
      archived: 'archived',
      inactive: 'inactive',
    };
    const normalizedStatus = statusMapping[statusFilter] || statusFilter;

    let query = supabase.from('users').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (roleFilter) {
      query = query.eq('role', roleFilter);
    }
    if (statusFilter) {
      if (statusFilter === 'active') {
        query = query;
      } else if (statusFilter === 'inactive') {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      } else {
        query = normalizedStatus === 'approved'
          ? query
          : query.eq('id', '00000000-0000-0000-0000-000000000000');
      }
    }
    if (search) {
      const term = `%${search}%`;
      query = query.or(`full_name.ilike.${term},email.ilike.${term}`);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) {
      throw error;
    }

    return res.json({
      users: (data || []).map(normalizeRecord),
      pagination: {
        page,
        limit,
        total: count ?? data.length,
        pages: Math.max(1, Math.ceil((count ?? data.length) / limit)),
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    return sendError(res, 500, 'Unable to load users. Please try again later.', error.message);
  }
});

router.get('/teachers', async (req, res) => {
  try {
    const { data: teacherRows, error: teacherError } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'teacher')
      .order('created_at', { ascending: false });

    if (teacherError) {
      throw teacherError;
    }

    const teacherIds = (teacherRows || []).map((teacher) => teacher.uid || teacher.id).filter(Boolean);
    let assignments = [];

    if (teacherIds.length) {
      const { data: scheduleRows, error: scheduleError } = await supabase
        .from('schedules')
        .select('teacher_id,student_id,student_name,student_email')
        .in('teacher_id', teacherIds);

      if (scheduleError) {
        throw scheduleError;
      }
      assignments = scheduleRows || [];
    }

    const teacherMap = teacherIds.reduce((acc, id) => {
      acc[id] = { assignedStudents: new Set() };
      return acc;
    }, {});

    assignments.forEach((assignment) => {
      const teacherId = assignment.teacher_id || assignment.teacherId;
      if (!teacherId || !teacherMap[teacherId]) return;
      const studentLabel = assignment.student_name || assignment.studentName || assignment.student_email || assignment.studentEmail || assignment.student_id || assignment.studentId;
      if (studentLabel) {
        teacherMap[teacherId].assignedStudents.add(studentLabel);
      }
    });

    const teachers = (teacherRows || []).map((teacher) => {
      const uid = teacher.uid || teacher.id;
      const { assignedStudents = new Set() } = teacherMap[uid] || {};
      return {
        ...normalizeRecord(teacher),
        email: teacher.email,
        role: teacher.role || 'teacher',
        status: teacher.status || 'active',
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
    const { sendTeacherAccountEmail } = require('../services/emailService');
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
    const { role, isActive, fullName, name, email } = req.body;
    const updateData = {};

    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (fullName !== undefined) updateData.fullName = fullName;
    if (name !== undefined) updateData.fullName = name;
    if (email !== undefined) updateData.email = String(email).toLowerCase();

    const existingUser = await User.findById(req.params.id);
    if (!existingUser) {
      return sendError(res, 404, 'User not found');
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData);

    if (email !== undefined || role !== undefined) {
      const authPayload = {};
      if (email !== undefined) authPayload.email = String(email).toLowerCase();
      if (role !== undefined) authPayload.user_metadata = { role };
      if (Object.keys(authPayload).length) {
        const { error: authError } = await supabase.auth.admin.updateUserById(req.params.id, authPayload);
        if (authError) {
          console.warn('Supabase auth update error:', authError);
        }
      }
    }

    await logAdminAction(req, 'Update user', 'user', req.params.id, updateData);
    return res.json(updatedUser);
  } catch (error) {
    console.error('Update user error:', error);
    return sendError(res, 500, 'Failed to update user', error.message);
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

    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError && !String(authError.message).toLowerCase().includes('not found')) {
      console.error('Supabase auth delete error:', authError);
      return sendError(res, 500, 'Failed to delete user from Supabase Auth', authError.message);
    }

    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return sendError(res, 500, 'Failed to delete user from database');
    }

    await logAdminAction(req, 'Delete user', 'user', userId, {
      email: existingUser.email || 'unknown',
      authDeleted: !authError,
    });

    return res.json({ message: 'User deleted successfully from Supabase Auth and database' });
  } catch (error) {
    console.error('Delete user error:', error);
    return sendError(res, 500, 'Failed to delete user', error.message);
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

    const [usersResult, progressCountResult, completedScoreResult, scoresResult] = await Promise.all([
      supabase.from('users').select('created_at').gt('created_at', since),
      supabase.from('student_progress').select('id', { count: 'exact', head: true }),
      supabase.from('student_progress').select('id', { count: 'exact', head: true }).eq('completed', true),
      supabase.from('student_progress').select('score').not('score', 'is', null),
    ]);

    if (usersResult.error) throw usersResult.error;
    if (progressCountResult.error) throw progressCountResult.error;
    if (completedScoreResult.error) throw completedScoreResult.error;
    if (scoresResult.error) throw scoresResult.error;

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

    const scoreValues = (scoresResult.data || [])
      .map((item) => Number(item.score))
      .filter((score) => !Number.isNaN(score));

    const averageProgressScore = scoreValues.length > 0
      ? Math.round(scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length)
      : 0;

    return res.json({
      enrollmentLabels: Object.keys(enrollmentMap),
      enrollmentTrends: Object.values(enrollmentMap),
      completionRate: (progressCountResult.count || 0) > 0
        ? Math.round(((completedScoreResult.count || 0) / (progressCountResult.count || 0)) * 100)
        : 0,
      averageProgressScore,
      totalProgressRecords: progressCountResult.count || 0,
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
    const offset = (page - 1) * limit;

    const { data, error } = await supabase
      .from('progress')
      .select('*')
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    const reportData = (data || []).map((item) => ({
      id: item.id,
      student: item.student_name || item.student_email || item.student_id || 'No data available',
      lesson: item.lesson_title || item.lesson_id || 'No data available',
      status: item.status || 'No data available',
      score: typeof item.score === 'number' ? item.score : 'No data available',
      percentageComplete: typeof item.percentage_complete === 'number' ? item.percentage_complete : 'No data available',
      lastUpdated: item.updated_at || item.updatedAt || 'No date available',
    }));

    return res.json({ reportData, page, limit });
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

module.exports = router;

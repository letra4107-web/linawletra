/**
 * Supabase Database Service
 * Wrapper functions for Supabase database operations
 * Handles Supabase database operations
 */

import { supabase } from '../config/supabase';

const ADMIN_EMAILS = new Set([
  process.env.REACT_APP_ADMIN_EMAIL?.toLowerCase?.()?.trim(),
  'admin123@gmail.com',
].filter(Boolean));

export const isAdminEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
};

const ensureAuthenticated = async () => {
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    const error = new Error('Session expired. Please log in again.');
    error.code = 'auth/not-authenticated';
    throw error;
  }

  return user;
};

const rethrowError = (error) => {
  if (error?.message?.includes('permission denied')) {
    const permissionError = new Error('You do not have permission to access this resource.');
    permissionError.code = 'permission-denied';
    permissionError.status = 403;
    throw permissionError;
  }

  if (error?.code === 'PGRST116' || error?.message?.includes('Results contain 0 rows')) {
    const notFoundError = new Error('No matching record found.');
    notFoundError.code = 'not-found';
    notFoundError.status = 404;
    throw notFoundError;
  }

  throw error;
};

const sanitizeData = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeData(item))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.entries(value).reduce((acc, [key, nestedValue]) => {
      const sanitizedValue = sanitizeData(nestedValue);
      if (sanitizedValue !== undefined) {
        acc[key] = sanitizedValue;
      }
      return acc;
    }, {});
  }

  return value === undefined ? undefined : value;
};

const normalizeGradeLevel = (value) => {
  if (!value) return null;

  const normalized = String(value).toLowerCase().trim();

  // Map common variations to standard grade levels
  const gradeMap = {
    'k': 'kindergarten',
    'kindergarten': 'kindergarten',
    '1': 'grade_1',
    'grade_1': 'grade_1',
    'grade 1': 'grade_1',
    '2': 'grade_2',
    'grade_2': 'grade_2',
    'grade 2': 'grade_2',
    '3': 'grade_3',
    'grade_3': 'grade_3',
    'grade 3': 'grade_3',
    '4': 'grade_4',
    'grade_4': 'grade_4',
    'grade 4': 'grade_4',
    '5': 'grade_5',
    'grade_5': 'grade_5',
    'grade 5': 'grade_5',
    '6': 'grade_6',
    'grade_6': 'grade_6',
    'grade 6': 'grade_6',
  };

  return gradeMap[normalized] || normalized;
};

/**
 * User operations
 */
export const createOrUpdateUser = async (userId, userData) => {
  try {
    const sanitizedData = sanitizeData(userData);

    const { data, error } = await supabase
      .from('users')
      .upsert({
        id: userId,
        ...sanitizedData,
      }, {
        onConflict: 'id'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating/updating user:', error);
    rethrowError(error);
  }
};

export const getUser = async (userId) => {
  try {
    await ensureAuthenticated();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting user:', error);
    rethrowError(error);
  }
};

export const getUserByEmail = async (email) => {
  try {
    await ensureAuthenticated();
    const normalizedEmail = String(email || '').toLowerCase();

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('email', normalizedEmail)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting user by email:', error);
    rethrowError(error);
  }
};

const createDefaultProfilePayload = (authUser) => {
  const normalizedEmail = String(authUser.email || '').toLowerCase();
  const metadata = authUser.user_metadata || {};
  const safeRole = ['admin', 'teacher', 'parent', 'student'].includes(metadata.role)
    ? metadata.role
    : 'parent';
  const displayName = metadata.fullName || metadata.displayName || metadata.name || normalizedEmail.split('@')[0];

  return {
    id: authUser.id,
    email: normalizedEmail,
    name: displayName,
    role: safeRole,
    email_verified: false,
    metadata: {
      displayName,
      firstName: metadata.firstName || null,
      lastName: metadata.lastName || null,
    },
  };
};

export const getUserByIdOrEmail = async (userId, email) => {
  try {
    // Try to get by userId first
    if (userId) {
      try {
        return await getUser(userId);
      } catch (error) {
        if (error.code !== 'not-found') throw error;
      }
    }

    // Try to get by email
    if (email) {
      try {
        return await getUserByEmail(email);
      } catch (error) {
        if (error.code !== 'not-found') throw error;
      }
    }

    // If we have a valid auth session, create a fallback profile for the signed-in user
    const authUser = await ensureAuthenticated();
    if (!authUser?.id || !authUser?.email) {
      return null;
    }

    console.log('[supabaseService] No profile found, creating fallback profile for auth user:', authUser.email);
    const fallbackData = createDefaultProfilePayload(authUser);
    return await createOrUpdateUser(fallbackData.id, fallbackData);
  } catch (error) {
    console.error('Error getting user by id or email:', error);
    throw error;
  }
};

export const updateUserStatus = async (userId, updates) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating user status:', error);
    rethrowError(error);
  }
};

export const createOrUpdateTeacher = async (teacherId, teacherData) => {
  try {
    const sanitizedData = sanitizeData(teacherData);

    const { data, error } = await supabase
      .from('teachers')
      .upsert({
        user_id: teacherId,
        ...sanitizedData,
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating/updating teacher:', error);
    rethrowError(error);
  }
};

export const deleteUser = async (userId) => {
  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error deleting user:', error);
    rethrowError(error);
  }
};

export const getTeachers = async () => {
  try {
    const { data, error } = await supabase
      .from('teachers')
      .select(`
        *,
        users!inner(*)
      `)
      .eq('status', 'active');

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting teachers:', error);
    rethrowError(error);
  }
};

/**
 * File upload operations
 */
export const uploadFileToStorage = async (file, path) => {
  try {
    const { data, error } = await supabase.storage
      .from('uploads')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('uploads')
      .getPublicUrl(path);

    return {
      path,
      url: publicUrl,
      ...data
    };
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
};

export const createTeacherUpload = async ({
  filename,
  originalName,
  filePath,
  fileUrl,
  fileType,
  fileSize,
  uploadedBy,
  gradeLevel,
  subject,
  isPublic = false,
}) => {
  try {
    const { data, error } = await supabase
      .from('uploaded_files')
      .insert({
        filename,
        original_name: originalName,
        file_path: filePath,
        file_url: fileUrl,
        file_type: fileType,
        file_size: fileSize,
        uploaded_by: uploadedBy,
        grade_level: normalizeGradeLevel(gradeLevel),
        subject,
        is_public: isPublic,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error creating teacher upload:', error);
    rethrowError(error);
  }
};

export const getTeacherUploadsByGradeLevel = async (gradeLevel) => {
  try {
    const normalizedGrade = normalizeGradeLevel(gradeLevel);

    const { data, error } = await supabase
      .from('uploaded_files')
      .select(`
        *,
        users!uploaded_files_uploaded_by_fkey(name)
      `)
      .eq('grade_level', normalizedGrade)
      .eq('is_public', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting teacher uploads:', error);
    rethrowError(error);
  }
};

export const subscribeToTeacherUploadsByGradeLevel = (gradeLevel, onUpdate, onError) => {
  try {
    const normalizedGrade = normalizeGradeLevel(gradeLevel);

    const channel = supabase
      .channel('teacher_uploads')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'uploaded_files',
          filter: `grade_level=eq.${normalizedGrade}`,
        },
        (payload) => {
          onUpdate(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (error) {
    console.error('Error subscribing to teacher uploads:', error);
    onError(error);
  }
};

export const subscribeToCanonicalStudentStats = ({ studentId, userId }, onChange, onError) => {
  try {
    const studentFilters = [studentId && `student_id=eq.${studentId}`, userId && `student_id=eq.${userId}`].filter(Boolean);
    const channel = supabase.channel(`canonical_student_stats_${studentId || userId}`);

    if (studentId) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `id=eq.${studentId}` }, onChange);
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'curriculum_progress', filter: `student_id=eq.${studentId}` }, onChange);
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'reading_attempts', filter: `student_id=eq.${studentId}` }, onChange);
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'word_mastery', filter: `student_id=eq.${studentId}` }, onChange);
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'confusion_patterns', filter: `student_id=eq.${studentId}` }, onChange);
    }

    studentFilters.forEach((filter) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'lesson_progress', filter }, onChange);
    });

    if (userId) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, onChange);
    }

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        onError?.(new Error('Canonical student stats realtime channel failed.'));
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (error) {
    console.error('Error subscribing to canonical student stats:', error);
    onError?.(error);
    return () => {};
  }
};

/**
 * Generic collection operations
 */
export const fetchCollection = async (tableName, options = {}) => {
  try {
    let query = supabase.from(tableName).select(options.select || '*');

    if (options.where) {
      Object.entries(options.where).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
    }

    if (options.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending !== false
      });
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
  } catch (error) {
    console.error(`Error fetching ${tableName}:`, error);
    rethrowError(error);
  }
};

/**
 * Admin operations
 */
export const getAdminOverview = async () => {
  try {
    // Get user counts by role
    const { data: userStats, error: userError } = await supabase
      .from('users')
      .select('role')
      .in('role', ['admin', 'teacher', 'parent', 'student']);

    if (userError) throw userError;

    const roleCounts = userStats.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});

    // Get file upload stats
    const { data: fileStats, error: fileError } = await supabase
      .from('uploaded_files')
      .select('file_type, file_size, created_at')
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (fileError) throw fileError;

    const totalUploads = fileStats.length;
    const totalSize = fileStats.reduce((sum, file) => sum + (file.file_size || 0), 0);

    // Get recent activity
    const { data: recentActivity, error: activityError } = await supabase
      .from('activity_logs')
      .select(`
        *,
        users(name)
      `)
      .order('created_at', { ascending: false })
      .limit(10);

    if (activityError) throw activityError;

    return {
      userStats: roleCounts,
      fileStats: {
        totalUploads,
        totalSize,
        recentUploads: fileStats.slice(0, 5),
      },
      recentActivity,
    };
  } catch (error) {
    console.error('Error getting admin overview:', error);
    rethrowError(error);
  }
};

export const getAdminAnalytics = async () => {
  try {
    // Get user registration trends (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: userTrends, error: userTrendsError } = await supabase
      .from('users')
      .select('created_at, role')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false });

    if (userTrendsError) throw userTrendsError;

    // Get assessment completion rates
    const { data: assessmentStats, error: assessmentError } = await supabase
      .from('assessments')
      .select('completed_at, score, max_score')
      .not('completed_at', 'is', null);

    if (assessmentError && assessmentError.code !== 'PGRST205') throw assessmentError;

    const completedAssessments = (assessmentStats || []).length;
    const averageScore = completedAssessments > 0
      ? assessmentStats.reduce((sum, a) => sum + ((a.score / a.max_score) * 100), 0) / completedAssessments
      : 0;

    // Get student progress stats
    const { data: progressStats, error: progressError } = await supabase
      .from('lesson_progress')
      .select('progress_percentage, completed')
      .eq('completed', true);

    if (progressError && progressError.code !== 'PGRST205') throw progressError;

    const completedMaterials = (progressStats || []).length;
    const averageProgress = (progressStats || []).length > 0
      ? progressStats.reduce((sum, p) => sum + (p.progress_percentage || 0), 0) / progressStats.length
      : 0;

    return {
      userTrends,
      assessmentStats: {
        completedAssessments,
        averageScore: Math.round(averageScore),
      },
      progressStats: {
        completedMaterials,
        averageProgress: Math.round(averageProgress),
      },
    };
  } catch (error) {
    console.error('Error getting admin analytics:', error);
    rethrowError(error);
  }
};

/**
 * Email verification operations
 */
export const saveEmailVerificationCode = async (userId, email, code, options = {}) => {
  try {
    const { data, error } = await supabase
      .from('email_verification_codes')
      .insert({
        user_id: userId,
        email: email.toLowerCase(),
        code,
        expires_at: options.expiresAt,
        resend_available_at: options.resendAvailableAt,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error saving verification code:', error);
    rethrowError(error);
  }
};

export const getEmailVerificationRecord = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('email_verification_codes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting verification record:', error);
    rethrowError(error);
  }
};

export const incrementVerificationAttempts = async (userId, attempts) => {
  try {
    const { error } = await supabase
      .from('email_verification_codes')
      .update({ attempts })
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error incrementing verification attempts:', error);
    rethrowError(error);
  }
};

export const deleteEmailVerificationCode = async (userId) => {
  try {
    const { error } = await supabase
      .from('email_verification_codes')
      .delete()
      .eq('user_id', userId);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting verification code:', error);
    rethrowError(error);
  }
};

/**
 * Teacher provisioning (for backward compatibility)
 */
export const provisionTeacherAuthAccount = async (teacherData = {}, password = '') => {
  // This is now handled in supabaseAuth.js
  // Keeping for backward compatibility
  throw new Error('Use registerTeacherAccount from supabaseAuth instead');
};

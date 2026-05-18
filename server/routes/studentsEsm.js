import express from 'express';
import { supabase } from '../config/supabase.js';
import { sendStudentEnrollmentEmail } from '../services/emailService.js';
import { findLocalUserByEmail, isMissingSupabaseTableError, upsertLocalUser } from '../services/localAuthStore.js';
import { createLocalStudent, getLocalStudentsByParent } from '../services/localStudentStore.js';

const router = express.Router();

const VALID_GRADE_LEVELS = ['1', '2', '3', '4', '5', '6'];
const VALID_READING_LEVELS = ['beginner', 'intermediate', 'advanced'];

const generatePassword = () => {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*';
  const allChars = uppercase + lowercase + numbers + symbols;
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  while (password.length < 12) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

const generateStudentUsername = (studentName) => {
  const cleanName = String(studentName || 'student')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '');
  return `${cleanName || 'student'}${Date.now().toString().slice(-6)}@linaw.local`;
};

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }

    const authUser = data.user;
    const localUser = findLocalUserByEmail(authUser.email);
    const role = String(localUser?.role || authUser.user_metadata?.role || 'user').toLowerCase();

    req.user = {
      id: authUser.id,
      uid: authUser.id,
      email: authUser.email,
      role,
    };

    return next();
  } catch (error) {
    console.error('[Students Auth] Error:', error.message);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

const requireParent = (req, res, next) => {
  if (req.user?.role !== 'parent') {
    return res.status(403).json({ success: false, message: 'Parent account required' });
  }
  return next();
};

router.get('/', authMiddleware, requireParent, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('parent_id', req.user.id);

    if (error) {
      if (isMissingSupabaseTableError(error)) {
        return res.json({ success: true, students: getLocalStudentsByParent(req.user.id) });
      }
      throw error;
    }

    return res.json({ success: true, students: data || [] });
  } catch (error) {
    console.error('[Students] Failed to list students:', error.message);
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch students' });
  }
});

router.post('/', authMiddleware, requireParent, async (req, res) => {
  let authUser = null;

  try {
    const { name, gradeLevel, readingLevel, age, password } = req.body;
    const childName = String(name || '').trim();
    const normalizedGrade = String(gradeLevel || '').trim();

    if (!childName) {
      return res.status(400).json({ success: false, message: 'Student name is required' });
    }

    if (!VALID_GRADE_LEVELS.includes(normalizedGrade)) {
      return res.status(400).json({ success: false, message: 'Grade level must be between 1 and 6' });
    }

    if (!VALID_READING_LEVELS.includes(readingLevel)) {
      return res.status(400).json({ success: false, message: 'Reading level must be beginner, intermediate, or advanced' });
    }

    const studentUsername = generateStudentUsername(childName);
    const studentPassword = password || generatePassword();
    const nameParts = childName.split(' ').filter(Boolean);
    const firstName = nameParts[0] || 'Student';
    const lastName = nameParts.slice(1).join(' ') || 'Learner';

    const authResult = await supabase.auth.admin.createUser({
      email: studentUsername,
      password: studentPassword,
      email_confirm: true,
      user_metadata: {
        role: 'student',
        displayName: childName,
        firstName,
        lastName,
        parentId: req.user.id,
      },
    });

    authUser = authResult.data?.user || null;
    if (authResult.error || !authUser) {
      return res.status(400).json({
        success: false,
        message: authResult.error?.message || 'Failed to create student account',
      });
    }

    const profilePayload = {
      uid: authUser.id,
      id: authUser.id,
      email: studentUsername,
      display_name: childName,
      first_name: firstName,
      last_name: lastName,
      role: 'student',
      email_verified: true,
      account_status: 'active',
      is_active: true,
    };

    let userProfile = null;
    let usingLocalStore = false;
    const profileResult = await supabase
      .from('users')
      .insert(profilePayload)
      .select()
      .single();

    if (profileResult.error) {
      if (isMissingSupabaseTableError(profileResult.error)) {
        usingLocalStore = true;
        userProfile = upsertLocalUser(profilePayload);
      } else {
        throw profileResult.error;
      }
    } else {
      userProfile = profileResult.data;
    }

    const studentPayload = {
      id: authUser.id,
      user_id: userProfile.id,
      parent_id: req.user.id,
      name: childName,
      email: studentUsername,
      grade_level: normalizedGrade,
      reading_level: readingLevel,
      age: age || null,
      enrollment_date: new Date().toISOString().split('T')[0],
    };

    let studentRecord = null;
    if (usingLocalStore) {
      studentRecord = createLocalStudent(studentPayload);
    } else {
      const studentResult = await supabase
        .from('students')
        .insert(studentPayload)
        .select()
        .single();

      if (studentResult.error) {
        if (isMissingSupabaseTableError(studentResult.error)) {
          studentRecord = createLocalStudent(studentPayload);
        } else {
          throw studentResult.error;
        }
      } else {
        studentRecord = studentResult.data;
      }
    }

    const learnerProfile = [
      `Grade ${normalizedGrade}`,
      `${readingLevel} reading level`,
      age ? `${age} years old` : '',
    ].filter(Boolean).join(' - ');

    await sendStudentEnrollmentEmail(
      req.user.email,
      childName,
      studentUsername,
      studentPassword,
      learnerProfile
    );

    return res.status(201).json({
      success: true,
      message: 'Student account created successfully',
      data: {
        student: {
          id: studentRecord.id,
          name: childName,
          email: studentUsername,
          gradeLevel: normalizedGrade,
          readingLevel,
          parentId: req.user.id,
        },
        credentials: {
          email: studentUsername,
          password: studentPassword,
        },
      },
    });
  } catch (error) {
    console.error('[Students] Failed to enroll student:', error.message);
    if (authUser?.id) {
      await supabase.auth.admin.deleteUser(authUser.id).catch(() => {});
    }
    return res.status(500).json({ success: false, message: error.message || 'Failed to create student account' });
  }
});

router.post('/enroll', authMiddleware, requireParent, (req, res, next) => {
  req.url = '/';
  return router.handle(req, res, next);
});

export default router;


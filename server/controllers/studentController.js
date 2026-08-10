import { supabase } from '../config/supabase.js';
import { sendStudentEnrollmentEmail } from '../services/emailService.js';
import { generateStudentCredentials } from '../services/credentialGenerator.js';
import { VALID_READING_LEVELS, normalizeReadingLevel } from '../services/readingLevels.js';
import { canAccessStudent } from '../utils/studentAccess.js';

const VALID_GRADE_LEVELS = ['1', '2', '3', '4', '5', '6'];

const isMissingStudentsTableError = (error) =>
  error?.code === 'PGRST205' &&
  String(error?.message || '').includes("public.students");

const missingStudentsTableMessage =
  "Supabase cannot find public.students in the API schema cache. Run FIX_STUDENTS_TABLE_SCHEMA_CACHE.sql in the Supabase SQL Editor, then retry enrollment.";

const attachUserProfiles = async (students = []) => {
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
    console.warn('[Students] Could not attach user profiles:', error.message);
    return safeStudents.map((student) => ({ ...student, user: null }));
  }

  const usersById = new Map((users || []).map((user) => [user.id, user]));
  return safeStudents.map((student) => ({
    ...student,
    user: usersById.get(student.user_id) || null,
  }));
};

const isValidGradeLevel = (gradeLevel) =>
  gradeLevel === undefined ||
  gradeLevel === null ||
  VALID_GRADE_LEVELS.includes(String(gradeLevel).trim());

const isValidReadingLevel = (readingLevel) =>
  readingLevel === undefined ||
  readingLevel === null ||
  VALID_READING_LEVELS.includes(readingLevel);

// Create student (Parent enrollment)
export const createStudent =async (req, res) => {
  try {
    console.log('[Create Student] Request received');
    console.log('   Body:', req.body);
    console.log('   Parent ID:', req.user?.id);

    const {
      name,
      email,
      age,
      gradeLevel,
      readingLevel,
      notes,
      password,
      profilePin,
      phone,
      address,
      birthDate,
      emergencyContactName,
      emergencyContactPhone,
    } = req.body;

    const parentId = req.user.id;
    const parentEmail = req.user.email;

    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Student name is required',
      });
    }

    if (!gradeLevel || !VALID_GRADE_LEVELS.includes(String(gradeLevel).trim())) {
      return res.status(400).json({
        success: false,
        message: 'Grade level must be between 1 and 6',
      });
    }

    if (!readingLevel || !VALID_READING_LEVELS.includes(readingLevel)) {
      return res.status(400).json({
        success: false,
        message: 'Reading level must be beginner, intermediate, or advanced',
      });
    }

    // Student email is NOT required; username/email is generated server-side.
    // (Keeping `email` field optional to avoid breaking existing clients.)

    const childName = name.trim();


    // Generate username/email + temporary password server-side
    const generatedCredentials = generateStudentCredentials(childName);
    const studentUsername = generatedCredentials.username;
    const studentPassword = password || generatedCredentials.password;

    // Check if student username already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', studentUsername)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('[Create Student] Error checking existing user:', checkError);
      throw checkError;
    }

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'A student account already exists for this child',
      });
    }

    console.log('[Create Student] Creating Supabase Auth user for student');

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: studentUsername,
      password: studentPassword,
      email_confirm: true, // Students don't need email verification
    });

    const authUser = authData?.user;

    if (authError || !authUser) {
      console.error('[Create Student] Failed to create auth user:', authError, authUser);
      return res.status(400).json({
        success: false,
        message: authError?.message || 'Failed to create student account',
      });
    }

    // Parse name into first/last
    const nameParts = childName.split(' ').filter(Boolean);
    const firstName = nameParts[0] || 'Student';
    const lastName = nameParts.slice(1).join(' ') || 'Learner';

    console.log('[Create Student] Creating user profile');

    // Create user profile in database
    const normalizedReadingLevel = normalizeReadingLevel(readingLevel);
    const { data: userProfile, error: insertError } = await supabase
      .from('users')
      .upsert({
        id: authUser.id,
        email: studentUsername,
        name: childName,
        role: 'student',
        parent_id: parentId,
        email_verified: true, // Students created by parents are auto-verified
        metadata: {
          displayName: childName,
          firstName,
          lastName,
          readingLevel: normalizedReadingLevel,
        },
      }, { onConflict: 'id' })
      .select()
      .single();

    if (insertError) {
      console.error('[Create Student] Failed to create user profile:', insertError);
      // Clean up auth user
      await supabase.auth.admin.deleteUser(authUser.id);
      throw insertError;
    }

    console.log('[Create Student] Creating student record');

    // Create student record
    const { data: studentRecord, error: studentError } = await supabase
      .from('students')
      .insert({
        user_id: userProfile.id,
        parent_id: parentId,
        grade_level: gradeLevel || null,
        reading_level: normalizedReadingLevel,
        school: null,
        enrollment_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (studentError) {
      console.error('[Create Student] Failed to create student record:', studentError);
      // Clean up
      await supabase.auth.admin.deleteUser(authUser.id);
      await supabase.from('users').delete().eq('id', userProfile.id);
      if (isMissingStudentsTableError(studentError)) {
        return res.status(503).json({
          success: false,
          message: missingStudentsTableMessage,
          code: studentError.code,
        });
      }
      throw studentError;
    }

    console.log('[Create Student] Sending enrollment email to parent');

    // Send enrollment email to parent with student credentials
    try {
      const learnerProfile = [
        gradeLevel ? `Grade ${gradeLevel}` : '',
        readingLevel ? `${readingLevel} reading level` : '',
        age ? `${age} years old` : '',
      ].filter(Boolean).join(' â€¢ ');

      const emailSent = await sendStudentEnrollmentEmail(
        parentEmail,
        childName,
        studentUsername,
        studentPassword,
        learnerProfile || 'New Student'
      );

      if (!emailSent) {
        console.warn('[Create Student] âš  Failed to send enrollment email');
      } else {
        console.log('[Create Student] âœ“ Enrollment email sent');
      }
    } catch (emailError) {
      console.warn('[Create Student] âš  Email sending failed:', emailError.message);
    }

    console.log('[Create Student] âœ“ Student created successfully');

    res.status(201).json({
      success: true,
      message: 'Student account created successfully',
      data: {
        student: {
          id: userProfile.id,
          studentId: studentRecord.id,
          name: childName,
          email: studentUsername,
          gradeLevel,
          readingLevel: normalizedReadingLevel,
          parentId,
        },
        credentials: {
          email: studentUsername,
          password: studentPassword,
        },
      },
    });
  } catch (error) {
    console.error('[Create Student] Error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create student account',
    });
  }
};

// Get all students for parent
export const getStudentsByParent =async (req, res) => {
  try {
    const parentId = req.user.id;

    console.log('[Get Students] Fetching students for parent:', parentId);

    // Get students linked to this parent, then attach profiles separately so
    // this route does not depend on Supabase's embedded FK cache name.
    const { data: students, error } = await supabase
      .from('students')
      .select('*')
      .eq('parent_id', parentId);

    if (error) {
      console.error('[Get Students] Error:', error);
      if (isMissingStudentsTableError(error)) {
        return res.status(503).json({
          success: false,
          message: missingStudentsTableMessage,
          code: error.code,
        });
      }
      throw error;
    }

    const studentsWithUsers = await attachUserProfiles(students || []);

    console.log('[Get Students] Found students:', studentsWithUsers.length || 0);

    res.json({
      success: true,
      students: studentsWithUsers,
    });
  } catch (error) {
    console.error('[Get Students] Error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch students',
    });
  }
};

// Get single student
export const getStudent =async (req, res) => {
  try {
    const studentId = req.params.id;
    const userRole = req.user.role;
    const userId = req.user.id;

    console.log('[Get Student] Fetching student:', studentId, 'for user:', userId, 'role:', userRole);

    // Get student, then attach profile data separately to avoid brittle FK embed names.
    const { data: student, error } = await supabase
      .from('students')
      .select('*')
      .or(`id.eq.${studentId},user_id.eq.${studentId}`)
      .single();

    if (error || !student) {
      console.error('[Get Student] Student not found:', error);
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    if (!canAccessStudent(req, student)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this student',
      });
    }

    console.log('[Get Student] âœ“ Student found and accessible');

    const [studentWithUser] = await attachUserProfiles([student]);

    res.json({
      success: true,
      student: {
        ...studentWithUser,
        // Progress lives on snake_case columns in Postgres; alias to the
        // camelCase keys the frontend already reads everywhere else.
        wordsCompleted: student.words_completed ?? 0,
        completedWords: student.completed_words ?? [],
        currentPhoneticLevel: student.current_phonetic_level ?? 'Easy',
        progressInCurrentLevel: student.progress_in_level ?? 0,
        highestPhoneticLevel: student.highest_phonetic_level ?? 'Easy',
        hardCyclesCompleted: student.hard_cycles_completed ?? 0,
        hadStreakBreak: student.had_streak_break ?? false,
        unlockedAchievementIds: student.unlocked_achievement_ids ?? [],
        lastLoginDate: student.last_login_date ?? null,
        wordOfDayCompletedDate: student.word_of_day_completed_date ?? null,
      },
    });
  } catch (error) {
    console.error('[Get Student] Error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch student',
    });
  }
};

// Update student
export const updateStudent =async (req, res) => {
  try {
    const studentId = req.params.id;
    const userRole = req.user.role;
    const userId = req.user.id;

    console.log('[Update Student] Updating student:', studentId, 'by user:', userId, 'role:', userRole);

    // Get current student to check permissions
    const { data: existingStudent, error: fetchError } = await supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .single();

    if (fetchError || !existingStudent) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    if (!canAccessStudent(req, existingStudent)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this student',
      });
    }

    // Prepare update data
    const updateData = {};
    const {
      name,
      gradeLevel,
      readingLevel,
      xp,
      wordsCompleted,
      completedWords,
      achievements,
      accuracy,
      completed,
      streak,
      history,
      currentPhoneticLevel,
      progressInCurrentLevel,
      accessibilitySettings,
      highestPhoneticLevel,
      hardCyclesCompleted,
      hadStreakBreak,
      unlockedAchievementIds,
      lastLoginDate,
      wordOfDayCompletedDate,
      longestStreak,
    } = req.body;

    if (gradeLevel !== undefined && gradeLevel !== null && !VALID_GRADE_LEVELS.includes(String(gradeLevel).trim())) {
      return res.status(400).json({
        success: false,
        message: 'Grade level must be between 1 and 6',
      });
    }

    if (readingLevel !== undefined && readingLevel !== null && !VALID_READING_LEVELS.includes(readingLevel)) {
      return res.status(400).json({
        success: false,
        message: 'Reading level must be beginner, intermediate, or advanced',
      });
    }

    const levelChangeRequested = gradeLevel !== undefined || readingLevel !== undefined;
    if (levelChangeRequested && !['admin', 'parent'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Only a parent or admin can change grade or reading level',
      });
    }

    if (name !== undefined) updateData.name = name;
    if (gradeLevel !== undefined) updateData.grade_level = gradeLevel;
    if (readingLevel !== undefined) updateData.reading_level = readingLevel;
    const canWriteProgressFields = userRole === 'admin';

    // Game progress now lives on dedicated students columns (see
    // supabase_migration_student_progress_columns.sql), not users.metadata.
    if (canWriteProgressFields) {
      if (xp !== undefined) updateData.xp = xp;
      if (wordsCompleted !== undefined) updateData.words_completed = wordsCompleted;
      if (completedWords !== undefined) updateData.completed_words = completedWords;
      if (achievements !== undefined) updateData.achievements = achievements;
      if (accuracy !== undefined) updateData.accuracy = accuracy;
      if (completed !== undefined) updateData.completed = completed;
      if (streak !== undefined) updateData.streak = streak;
      if (history !== undefined) updateData.history = history;
      if (currentPhoneticLevel !== undefined) updateData.current_phonetic_level = currentPhoneticLevel;
      if (progressInCurrentLevel !== undefined) updateData.progress_in_level = progressInCurrentLevel;
      if (highestPhoneticLevel !== undefined) updateData.highest_phonetic_level = highestPhoneticLevel;
      if (hardCyclesCompleted !== undefined) updateData.hard_cycles_completed = hardCyclesCompleted;
      if (hadStreakBreak !== undefined) updateData.had_streak_break = hadStreakBreak;
      if (unlockedAchievementIds !== undefined) updateData.unlocked_achievement_ids = unlockedAchievementIds;
      if (lastLoginDate !== undefined) updateData.last_login_date = lastLoginDate;
      if (wordOfDayCompletedDate !== undefined) updateData.word_of_day_completed_date = wordOfDayCompletedDate;
      if (longestStreak !== undefined) updateData.longest_streak = longestStreak;
    }

    let updatedStudent = existingStudent;
    if (Object.keys(updateData).length > 0) {
      const { data, error: updateError } = await supabase
        .from('students')
        .update(updateData)
        .eq('id', studentId)
        .select()
        .single();

      if (updateError) {
        console.error('[Update Student] Update error:', updateError);
        return res.status(500).json({
          success: false,
          message: `Failed to save student progress: ${updateError.message}`,
        });
      }
      updatedStudent = data;
    }

    console.log('[Update Student] ✓ Student updated successfully');

    // accessibilitySettings is a UI preference, not game progress -- it stays
    // on users.metadata rather than the students progress columns.
    if (accessibilitySettings !== undefined && existingStudent.user_id) {
      const { data: currentUser, error: userFetchError } = await supabase
        .from('users')
        .select('metadata')
        .eq('id', existingStudent.user_id)
        .single();

      if (!userFetchError) {
        const { error: userUpdateError } = await supabase
          .from('users')
          .update({
            ...(name !== undefined ? { name } : {}),
            metadata: { ...(currentUser?.metadata || {}), accessibilitySettings },
          })
          .eq('id', existingStudent.user_id);

        if (userUpdateError) {
          console.warn('[Update Student] Failed to save accessibility settings:', userUpdateError.message);
        }
      }
    } else if (name !== undefined && existingStudent.user_id) {
      await supabase.from('users').update({ name }).eq('id', existingStudent.user_id);
    }

    res.json({
      success: true,
      message: 'Student updated successfully',
      student: updatedStudent,
    });
  } catch (error) {
    console.error('[Update Student] Error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update student',
    });
  }
};

// Delete student
export const deleteStudent =async (req, res) => {
  try {
    const studentId = req.params.id;
    const userRole = req.user.role;
    const userId = req.user.id;

    console.log('[Delete Student] Deleting student:', studentId, 'by user:', userId, 'role:', userRole);

    // Get student to check permissions
    const { data: student, error: fetchError } = await supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .single();

    if (fetchError || !student) {
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    const canDeleteStudent = userRole === 'admin' || (userRole === 'parent' && student.parent_id === userId);
    if (!canDeleteStudent) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this student',
      });
    }

    // Delete student record
    const { error: deleteError } = await supabase
      .from('students')
      .delete()
      .eq('id', studentId);

    if (deleteError) {
      console.error('[Delete Student] Delete error:', deleteError);
      throw deleteError;
    }

    // Delete the associated user account from both Supabase Auth and custom users table
    // This ensures the email can be re-registered without "Email already registered" errors
    if (student.user_id) {
      try {
        // Delete from Supabase Auth (required for email reuse)
        const { error: authDeleteError } = await supabase.auth.admin.deleteUser(student.user_id);
        if (authDeleteError && !String(authDeleteError.message).toLowerCase().includes('not found')) {
          console.warn('[Delete Student] Auth delete warning:', authDeleteError.message);
        } else {
          console.log('[Delete Student] âœ“ User deleted from Supabase Auth:', student.user_id);
        }

        // Delete from custom users table
        const { error: userDeleteError } = await supabase
          .from('users')
          .delete()
          .eq('id', student.user_id);

        if (userDeleteError) {
          console.warn('[Delete Student] Failed to delete from users table:', userDeleteError.message);
        } else {
          console.log('[Delete Student] âœ“ User deleted from custom users table:', student.user_id);
        }
      } catch (userError) {
        console.warn('[Delete Student] Error cleaning up user account:', userError.message);
        // Continue with student deletion even if user cleanup fails
      }
    }

    console.log('[Delete Student] âœ“ Student deleted successfully');

    res.json({
      success: true,
      message: 'Student deleted successfully',
    });
  } catch (error) {
    console.error('[Delete Student] Error:', error.message, error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete student',
    });
  }
};




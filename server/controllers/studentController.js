const { supabase } = require('../config/supabase');
const { sendStudentEnrollmentEmail } = require('../services/emailService');
const { generateStudentCredentials } = require('../services/credentialGenerator');

const VALID_GRADE_LEVELS = ['1', '2', '3', '4', '5', '6'];
const VALID_READING_LEVELS = ['beginner', 'intermediate', 'advanced'];

const isValidGradeLevel = (gradeLevel) =>
  gradeLevel === undefined ||
  gradeLevel === null ||
  VALID_GRADE_LEVELS.includes(String(gradeLevel).trim());

const isValidReadingLevel = (readingLevel) =>
  readingLevel === undefined ||
  readingLevel === null ||
  VALID_READING_LEVELS.includes(readingLevel);

// Create student (Parent enrollment)
exports.createStudent = async (req, res) => {
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
    const { data: userProfile, error: insertError } = await supabase
      .from('users')
      .insert({
        uid: authUser.id,
        id: authUser.id,
        email: studentUsername,
        display_name: childName,
        first_name: firstName,
        last_name: lastName,
        role: 'student',
        email_verified: true, // Students created by parents are auto-verified
        account_status: 'active',
        is_active: true,
      })
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
      throw studentError;
    }

    console.log('[Create Student] Sending enrollment email to parent');

    // Send enrollment email to parent with student credentials
    try {
      const learnerProfile = [
        gradeLevel ? `Grade ${gradeLevel}` : '',
        readingLevel ? `${readingLevel} reading level` : '',
        age ? `${age} years old` : '',
      ].filter(Boolean).join(' • ');

      const emailSent = await sendStudentEnrollmentEmail(
        parentEmail,
        childName,
        studentUsername,
        studentPassword,
        learnerProfile || 'New Student'
      );

      if (!emailSent) {
        console.warn('[Create Student] ⚠ Failed to send enrollment email');
      } else {
        console.log('[Create Student] ✓ Enrollment email sent');
      }
    } catch (emailError) {
      console.warn('[Create Student] ⚠ Email sending failed:', emailError.message);
    }

    console.log('[Create Student] ✓ Student created successfully');

    res.status(201).json({
      success: true,
      message: 'Student account created successfully',
      data: {
        student: {
          id: userProfile.id,
          name: childName,
          email: studentUsername,
          gradeLevel,
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
exports.getStudentsByParent = async (req, res) => {
  try {
    const parentId = req.user.id;

    console.log('[Get Students] Fetching students for parent:', parentId);

    // Get students linked to this parent
    const { data: students, error } = await supabase
      .from('students')
      .select(`
        *,
        users!students_parent_id_fkey(*)
      `)
      .eq('parent_id', parentId);

    if (error) {
      console.error('[Get Students] Error:', error);
      throw error;
    }

    console.log('[Get Students] Found students:', students?.length || 0);

    res.json({
      success: true,
      students: students || [],
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
exports.getStudent = async (req, res) => {
  try {
    const studentId = req.params.id;
    const userRole = req.user.role;
    const userId = req.user.id;

    console.log('[Get Student] Fetching student:', studentId, 'for user:', userId, 'role:', userRole);

    // Get student with user data
    const { data: student, error } = await supabase
      .from('students')
      .select(`
        *,
        users!students_user_id_fkey(*)
      `)
      .eq('id', studentId)
      .single();

    if (error || !student) {
      console.error('[Get Student] Student not found:', error);
      return res.status(404).json({
        success: false,
        message: 'Student not found',
      });
    }

    // Parent profile isolation - parents can only see their own children
    if (userRole === 'parent' && student.parent_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this student',
      });
    }

    // Student profile isolation - students can only see their own profile
    if (userRole === 'student' && student.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this student',
      });
    }

    console.log('[Get Student] ✓ Student found and accessible');

    res.json({
      success: true,
      student,
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
exports.updateStudent = async (req, res) => {
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

    // Parent profile isolation - parents can only update their own children
    if (userRole === 'parent' && existingStudent.parent_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to update this student',
      });
    }

    // Prepare update data
    const updateData = {};
    const { name, gradeLevel, readingLevel } = req.body;

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

    if (name !== undefined) updateData.name = name;
    if (gradeLevel !== undefined) updateData.grade_level = gradeLevel;
    if (readingLevel !== undefined) updateData.reading_level = readingLevel;

    // Update student record
    const { data: updatedStudent, error: updateError } = await supabase
      .from('students')
      .update(updateData)
      .eq('id', studentId)
      .select()
      .single();

    if (updateError) {
      console.error('[Update Student] Update error:', updateError);
      throw updateError;
    }

    console.log('[Update Student] ✓ Student updated successfully');

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
exports.deleteStudent = async (req, res) => {
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

    // Parent profile isolation - parents can only delete their own children
    if (userRole === 'parent' && student.parent_id !== userId) {
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
          console.log('[Delete Student] ✓ User deleted from Supabase Auth:', student.user_id);
        }

        // Delete from custom users table
        const { error: userDeleteError } = await supabase
          .from('users')
          .delete()
          .eq('id', student.user_id);

        if (userDeleteError) {
          console.warn('[Delete Student] Failed to delete from users table:', userDeleteError.message);
        } else {
          console.log('[Delete Student] ✓ User deleted from custom users table:', student.user_id);
        }
      } catch (userError) {
        console.warn('[Delete Student] Error cleaning up user account:', userError.message);
        // Continue with student deletion even if user cleanup fails
      }
    }

    console.log('[Delete Student] ✓ Student deleted successfully');

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



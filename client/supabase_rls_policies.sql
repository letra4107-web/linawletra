-- Row Level Security Policies for LinawLetra
-- These policies ensure users can only access their own data and appropriate resources

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Users table policies
-- Users can read their own data
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid()::text = uid);

-- Users can update their own data
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid()::text = uid);

-- Admins can view all users
CREATE POLICY "Admins can view all users" ON users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Admins can update all users
CREATE POLICY "Admins can update all users" ON users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Allow insert for registration (will be handled by auth triggers)
CREATE POLICY "Allow user registration" ON users
  FOR INSERT WITH CHECK (true);

-- Students table policies
-- Students can view their own data
CREATE POLICY "Students can view own data" ON students
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Parents can view their children's data
CREATE POLICY "Parents can view children data" ON students
  FOR SELECT USING (
    parent_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Teachers can view their assigned students
CREATE POLICY "Teachers can view assigned students" ON students
  FOR SELECT USING (
    teacher_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Admins can view all students
CREATE POLICY "Admins can view all students" ON students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Students can update their own data
CREATE POLICY "Students can update own data" ON students
  FOR UPDATE USING (
    user_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Teachers can update assigned students
CREATE POLICY "Teachers can update assigned students" ON students
  FOR UPDATE USING (
    teacher_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Admins can update all students
CREATE POLICY "Admins can update all students" ON students
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Allow insert for student creation
CREATE POLICY "Allow student creation" ON students
  FOR INSERT WITH CHECK (true);

-- Teachers table policies
-- Teachers can view their own data
CREATE POLICY "Teachers can view own data" ON teachers
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Admins can view all teachers
CREATE POLICY "Admins can view all teachers" ON teachers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Teachers can update their own data
CREATE POLICY "Teachers can update own data" ON teachers
  FOR UPDATE USING (
    user_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Admins can update all teachers
CREATE POLICY "Admins can update all teachers" ON teachers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Allow insert for teacher creation
CREATE POLICY "Allow teacher creation" ON teachers
  FOR INSERT WITH CHECK (true);

-- Parents table policies
-- Parents can view their own data
CREATE POLICY "Parents can view own data" ON parents
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Admins can view all parents
CREATE POLICY "Admins can view all parents" ON parents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Parents can update their own data
CREATE POLICY "Parents can update own data" ON parents
  FOR UPDATE USING (
    user_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Admins can update all parents
CREATE POLICY "Admins can update all parents" ON parents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Allow insert for parent creation
CREATE POLICY "Allow parent creation" ON parents
  FOR INSERT WITH CHECK (true);

-- Reading materials policies
-- All authenticated users can view public materials
CREATE POLICY "View public reading materials" ON reading_materials
  FOR SELECT USING (is_public = true);

-- Teachers can view all materials
CREATE POLICY "Teachers can view all materials" ON reading_materials
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'teacher'
    )
  );

-- Admins can view all materials
CREATE POLICY "Admins can view all materials" ON reading_materials
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Teachers can create materials
CREATE POLICY "Teachers can create materials" ON reading_materials
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'teacher'
    )
  );

-- Teachers can update their own materials
CREATE POLICY "Teachers can update own materials" ON reading_materials
  FOR UPDATE USING (
    uploaded_by IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Admins can update all materials
CREATE POLICY "Admins can update all materials" ON reading_materials
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Uploaded files policies
-- Students can view files assigned to them
CREATE POLICY "Students can view assigned files" ON uploaded_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM student_progress sp
      WHERE sp.file_id = uploaded_files.id
      AND sp.student_id IN (
        SELECT id FROM users WHERE uid = auth.uid()::text
      )
    )
  );

-- Teachers can view files they uploaded
CREATE POLICY "Teachers can view own uploads" ON uploaded_files
  FOR SELECT USING (
    uploaded_by IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Teachers can view files for their grade level
CREATE POLICY "Teachers can view grade level files" ON uploaded_files
  FOR SELECT USING (
    grade_level IN (
      SELECT s.grade_level FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE u.uid = auth.uid()::text
    )
  );

-- Admins can view all files
CREATE POLICY "Admins can view all files" ON uploaded_files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Teachers can upload files
CREATE POLICY "Teachers can upload files" ON uploaded_files
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'teacher'
    )
  );

-- Teachers can update their own files
CREATE POLICY "Teachers can update own files" ON uploaded_files
  FOR UPDATE USING (
    uploaded_by IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Admins can update all files
CREATE POLICY "Admins can update all files" ON uploaded_files
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Student progress policies
-- Students can view their own progress
CREATE POLICY "Students can view own progress" ON student_progress
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Parents can view their children's progress
CREATE POLICY "Parents can view children progress" ON student_progress
  FOR SELECT USING (
    student_id IN (
      SELECT s.user_id FROM students s
      WHERE s.parent_id IN (
        SELECT id FROM users WHERE uid = auth.uid()::text
      )
    )
  );

-- Teachers can view progress of assigned students
CREATE POLICY "Teachers can view assigned student progress" ON student_progress
  FOR SELECT USING (
    student_id IN (
      SELECT s.user_id FROM students s
      WHERE s.teacher_id IN (
        SELECT id FROM users WHERE uid = auth.uid()::text
      )
    )
  );

-- Admins can view all progress
CREATE POLICY "Admins can view all progress" ON student_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Students can update their own progress
CREATE POLICY "Students can update own progress" ON student_progress
  FOR UPDATE USING (
    student_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Teachers can update progress of assigned students
CREATE POLICY "Teachers can update assigned student progress" ON student_progress
  FOR UPDATE USING (
    student_id IN (
      SELECT s.user_id FROM students s
      WHERE s.teacher_id IN (
        SELECT id FROM users WHERE uid = auth.uid()::text
      )
    )
  );

-- Allow insert for progress tracking
CREATE POLICY "Allow progress creation" ON student_progress
  FOR INSERT WITH CHECK (true);

-- Notifications policies
-- Users can view their own notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (
    user_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Admins can view all notifications
CREATE POLICY "Admins can view all notifications" ON notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Allow insert for notification creation
CREATE POLICY "Allow notification creation" ON notifications
  FOR INSERT WITH CHECK (true);

-- Activity logs policies
-- Users can view their own activity logs
CREATE POLICY "Users can view own activity logs" ON activity_logs
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Admins can view all activity logs
CREATE POLICY "Admins can view all activity logs" ON activity_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Allow insert for activity logging
CREATE POLICY "Allow activity logging" ON activity_logs
  FOR INSERT WITH CHECK (true);

-- Email verification codes policies
-- Users can view their own verification codes
CREATE POLICY "Users can view own verification codes" ON email_verification_codes
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Users can update their own verification codes
CREATE POLICY "Users can update own verification codes" ON email_verification_codes
  FOR UPDATE USING (
    user_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Allow insert for verification code creation
CREATE POLICY "Allow verification code creation" ON email_verification_codes
  FOR INSERT WITH CHECK (true);

-- Assessments policies
-- Students can view their own assessments
CREATE POLICY "Students can view own assessments" ON assessments
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Parents can view their children's assessments
CREATE POLICY "Parents can view children assessments" ON assessments
  FOR SELECT USING (
    student_id IN (
      SELECT s.user_id FROM students s
      WHERE s.parent_id IN (
        SELECT id FROM users WHERE uid = auth.uid()::text
      )
    )
  );

-- Teachers can view assessments of assigned students
CREATE POLICY "Teachers can view assigned student assessments" ON assessments
  FOR SELECT USING (
    student_id IN (
      SELECT s.user_id FROM students s
      WHERE s.teacher_id IN (
        SELECT id FROM users WHERE uid = auth.uid()::text
      )
    )
  );

-- Admins can view all assessments
CREATE POLICY "Admins can view all assessments" ON assessments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Students can update their own assessments
CREATE POLICY "Students can update own assessments" ON assessments
  FOR UPDATE USING (
    student_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Teachers can update assessments of assigned students
CREATE POLICY "Teachers can update assigned student assessments" ON assessments
  FOR UPDATE USING (
    student_id IN (
      SELECT s.user_id FROM students s
      WHERE s.teacher_id IN (
        SELECT id FROM users WHERE uid = auth.uid()::text
      )
    )
  );

-- Allow insert for assessment creation
CREATE POLICY "Allow assessment creation" ON assessments
  FOR INSERT WITH CHECK (true);

-- Lessons policies
-- All authenticated users can view lessons
CREATE POLICY "View lessons" ON lessons
  FOR SELECT USING (true);

-- Teachers can create lessons
CREATE POLICY "Teachers can create lessons" ON lessons
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'teacher'
    )
  );

-- Teachers can update their own lessons
CREATE POLICY "Teachers can update own lessons" ON lessons
  FOR UPDATE USING (
    created_by IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Admins can update all lessons
CREATE POLICY "Admins can update all lessons" ON lessons
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Schedules policies
-- Users can view their own schedules
CREATE POLICY "Users can view own schedules" ON schedules
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Users can update their own schedules
CREATE POLICY "Users can update own schedules" ON schedules
  FOR UPDATE USING (
    user_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Teachers can view schedules of assigned students
CREATE POLICY "Teachers can view assigned student schedules" ON schedules
  FOR SELECT USING (
    user_id IN (
      SELECT s.user_id FROM students s
      WHERE s.teacher_id IN (
        SELECT id FROM users WHERE uid = auth.uid()::text
      )
    )
  );

-- Admins can view all schedules
CREATE POLICY "Admins can view all schedules" ON schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE uid = auth.uid()::text AND role = 'admin'
    )
  );

-- Allow insert for schedule creation
CREATE POLICY "Allow schedule creation" ON schedules
  FOR INSERT WITH CHECK (true);

-- Settings policies
-- Users can view their own settings
CREATE POLICY "Users can view own settings" ON settings
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Users can update their own settings
CREATE POLICY "Users can update own settings" ON settings
  FOR UPDATE USING (
    user_id IN (
      SELECT id FROM users WHERE uid = auth.uid()::text
    )
  );

-- Allow insert for settings creation
CREATE POLICY "Allow settings creation" ON settings
  FOR INSERT WITH CHECK (true);
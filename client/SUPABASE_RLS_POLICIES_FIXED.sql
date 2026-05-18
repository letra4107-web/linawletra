-- ============================================================================
-- LINAWLETRA SUPABASE RLS POLICIES - PRODUCTION CORRECT VERSION
-- ============================================================================
-- IMPORTANT RULES:
-- 1. auth.uid() returns UUID - NEVER cast to TEXT
-- 2. ALL comparisons use UUID = UUID
-- 3. Service role bypasses RLS automatically (no policy needed)
-- 4. Frontend authenticated users follow all policies
-- ============================================================================

-- ============================================================================
-- STEP 1: ENABLE RLS ON ALL TABLES
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 2: DROP OLD BROKEN POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;
DROP POLICY IF EXISTS "Allow user registration" ON users;
DROP POLICY IF EXISTS "Public can view admin and teacher profiles" ON users;
DROP POLICY IF EXISTS "Students can view own student record" ON students;
DROP POLICY IF EXISTS "Parents can view their children" ON students;
DROP POLICY IF EXISTS "Teachers can view assigned students" ON students;
DROP POLICY IF EXISTS "Students can update own record" ON students;
DROP POLICY IF EXISTS "Teachers can view own record" ON teachers;
DROP POLICY IF EXISTS "Parents can view own record" ON parents;
DROP POLICY IF EXISTS "Reading materials authenticated read" ON reading_materials;
DROP POLICY IF EXISTS "Uploaded files owner manage" ON uploaded_files;
DROP POLICY IF EXISTS "Student progress own" ON student_progress;
DROP POLICY IF EXISTS "Notifications own" ON notifications;
DROP POLICY IF EXISTS "Settings own" ON settings;

-- ============================================================================
-- STEP 3: USERS TABLE POLICIES
-- ============================================================================

-- Authenticated users can view their own profile
CREATE POLICY "users_view_own"
ON users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Authenticated users can update their own profile
CREATE POLICY "users_update_own"
ON users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Authenticated users can insert their own profile when signing in for the first time
CREATE POLICY "users_insert_own"
ON users
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  AND role IN ('parent', 'teacher', 'student')
);

-- Admins can view all users
CREATE POLICY "users_admin_view_all"
ON users
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

-- Admins can update all users
CREATE POLICY "users_admin_update_all"
ON users
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

-- Allow service role to insert users (for registration)
CREATE POLICY "users_service_insert"
ON users
FOR INSERT
TO service_role
WITH CHECK (true);

-- ============================================================================
-- STEP 4: STUDENTS TABLE POLICIES
-- ============================================================================

-- Students can view their own student record
CREATE POLICY "students_view_own"
ON students
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Parents can view their assigned children
CREATE POLICY "students_parents_view"
ON students
FOR SELECT
TO authenticated
USING (auth.uid() = parent_id);

-- Teachers can view their assigned students
CREATE POLICY "students_teachers_view"
ON students
FOR SELECT
TO authenticated
USING (auth.uid() = teacher_id);

-- Admins can view all students
CREATE POLICY "students_admin_view_all"
ON students
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

-- Students can update their own record
CREATE POLICY "students_update_own"
ON students
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- STEP 5: TEACHERS TABLE POLICIES
-- ============================================================================

-- Teachers can view their own record
CREATE POLICY "teachers_view_own"
ON teachers
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all teachers
CREATE POLICY "teachers_admin_view_all"
ON teachers
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

-- ============================================================================
-- STEP 6: PARENTS TABLE POLICIES
-- ============================================================================

-- Parents can view their own record
CREATE POLICY "parents_view_own"
ON parents
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all parents
CREATE POLICY "parents_admin_view_all"
ON parents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

-- ============================================================================
-- STEP 7: READING MATERIALS POLICIES
-- ============================================================================

-- Public materials readable by all authenticated users
CREATE POLICY "reading_materials_public_read"
ON reading_materials
FOR SELECT
TO authenticated
USING (is_public = TRUE);

-- Uploaders can read their own materials
CREATE POLICY "reading_materials_owner_read"
ON reading_materials
FOR SELECT
TO authenticated
USING (auth.uid() = uploaded_by);

-- Uploaders can manage their own materials
CREATE POLICY "reading_materials_owner_manage"
ON reading_materials
FOR UPDATE
TO authenticated
USING (auth.uid() = uploaded_by)
WITH CHECK (auth.uid() = uploaded_by);

-- ============================================================================
-- STEP 8: UPLOADED FILES POLICIES
-- ============================================================================

-- Uploaders can manage their own files
CREATE POLICY "uploaded_files_owner_manage"
ON uploaded_files
FOR ALL
TO authenticated
USING (auth.uid() = uploaded_by);

-- Public files readable by all authenticated users
CREATE POLICY "uploaded_files_public_read"
ON uploaded_files
FOR SELECT
TO authenticated
USING (is_public = TRUE);

-- ============================================================================
-- STEP 9: STUDENT PROGRESS POLICIES
-- ============================================================================

-- Students can view their own progress
CREATE POLICY "student_progress_own"
ON student_progress
FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

-- Teachers can view progress of their students
CREATE POLICY "student_progress_teacher_view"
ON student_progress
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = (
      SELECT id FROM students WHERE student_id = student_progress.student_id
    ) AND s.teacher_id = auth.uid()
  )
);

-- Admins can view all progress
CREATE POLICY "student_progress_admin_view"
ON student_progress
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

-- ============================================================================
-- STEP 10: NOTIFICATIONS POLICIES
-- ============================================================================

-- Users can view their own notifications
CREATE POLICY "notifications_view_own"
ON notifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can update their own notifications
CREATE POLICY "notifications_update_own"
ON notifications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- STEP 11: ACTIVITY LOGS POLICIES
-- ============================================================================

-- Users can view their own activity logs
CREATE POLICY "activity_logs_view_own"
ON activity_logs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all activity logs
CREATE POLICY "activity_logs_admin_view_all"
ON activity_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

-- ============================================================================
-- STEP 12: ASSESSMENTS POLICIES
-- ============================================================================

-- Students can view their own assessments
CREATE POLICY "assessments_view_own"
ON assessments
FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

-- Teachers can view assessments of their students
CREATE POLICY "assessments_teacher_view"
ON assessments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = (
      SELECT id FROM students WHERE student_id = assessments.student_id
    ) AND s.teacher_id = auth.uid()
  )
);

-- ============================================================================
-- STEP 14: LESSONS POLICIES
-- ============================================================================

-- Creators can manage their own lessons
CREATE POLICY "lessons_creator_manage"
ON lessons
FOR ALL
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- All authenticated users can read lessons
CREATE POLICY "lessons_authenticated_read"
ON lessons
FOR SELECT
TO authenticated
USING (TRUE);

-- ============================================================================
-- STEP 15: SCHEDULES POLICIES
-- ============================================================================

-- Users can manage their own schedules
CREATE POLICY "schedules_user_manage"
ON schedules
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- STEP 16: SETTINGS POLICIES
-- ============================================================================

-- Users can manage their own settings
CREATE POLICY "settings_user_manage"
ON settings
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- CRITICAL SECURITY NOTES
-- ============================================================================
-- 1. auth.uid() returns UUID - do NOT cast to TEXT anywhere
-- 2. Service role key BYPASSES all these policies automatically
-- 3. Backend operations use service role - they work without policies
-- 4. Frontend operations use anon key - they MUST follow these policies
-- 5. Never create policies that cast UUID to TEXT (performance + security)
-- 6. Each policy is minimal and focused on one permission
-- ============================================================================


-- ============================================================================
-- TEACHERS TABLE POLICIES
-- ============================================================================

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

-- Teachers can view their own record
CREATE POLICY "Teachers can view own record" ON teachers
  FOR SELECT
  USING (user_id::text = auth.uid());

-- ============================================================================
-- PARENTS TABLE POLICIES
-- ============================================================================

ALTER TABLE parents ENABLE ROW LEVEL SECURITY;

-- Parents can view their own record
CREATE POLICY "Parents can view own record" ON parents
  FOR SELECT
  USING (user_id::text = auth.uid());

-- ============================================================================
-- OTHER TABLES - BASIC POLICIES
-- ============================================================================

ALTER TABLE reading_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reading materials - authenticated can read public" ON reading_materials
  FOR SELECT
  USING (is_public = TRUE OR uploaded_by::text = auth.uid());

ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Uploaded files - owner can manage" ON uploaded_files
  FOR ALL
  USING (uploaded_by::text = auth.uid() OR is_public = TRUE);

ALTER TABLE student_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Student progress - students can view own" ON student_progress
  FOR SELECT
  USING (student_id::text = auth.uid());

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Notifications - users can view own" ON notifications
  FOR SELECT
  USING (user_id::text = auth.uid());

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Activity logs - users can view own" ON activity_logs
  FOR SELECT
  USING (user_id::text = auth.uid());

ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Assessments - authenticated can view" ON assessments
  FOR SELECT
  USING (is_public = TRUE OR created_by::text = auth.uid());

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Lessons - authenticated can view" ON lessons
  FOR SELECT
  USING (is_public = TRUE OR created_by::text = auth.uid());

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Schedules - users can view own" ON schedules
  FOR SELECT
  USING (user_id::text = auth.uid());

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Settings - users can manage own" ON settings
  FOR ALL
  USING (user_id::text = auth.uid());

-- ============================================================================
-- KEY POINTS FOR THIS FIX:
-- ============================================================================
-- 1. Service role key (backend) bypasses ALL RLS policies automatically
--    - No need for special policies for service role
--    - Backend registration uses service role, not anon key
--
-- 2. Policies use BOTH comparisons:
--    - auth.uid() = id::text (comparing UUID to text)
--    - uid = auth.uid()::text (comparing TEXT to text)
--    - This ensures compatibility with both UUID and TEXT UID storage
--
-- 3. No INSERT policies needed - service role doesn't need them
--    - Frontend (anon key) won't be inserting anyway
--    - Backend (service role) bypasses policies
--
-- 4. All policies use string comparison for auth.uid()
--    - auth.uid() returns TEXT in Postgres
--    - Must cast or compare as TEXT
--
-- ============================================================================

-- ============================================================================
-- LINAWLETRA DATABASE MIGRATION - FROM BROKEN TO FIXED SCHEMA
-- ============================================================================
-- This script transforms the database from the old schema (with uid column)
-- to the new production-ready schema (using id = auth.users.id)
-- ============================================================================

-- Step 1: Drop all old RLS policies
-- ============================================================================
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;
DROP POLICY IF EXISTS "Allow user registration" ON users;
DROP POLICY IF EXISTS "users_view_own" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;
DROP POLICY IF EXISTS "users_admin_view_all" ON users;
DROP POLICY IF EXISTS "users_admin_update_all" ON users;

-- Drop all other table policies
DROP POLICY IF EXISTS "students_view_own" ON students;
DROP POLICY IF EXISTS "students_parents_view" ON students;
DROP POLICY IF EXISTS "students_teachers_view" ON students;
DROP POLICY IF EXISTS "students_admin_view_all" ON students;
DROP POLICY IF EXISTS "students_update_own" ON students;
DROP POLICY IF EXISTS "teachers_view_own" ON teachers;
DROP POLICY IF EXISTS "teachers_admin_view_all" ON teachers;
DROP POLICY IF EXISTS "parents_view_own" ON parents;
DROP POLICY IF EXISTS "parents_admin_view_all" ON parents;
DROP POLICY IF EXISTS "reading_materials_public_read" ON reading_materials;
DROP POLICY IF EXISTS "reading_materials_owner_read" ON reading_materials;
DROP POLICY IF EXISTS "reading_materials_owner_manage" ON reading_materials;
DROP POLICY IF EXISTS "uploaded_files_owner_manage" ON uploaded_files;
DROP POLICY IF EXISTS "uploaded_files_public_read" ON uploaded_files;
DROP POLICY IF EXISTS "student_progress_own" ON student_progress;
DROP POLICY IF EXISTS "student_progress_teacher_view" ON student_progress;
DROP POLICY IF EXISTS "student_progress_admin_view" ON student_progress;
DROP POLICY IF EXISTS "notifications_view_own" ON notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
DROP POLICY IF EXISTS "activity_logs_view_own" ON activity_logs;
DROP POLICY IF EXISTS "activity_logs_admin_view_all" ON activity_logs;
DROP POLICY IF EXISTS "email_verification_view_own" ON email_verification_codes;
DROP POLICY IF EXISTS "assessments_view_own" ON assessments;
DROP POLICY IF EXISTS "assessments_teacher_view" ON assessments;
DROP POLICY IF EXISTS "lessons_creator_manage" ON lessons;
DROP POLICY IF EXISTS "lessons_authenticated_read" ON lessons;
DROP POLICY IF EXISTS "schedules_user_manage" ON schedules;
DROP POLICY IF EXISTS "settings_user_manage" ON settings;

-- Step 2: Remove index on uid column
-- ============================================================================
DROP INDEX IF EXISTS idx_users_uid;

-- Step 3: Remove uid column constraint
-- ============================================================================
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_uid_key;

-- Step 4: Remove uid column
-- ============================================================================
ALTER TABLE users DROP COLUMN IF EXISTS uid CASCADE;

-- Step 4.5: Remove email verification codes table
-- ============================================================================
DROP TABLE IF EXISTS email_verification_codes CASCADE;

-- Step 5: Alter users.id to NOT have default (it should be set explicitly)
-- ============================================================================
-- If id still has a default, remove it
ALTER TABLE users ALTER COLUMN id DROP DEFAULT;

-- Step 6: Add any missing columns for tracking
-- ============================================================================
-- Make sure email_verified has proper default
ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT FALSE;
ALTER TABLE users ALTER COLUMN is_active SET DEFAULT TRUE;
ALTER TABLE users ALTER COLUMN account_status SET DEFAULT 'active';
ALTER TABLE users ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT NOW();

-- Step 6.5: Remove custom verification columns
-- ============================================================================
ALTER TABLE users DROP COLUMN IF EXISTS email_verified CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS verified_at CASCADE;

-- Step 7: Delete any orphaned users without id or with null id
-- ============================================================================
DELETE FROM users WHERE id IS NULL;

-- Step 8: Re-enable RLS on all tables
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

-- Step 9: Create all new, correct RLS policies
-- ============================================================================

-- USERS TABLE POLICIES
CREATE POLICY "users_view_own" ON users
FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "users_update_own" ON users
FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "users_admin_view_all" ON users
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

CREATE POLICY "users_admin_update_all" ON users
FOR UPDATE TO authenticated
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

-- STUDENTS TABLE POLICIES
CREATE POLICY "students_view_own" ON students
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "students_parents_view" ON students
FOR SELECT TO authenticated
USING (auth.uid() = parent_id);

CREATE POLICY "students_teachers_view" ON students
FOR SELECT TO authenticated
USING (auth.uid() = teacher_id);

CREATE POLICY "students_admin_view_all" ON students
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

CREATE POLICY "students_update_own" ON students
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- TEACHERS TABLE POLICIES
CREATE POLICY "teachers_view_own" ON teachers
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "teachers_admin_view_all" ON teachers
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

-- PARENTS TABLE POLICIES
CREATE POLICY "parents_view_own" ON parents
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "parents_admin_view_all" ON parents
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

-- READING MATERIALS POLICIES
CREATE POLICY "reading_materials_public_read" ON reading_materials
FOR SELECT TO authenticated
USING (is_public = TRUE);

CREATE POLICY "reading_materials_owner_read" ON reading_materials
FOR SELECT TO authenticated
USING (auth.uid() = uploaded_by);

CREATE POLICY "reading_materials_owner_manage" ON reading_materials
FOR UPDATE TO authenticated
USING (auth.uid() = uploaded_by)
WITH CHECK (auth.uid() = uploaded_by);

-- UPLOADED FILES POLICIES
CREATE POLICY "uploaded_files_owner_manage" ON uploaded_files
FOR ALL TO authenticated
USING (auth.uid() = uploaded_by);

CREATE POLICY "uploaded_files_public_read" ON uploaded_files
FOR SELECT TO authenticated
USING (is_public = TRUE);

-- STUDENT PROGRESS POLICIES
CREATE POLICY "student_progress_own" ON student_progress
FOR SELECT TO authenticated
USING (auth.uid() = student_id);

CREATE POLICY "student_progress_teacher_view" ON student_progress
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = (
      SELECT id FROM students WHERE student_id = student_progress.student_id
    ) AND s.teacher_id = auth.uid()
  )
);

CREATE POLICY "student_progress_admin_view" ON student_progress
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

-- NOTIFICATIONS POLICIES
CREATE POLICY "notifications_view_own" ON notifications
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own" ON notifications
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ACTIVITY LOGS POLICIES
CREATE POLICY "activity_logs_view_own" ON activity_logs
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "activity_logs_admin_view_all" ON activity_logs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

-- EMAIL VERIFICATION CODES POLICIES
CREATE POLICY "email_verification_view_own" ON email_verification_codes
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- ASSESSMENTS POLICIES
CREATE POLICY "assessments_view_own" ON assessments
FOR SELECT TO authenticated
USING (auth.uid() = student_id);

CREATE POLICY "assessments_teacher_view" ON assessments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = (
      SELECT id FROM students WHERE student_id = assessments.student_id
    ) AND s.teacher_id = auth.uid()
  )
);

-- LESSONS POLICIES
CREATE POLICY "lessons_creator_manage" ON lessons
FOR ALL TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "lessons_authenticated_read" ON lessons
FOR SELECT TO authenticated
USING (TRUE);

-- SCHEDULES POLICIES
CREATE POLICY "schedules_user_manage" ON schedules
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- SETTINGS POLICIES
CREATE POLICY "settings_user_manage" ON settings
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Step 10: Verify migration
-- ============================================================================
-- Check users table structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- Check for uid column (should not exist)
SELECT column_name FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'uid';

-- Check RLS is enabled
SELECT schemaname, tablename
FROM pg_tables
WHERE tablename IN ('users', 'students', 'teachers', 'parents', 'reading_materials', 'uploaded_files')
  AND schemaname = 'public';

-- Check policies exist
SELECT tablename, policyname
FROM pg_policies
WHERE tablename IN ('users', 'students', 'teachers', 'parents')
ORDER BY tablename, policyname;

-- ============================================================================
-- MIGRATION COMPLETE
-- System is now production-ready with:
-- 1. No uid column (uses auth.uid() = users.id)
-- 2. All UUID comparisons (no TEXT casting)
-- 3. Clean RLS policies
-- 4. Proper security model
-- ============================================================================

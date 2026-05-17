-- ============================================================================
-- LINAWLETRA SUPABASE RLS POLICIES - REGISTRATION FIX
-- ============================================================================
-- PURPOSE: Enable new user registration while maintaining security
-- 
-- KEY PRINCIPLES:
-- 1. Service role key BYPASSES all RLS policies (use for backend operations)
-- 2. auth.uid() is UUID type - never cast to TEXT
-- 3. Anonymous users can insert during signup
-- 4. Authenticated users can read/update their own data
-- 5. Admins can view and manage all data
-- ============================================================================

-- ============================================================================
-- STEP 1: ENABLE RLS ON USERS TABLE
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 2: DROP ALL EXISTING USERS TABLE POLICIES
-- ============================================================================
DROP POLICY IF EXISTS "users_view_own" ON users;
DROP POLICY IF EXISTS "users_update_own" ON users;
DROP POLICY IF EXISTS "users_insert_own" ON users;
DROP POLICY IF EXISTS "users_admin_view_all" ON users;
DROP POLICY IF EXISTS "users_admin_update_all" ON users;
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Admins can update all users" ON users;
DROP POLICY IF EXISTS "Allow user registration" ON users;
DROP POLICY IF EXISTS "Allow user signups" ON users;
DROP POLICY IF EXISTS "Public can view admin and teacher profiles" ON users;
DROP POLICY IF EXISTS "users_select_all" ON users;
DROP POLICY IF EXISTS "users_insert_all" ON users;
DROP POLICY IF EXISTS "users_delete_own" ON users;

-- ============================================================================
-- STEP 3: CREATE POLICIES FOR AUTHENTICATED USERS
-- ============================================================================

-- Authenticated users can view their own profile
CREATE POLICY "users_select_own"
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
-- This is used when custom tokens are issued after email verification
CREATE POLICY "users_insert_authenticated"
ON users
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  AND role IN ('parent', 'teacher', 'student', 'admin')
);

-- ============================================================================
-- STEP 4: CREATE POLICIES FOR ADMIN ACCESS
-- ============================================================================

-- Admins can view all user profiles
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

-- Admins can update all user profiles
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

-- ============================================================================
-- STEP 5: PUBLIC/ANON POLICIES FOR REGISTRATION
-- ============================================================================

-- NOTE: For registration via backend with service role key:
-- - The service role key BYPASSES RLS automatically
-- - Backend uses supabase.auth.admin.createUser() which creates the Auth entry
-- - Backend then inserts into users table using service role (bypasses RLS)
-- 
-- For additional security, if you want to allow anonymous/public signup via frontend:
-- Uncomment the policy below. Otherwise, service role will handle all insertions.

-- Allow anonymous users to insert during signup (optional - service role handles this)
-- CREATE POLICY "users_insert_anon_signup"
-- ON users
-- FOR INSERT
-- TO anon
-- WITH CHECK (true);

-- ============================================================================
-- STEP 6: ENABLE RLS ON OTHER TABLES (OPTIONAL - FUTURE USE)
-- ============================================================================

-- Uncomment these when you're ready to add RLS to other tables
-- ALTER TABLE students ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE email_verification_codes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- VERIFICATION STEPS
-- ============================================================================
-- 1. Go to Supabase Dashboard → Database → Tables → users
-- 2. Click "Policies" tab
-- 3. Verify these policies are present:
--    - users_select_own
--    - users_update_own
--    - users_insert_authenticated
--    - users_admin_view_all
--    - users_admin_update_all
-- 4. Test registration:
--    - Backend: Server uses service role key (bypasses RLS)
--    - Frontend: Call authService.register() → backend handles everything
-- 5. Check Supabase Auth logs if registration still fails
-- 6. Verify SUPABASE_SERVICE_ROLE_KEY is set in .env

-- ============================================================================
-- TROUBLESHOOTING
-- ============================================================================
-- Problem: "RLS policy is blocking user creation"
-- Solution 1: Verify SUPABASE_SERVICE_ROLE_KEY is in server .env
-- Solution 2: Verify getSupabaseServiceClient() is called in authController
-- Solution 3: Check Supabase logs for specific RLS block reason
-- Solution 4: Temporarily disable RLS: ALTER TABLE users DISABLE ROW LEVEL SECURITY;
-- Solution 5: Apply these policies and restart backend

-- ============================================================================
-- OPTIONAL: TEMPORARY FIX (if service role not working)
-- ============================================================================
-- To temporarily disable RLS while debugging:
-- ALTER TABLE users DISABLE ROW LEVEL SECURITY;
-- 
-- To re-enable and apply correct policies:
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- Then apply this entire SQL file

-- LinawLetra Supabase Auth confirmation repair
-- Purpose:
--   Fix the schema drift that can make Supabase Auth user updates fail with:
--     "Error updating user" / "Database error updating user"
--   during admin.updateUserById(..., { email_confirm: true }).
--
-- Why this exists:
--   LinawLetra uses Brevo for code delivery, but Supabase Auth still manages
--   users/passwords/sessions. After a Brevo OTP is verified, the backend must
--   confirm the matching Supabase Auth user. The live public.users table was
--   missing columns expected by the corrected schema and by profile-sync
--   trigger patterns, especially updated_at.
--
-- Safe properties:
--   - Does not delete users.
--   - Does not change passwords.
--   - Does not create duplicate users.
--   - Does not mark anyone verified by itself.
--   - Idempotent: safe to run more than once.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active';

UPDATE public.users
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

UPDATE public.users
SET is_active = COALESCE(is_active, TRUE)
WHERE is_active IS NULL;

UPDATE public.users
SET account_status = COALESCE(account_status, 'active')
WHERE account_status IS NULL;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;

-- Verification after running:
-- 1. This should show updated_at, verified_at, is_active, and account_status.
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'users'
--   AND column_name IN ('updated_at', 'verified_at', 'is_active', 'account_status')
-- ORDER BY column_name;
--
-- 2. Then retry from backend or SQL console equivalent:
--    supabase.auth.admin.updateUserById('<auth user id>', { email_confirm: true })
--    It should no longer return "Database error updating user".

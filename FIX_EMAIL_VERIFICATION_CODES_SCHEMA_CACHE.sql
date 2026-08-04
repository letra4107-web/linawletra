-- Fix for: "Registration failed because the verification code could not be saved."
--
-- Root cause: MIGRATION_TO_FIXED_SCHEMA.sql (archived — see archive/ folder) contained
-- `DROP TABLE IF EXISTS email_verification_codes CASCADE;`. If that script ever ran against
-- this project, the table storeSignupVerificationCode() writes to
-- (server/controllers/authController.js) no longer exists, so every registration's insert
-- fails and gets mapped to the generic "could not be saved" message.
--
-- Run this in Supabase Dashboard > SQL Editor for the project used by server/.env.
-- It is safe to run more than once.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.email_verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  resend_available_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.email_verification_codes
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resend_available_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_email_verification_codes_user_id ON public.email_verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verification_codes_expires_at ON public.email_verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_email_verification_codes_user_email ON public.email_verification_codes(user_id, email);

ALTER TABLE public.email_verification_codes ENABLE ROW LEVEL SECURITY;

-- The server writes/reads this table with the service-role key (bypasses RLS), but these
-- policies are kept so the table also behaves correctly if ever queried with a non-service key.
DROP POLICY IF EXISTS "Allow verification code creation" ON public.email_verification_codes;
CREATE POLICY "Allow verification code creation"
ON public.email_verification_codes
FOR INSERT
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own verification codes" ON public.email_verification_codes;
CREATE POLICY "Users can view own verification codes"
ON public.email_verification_codes
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own verification codes" ON public.email_verification_codes;
CREATE POLICY "Users can update own verification codes"
ON public.email_verification_codes
FOR UPDATE
USING (auth.uid() = user_id);

-- Force PostgREST (the API layer used by supabase-js) to reload table metadata.
NOTIFY pgrst, 'reload schema';

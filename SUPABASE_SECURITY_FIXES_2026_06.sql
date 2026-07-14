-- LinawLetra security and reliability fixes - June 2026

-- Restrict users INSERT policy so only parents can self-register.
DROP POLICY IF EXISTS "users_insert_own" ON users;
DROP POLICY IF EXISTS "Allow user registration" ON users;

CREATE POLICY "users_insert_parent_self_only"
ON users
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  AND role = 'parent'
);

DROP POLICY IF EXISTS "Allow student creation" ON students;

-- Auto-update updated_at columns.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','students','teachers','parents','reading_materials','uploaded_files','student_progress','assessments','lessons','schedules','settings']
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON %I;
       CREATE TRIGGER set_updated_at
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      t, t
    );
  END LOOP;
END $$;

-- Dedicated email verification code table.
CREATE TABLE IF NOT EXISTS email_verification_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  resend_available_at TIMESTAMPTZ,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE email_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_email_verification_codes_user_email
  ON email_verification_codes (user_id, email);

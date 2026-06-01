-- Fix for: Could not find the table 'public.students' in the schema cache
--
-- Run this in Supabase Dashboard > SQL Editor for the project used by server/.env.
-- It is safe to run more than once.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  grade_level TEXT,
  school TEXT,
  enrollment_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grade_level TEXT,
  ADD COLUMN IF NOT EXISTS school TEXT,
  ADD COLUMN IF NOT EXISTS enrollment_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_user_id_unique ON public.students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_parent_id ON public.students(parent_id);
CREATE INDEX IF NOT EXISTS idx_students_teacher_id ON public.students(teacher_id);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students_parent_select" ON public.students;
CREATE POLICY "students_parent_select"
ON public.students
FOR SELECT TO authenticated
USING (auth.uid() = parent_id);

DROP POLICY IF EXISTS "students_self_select" ON public.students;
CREATE POLICY "students_self_select"
ON public.students
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "students_teacher_select" ON public.students;
CREATE POLICY "students_teacher_select"
ON public.students
FOR SELECT TO authenticated
USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "students_admin_select" ON public.students;
CREATE POLICY "students_admin_select"
ON public.students
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

-- Force PostgREST (the API layer used by supabase-js) to reload table metadata.
NOTIFY pgrst, 'reload schema';

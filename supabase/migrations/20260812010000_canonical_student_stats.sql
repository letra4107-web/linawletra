-- Canonical mobile-shaped student stats bridge.
-- Keeps existing student progress intact while adding the mobile field names
-- the backend canonical stats service can read/write safely.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS total_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accuracy_sum NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activities_completed INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baseline_accuracy NUMERIC,
  ADD COLUMN IF NOT EXISTS badges JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS word_of_day_completed_date DATE,
  ADD COLUMN IF NOT EXISTS last_practice_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS child_id UUID;

UPDATE public.students
SET
  total_attempts = GREATEST(
    total_attempts,
    CASE
      WHEN jsonb_typeof(COALESCE(history, '[]'::jsonb)) = 'array' THEN jsonb_array_length(COALESCE(history, '[]'::jsonb))
      ELSE 0
    END
  ),
  accuracy_sum = GREATEST(
    accuracy_sum,
    COALESCE(accuracy, 0) * GREATEST(
      total_attempts,
      CASE
        WHEN jsonb_typeof(COALESCE(history, '[]'::jsonb)) = 'array' THEN jsonb_array_length(COALESCE(history, '[]'::jsonb))
        ELSE 0
      END
    )
  ),
  activities_completed = GREATEST(activities_completed, COALESCE(completed, 0)),
  badges = CASE
    WHEN jsonb_array_length(COALESCE(badges, '[]'::jsonb)) > 0 THEN badges
    ELSE to_jsonb(COALESCE(unlocked_achievement_ids, ARRAY[]::text[]))
  END;

DO $$
BEGIN
  IF to_regclass('public.children') IS NOT NULL THEN
    ALTER TABLE public.children ADD COLUMN IF NOT EXISTS student_id UUID;
    ALTER TABLE public.children
      DROP CONSTRAINT IF EXISTS children_student_id_fkey;
    ALTER TABLE public.children
      ADD CONSTRAINT children_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Archive current students progress before any migration
CREATE TABLE IF NOT EXISTS public.students_legacy_progress_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  archived_data JSONB NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL DEFAULT 'pre-unification archive: web/mobile student identity merge'
);

-- Insert snapshot for all students that haven't already been archived
INSERT INTO public.students_legacy_progress_archive (student_id, archived_data)
SELECT s.id, to_jsonb(s)
FROM public.students s
WHERE NOT EXISTS (
  SELECT 1 FROM public.students_legacy_progress_archive a WHERE a.student_id = s.id
);

-- Prevent accidental destructive operations in this migration file
-- This file only archives data and creates the archive table.

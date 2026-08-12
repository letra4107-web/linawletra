-- Create mapping table between legacy `students` and canonical `children`
CREATE TABLE IF NOT EXISTS public.students_children_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1) Link existing children to students where auth UID already matches
INSERT INTO public.students_children_map (student_id, child_id)
SELECT s.id, c.id
FROM public.students s
JOIN public.children c ON c.auth_uid::text = s.user_id::text
WHERE NOT EXISTS (
  SELECT 1 FROM public.students_children_map m WHERE m.student_id = s.id
);

-- 2) Create missing children rows for students who have no child with the same auth_uid
-- Use gen_random_uuid() to create a new children.id; copy parent_id and grade_level if present
-- Add a temporary column to children so we can map newly-created children back to students
ALTER TABLE IF EXISTS public.children ADD COLUMN IF NOT EXISTS migration_student_id TEXT;

INSERT INTO public.children (id, auth_uid, parent_id, name, grade_level, created_at, migration_student_id)
SELECT
  gen_random_uuid(),
  -- Only set auth_uid if the corresponding auth.users row exists; otherwise NULL to avoid FK errors
  (CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id) THEN s.user_id::uuid ELSE NULL END),
  (CASE WHEN EXISTS (SELECT 1 FROM public.users u WHERE u.id = s.parent_id) THEN s.parent_id::uuid ELSE NULL END),
  NULL,
  (CASE WHEN (s.grade_level ~ '^[0-9]+$') THEN (s.grade_level::int) ELSE NULL END),
  now(),
  s.id::text
FROM public.students s
WHERE NOT EXISTS (
  SELECT 1 FROM public.children c WHERE c.auth_uid::text = s.user_id::text
);

-- 3) Insert mapping rows for the newly created children (and any remaining unmapped students)
INSERT INTO public.students_children_map (student_id, child_id)
SELECT s.id, c.id
FROM public.students s
JOIN public.children c ON (
  (c.auth_uid::text = s.user_id::text)
  OR (c.migration_student_id = s.id::text)
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.students_children_map m WHERE m.student_id = s.id
);

-- Cleanup temporary migration marker column
ALTER TABLE IF EXISTS public.children DROP COLUMN IF EXISTS migration_student_id;

-- Notes:
-- - This migration is non-destructive: it only creates new children when none exist and creates mapping rows.
-- - It does not alter or delete data from the `students` table.

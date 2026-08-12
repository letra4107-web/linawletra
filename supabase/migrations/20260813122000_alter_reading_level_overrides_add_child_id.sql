-- Add child_id to reading_level_overrides so overrides can reference canonical children
-- Safely add a `child_id` column to the project's reading-level-overrides table
-- This migration adapts to either `public.student_reading_level_overrides` (mobile) or
-- `public.reading_level_overrides` (legacy). It also inspects the type of
-- `children.id` (UUID vs TEXT) and creates a matching column type to avoid
-- foreign-key type mismatch errors.

DO $$
DECLARE
  overrides_table TEXT;
  children_id_type TEXT;
BEGIN
  -- Pick the overrides table that exists in this database
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'student_reading_level_overrides') THEN
    overrides_table := 'public.student_reading_level_overrides';
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reading_level_overrides') THEN
    overrides_table := 'public.reading_level_overrides';
  ELSE
    RAISE NOTICE 'No reading-level-overrides table found (checked student_reading_level_overrides and reading_level_overrides). Skipping.';
    RETURN;
  END IF;

  -- Determine children.id type
  SELECT data_type INTO children_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'children' AND column_name = 'id';

  IF children_id_type IS NULL THEN
    RAISE NOTICE 'Table public.children or column id not found; skipping child_id addition.';
    RETURN;
  END IF;

  -- Create matching child_id column (UUID vs TEXT)
  IF children_id_type = 'uuid' THEN
    EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS child_id UUID;', overrides_table);
  ELSE
    EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS child_id TEXT;', overrides_table);
  END IF;

  -- Populate child_id from mapping table where possible
  EXECUTE format('UPDATE %s r SET child_id = m.child_id FROM public.students_children_map m WHERE m.student_id = r.student_id AND r.child_id IS NULL;', overrides_table);

  -- Index helper
  IF overrides_table = 'public.student_reading_level_overrides' THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_student_reading_level_overrides_child_id ON public.student_reading_level_overrides(child_id)';
  ELSE
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reading_level_overrides_child_id ON public.reading_level_overrides(child_id)';
  END IF;

  -- Add FK constraint safely (ignore duplicate-object errors)
  BEGIN
    IF overrides_table = 'public.student_reading_level_overrides' THEN
      EXECUTE 'ALTER TABLE public.student_reading_level_overrides ADD CONSTRAINT fk_student_reading_level_overrides_child FOREIGN KEY (child_id) REFERENCES public.children(id)';
    ELSE
      EXECUTE 'ALTER TABLE public.reading_level_overrides ADD CONSTRAINT fk_reading_level_overrides_child FOREIGN KEY (child_id) REFERENCES public.children(id)';
    END IF;
  EXCEPTION WHEN duplicate_object THEN
    -- constraint already exists; nothing to do
    NULL;
  END;

  RAISE NOTICE 'Completed adapter migration for overrides table: %', overrides_table;
END $$;

-- Note: We intentionally keep the existing student_id column for auditability.
-- After verification and testing, we can migrate reads to use child_id and optionally drop student_id later.

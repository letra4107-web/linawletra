-- LinawLetra AI PDF Reading Assistant schema
-- Run in Supabase SQL editor, then create a public/private Storage bucket named reading-materials.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'students'
    AND column_name = 'reading_level'
  ) THEN
    ALTER TABLE students ADD COLUMN reading_level TEXT DEFAULT 'beginner';
  END IF;
END $$;

UPDATE students
SET reading_level = COALESCE(NULLIF(reading_level, ''), 'beginner')
WHERE reading_level IS NULL OR reading_level = '';

ALTER TABLE students
DROP CONSTRAINT IF EXISTS students_reading_level_check;

ALTER TABLE students
ADD CONSTRAINT students_reading_level_check
CHECK (reading_level IN ('beginner', 'intermediate', 'advanced'));

CREATE TABLE IF NOT EXISTS reading_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  pdf_url TEXT NOT NULL,
  storage_path TEXT,
  extracted_text TEXT NOT NULL,
  pages INTEGER DEFAULT 0,
  uploaded_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_students UUID[] DEFAULT '{}',
  difficulty_level TEXT DEFAULT 'beginner',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reading_materials
DROP CONSTRAINT IF EXISTS reading_materials_difficulty_level_check;

ALTER TABLE reading_materials
ADD CONSTRAINT reading_materials_difficulty_level_check
CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced'));

CREATE TABLE IF NOT EXISTS reading_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  material_id UUID NOT NULL REFERENCES reading_materials(id) ON DELETE CASCADE,
  sentence TEXT NOT NULL,
  expected_text TEXT NOT NULL,
  spoken_text TEXT NOT NULL,
  accuracy_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  pronunciation_issues JSONB DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reading_materials_uploaded_by ON reading_materials(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_reading_materials_assigned_students ON reading_materials USING GIN(assigned_students);
CREATE INDEX IF NOT EXISTS idx_reading_attempts_student_id ON reading_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_reading_attempts_material_id ON reading_attempts(material_id);
CREATE INDEX IF NOT EXISTS idx_reading_attempts_completed_at ON reading_attempts(completed_at DESC);

ALTER TABLE reading_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Teachers manage uploaded reading materials" ON reading_materials;
CREATE POLICY "Teachers manage uploaded reading materials"
ON reading_materials
FOR ALL
USING (uploaded_by = auth.uid())
WITH CHECK (uploaded_by = auth.uid());

DROP POLICY IF EXISTS "Students read assigned reading materials" ON reading_materials;
CREATE POLICY "Students read assigned reading materials"
ON reading_materials
FOR SELECT
USING (
  auth.uid() = ANY(assigned_students)
  OR EXISTS (
    SELECT 1 FROM students
    WHERE students.user_id = auth.uid()
    AND students.id = ANY(reading_materials.assigned_students)
  )
);

DROP POLICY IF EXISTS "Students create reading attempts" ON reading_attempts;
CREATE POLICY "Students create reading attempts"
ON reading_attempts
FOR INSERT
WITH CHECK (
  auth.uid() = student_id
  OR EXISTS (
    SELECT 1 FROM students
    WHERE students.user_id = auth.uid()
    AND students.id = reading_attempts.student_id
  )
);

DROP POLICY IF EXISTS "Students view own reading attempts" ON reading_attempts;
CREATE POLICY "Students view own reading attempts"
ON reading_attempts
FOR SELECT
USING (
  auth.uid() = student_id
  OR EXISTS (
    SELECT 1 FROM students
    WHERE students.user_id = auth.uid()
    AND students.id = reading_attempts.student_id
  )
);

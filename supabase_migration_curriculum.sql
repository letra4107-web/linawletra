-- ============================================================================
-- LINAWLETRA CANONICAL CURRICULUM
-- ============================================================================
-- Safe to run more than once. This creates the official ordered curriculum
-- foundation without replacing the older practice_words table yet.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.curriculum_items (
  id TEXT PRIMARY KEY,
  sequence_no INTEGER NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('word', 'phonetic', 'phrase', 'sentence', 'paragraph')),
  reading_level TEXT NOT NULL CHECK (reading_level IN ('beginner', 'intermediate', 'advanced')),
  content TEXT NOT NULL,
  display_text TEXT,
  syllable_hyphenation TEXT,
  definition TEXT,
  pattern_note TEXT,
  backend_category TEXT,
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_type, reading_level, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_items_level_type_sequence
  ON public.curriculum_items(reading_level, item_type, sequence_no);

CREATE INDEX IF NOT EXISTS idx_curriculum_items_active
  ON public.curriculum_items(is_active);

CREATE TABLE IF NOT EXISTS public.curriculum_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  curriculum_item_id TEXT NOT NULL REFERENCES public.curriculum_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'passed_80', 'mastered_100')),
  best_accuracy NUMERIC(5,2) NOT NULL DEFAULT 0,
  attempts_count INTEGER NOT NULL DEFAULT 0,
  passed_at TIMESTAMPTZ,
  mastered_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, curriculum_item_id)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_progress_student
  ON public.curriculum_progress(student_id);

CREATE INDEX IF NOT EXISTS idx_curriculum_progress_item
  ON public.curriculum_progress(curriculum_item_id);

CREATE TABLE IF NOT EXISTS public.curriculum_level_requirements (
  reading_level TEXT PRIMARY KEY CHECK (reading_level IN ('beginner', 'intermediate', 'advanced')),
  required_words INTEGER NOT NULL DEFAULT 200,
  required_phonetics INTEGER NOT NULL DEFAULT 0,
  required_phrases INTEGER NOT NULL DEFAULT 0,
  required_sentences INTEGER NOT NULL DEFAULT 0,
  required_paragraphs INTEGER NOT NULL DEFAULT 0,
  pass_accuracy NUMERIC(5,2) NOT NULL DEFAULT 80,
  mastery_accuracy NUMERIC(5,2) NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.curriculum_level_requirements
  (reading_level, required_words, required_phonetics, required_phrases, required_sentences, required_paragraphs)
VALUES
  ('beginner', 200, 200, 0, 0, 0),
  ('intermediate', 200, 0, 200, 0, 0),
  ('advanced', 200, 0, 0, 200, 20)
ON CONFLICT (reading_level) DO UPDATE SET
  required_words = EXCLUDED.required_words,
  required_phonetics = EXCLUDED.required_phonetics,
  required_phrases = EXCLUDED.required_phrases,
  required_sentences = EXCLUDED.required_sentences,
  required_paragraphs = EXCLUDED.required_paragraphs,
  updated_at = NOW();

ALTER TABLE public.curriculum_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_level_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "curriculum_items_select_authenticated" ON public.curriculum_items;
CREATE POLICY "curriculum_items_select_authenticated"
  ON public.curriculum_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "curriculum_requirements_select_authenticated" ON public.curriculum_level_requirements;
CREATE POLICY "curriculum_requirements_select_authenticated"
  ON public.curriculum_level_requirements FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "curriculum_progress_select_owner_staff" ON public.curriculum_progress;
CREATE POLICY "curriculum_progress_select_owner_staff"
  ON public.curriculum_progress FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.users u ON u.id = auth.uid()
      WHERE s.id = curriculum_progress.student_id
      AND (
        u.role = 'admin'
        OR s.user_id = auth.uid()
        OR s.parent_id = auth.uid()
        OR s.teacher_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "curriculum_progress_write_service_or_owner" ON public.curriculum_progress;
CREATE POLICY "curriculum_progress_write_service_or_owner"
  ON public.curriculum_progress FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.users u ON u.id = auth.uid()
      WHERE s.id = curriculum_progress.student_id
      AND (u.role = 'admin' OR s.user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.users u ON u.id = auth.uid()
      WHERE s.id = curriculum_progress.student_id
      AND (u.role = 'admin' OR s.user_id = auth.uid())
    )
  );

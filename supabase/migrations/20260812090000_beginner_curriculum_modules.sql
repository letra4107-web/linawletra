-- ============================================================================
-- LINAWLETRA BEGINNER SEQUENTIAL MODULES
-- ============================================================================
-- Additive module layer for the web curriculum. This does not remove or replace
-- the existing flat curriculum_items/curriculum_progress/level requirements.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.curriculum_modules (
  id TEXT PRIMARY KEY,
  reading_level TEXT NOT NULL CHECK (reading_level IN ('beginner', 'intermediate', 'advanced')),
  module_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  sequence_no INTEGER NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('phonetic', 'word', 'phrase', 'sentence', 'paragraph', 'mixed')),
  passing_score NUMERIC(5,2) NOT NULL DEFAULT 80,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  assessment_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reading_level, module_number),
  UNIQUE (reading_level, sequence_no)
);

CREATE TABLE IF NOT EXISTS public.curriculum_module_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id TEXT NOT NULL REFERENCES public.curriculum_modules(id) ON DELETE CASCADE,
  curriculum_item_id TEXT NOT NULL REFERENCES public.curriculum_items(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'phonetic'
    CHECK (content_type IN ('phonetic', 'word', 'phrase', 'sentence', 'paragraph')),
  practice_set_number INTEGER NOT NULL DEFAULT 1,
  module_item_kind TEXT NOT NULL DEFAULT 'phonetic'
    CHECK (module_item_kind IN ('phonetic', 'real_word', 'syllable_practice', 'assessment_item')),
  required BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (module_id, curriculum_item_id),
  UNIQUE (module_id, sequence_no)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_module_items_module_sequence
  ON public.curriculum_module_items(module_id, sequence_no);

CREATE TABLE IF NOT EXISTS public.student_module_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES public.curriculum_modules(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unlocked'
    CHECK (status IN ('locked', 'unlocked', 'in_progress', 'assessment_ready', 'completed')),
  progress NUMERIC(5,2) NOT NULL DEFAULT 0,
  assessment_score NUMERIC(5,2),
  assessment_passed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_student_module_progress_student
  ON public.student_module_progress(student_id);

ALTER TABLE public.curriculum_modules
  ADD COLUMN IF NOT EXISTS passing_score NUMERIC(5,2) NOT NULL DEFAULT 80;

ALTER TABLE public.curriculum_module_items
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'phonetic';

CREATE OR REPLACE FUNCTION public.linawletra_allowed_beginner_module5_syllables()
RETURNS TEXT[]
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT ARRAY[
    'a','e','i','o','u',
    'ba','be','bi','bo','bu',
    'ka','ke','ki','ko','ku',
    'da','de','di','do','du'
  ]::TEXT[];
$$;

CREATE OR REPLACE FUNCTION public.linawletra_module5_syllables_allowed(p_syllables TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_token TEXT;
  v_allowed TEXT[] := public.linawletra_allowed_beginner_module5_syllables();
BEGIN
  IF p_syllables IS NULL OR btrim(p_syllables) = '' THEN
    RETURN FALSE;
  END IF;

  FOREACH v_token IN ARRAY regexp_split_to_array(lower(regexp_replace(p_syllables, '[^a-z\-\s]', '', 'g')), '[\-\s]+')
  LOOP
    IF v_token = '' THEN
      CONTINUE;
    END IF;
    IF NOT (v_token = ANY(v_allowed)) THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.linawletra_enforce_module5_content()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_module public.curriculum_modules%ROWTYPE;
  v_item public.curriculum_items%ROWTYPE;
BEGIN
  SELECT * INTO v_module FROM public.curriculum_modules WHERE id = NEW.module_id;
  IF v_module.id = 'beginner-module-5-word-building' THEN
    SELECT * INTO v_item FROM public.curriculum_items WHERE id = NEW.curriculum_item_id;
    IF NOT public.linawletra_module5_syllables_allowed(COALESCE(v_item.syllable_hyphenation, v_item.content)) THEN
      RAISE EXCEPTION 'Module 5 item % contains syllables outside the approved Beginner Modules 1-4 scope', NEW.curriculum_item_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_module5_content ON public.curriculum_module_items;
CREATE TRIGGER trg_enforce_module5_content
  BEFORE INSERT OR UPDATE ON public.curriculum_module_items
  FOR EACH ROW
  EXECUTE FUNCTION public.linawletra_enforce_module5_content();

INSERT INTO public.curriculum_modules
  (id, reading_level, module_number, title, description, sequence_no, content_type, required, assessment_id, metadata)
VALUES
  ('beginner-module-1-vowels', 'beginner', 1, 'Mga Patinig', 'A, E, I, O, U recognition, pronunciation, phoneme awareness, and reading.', 1, 'phonetic', TRUE, 'beginner-module-1-assessment', '{"accent":"violet"}'),
  ('beginner-module-2-ba', 'beginner', 2, 'BA', 'BA, BE, BI, BO, BU pronunciation and reading.', 2, 'phonetic', TRUE, 'beginner-module-2-assessment', '{"accent":"green"}'),
  ('beginner-module-3-ka', 'beginner', 3, 'KA', 'KA, KE, KI, KO, KU pronunciation and reading.', 3, 'phonetic', TRUE, 'beginner-module-3-assessment', '{"accent":"sun"}'),
  ('beginner-module-4-da', 'beginner', 4, 'DA', 'DA, DE, DI, DO, DU pronunciation and reading.', 4, 'phonetic', TRUE, 'beginner-module-4-assessment', '{"accent":"blue"}'),
  ('beginner-module-5-word-building', 'beginner', 5, 'Pagbuo ng mga Salita', 'Real words and syllable practice using only vowels and BA/KA/DA syllables already introduced.', 5, 'word', TRUE, 'beginner-module-5-assessment', '{"accent":"coral"}')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  content_type = EXCLUDED.content_type,
  required = EXCLUDED.required,
  assessment_id = EXCLUDED.assessment_id,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO public.curriculum_items
  (id, sequence_no, item_type, reading_level, content, display_text, syllable_hyphenation, definition, pattern_note, backend_category, source_sheet, source_row, is_active, metadata)
VALUES
  ('module-vowel-a', 1901, 'phonetic', 'beginner', 'a', 'A', 'a', NULL, 'Patinig', 'beginner_module_vowel', 'Beginner Module Seed', 1, TRUE, '{"module_seed":true}'),
  ('module-vowel-e', 1902, 'phonetic', 'beginner', 'e', 'E', 'e', NULL, 'Patinig', 'beginner_module_vowel', 'Beginner Module Seed', 2, TRUE, '{"module_seed":true}'),
  ('module-vowel-i', 1903, 'phonetic', 'beginner', 'i', 'I', 'i', NULL, 'Patinig', 'beginner_module_vowel', 'Beginner Module Seed', 3, TRUE, '{"module_seed":true}'),
  ('module-vowel-o', 1904, 'phonetic', 'beginner', 'o', 'O', 'o', NULL, 'Patinig', 'beginner_module_vowel', 'Beginner Module Seed', 4, TRUE, '{"module_seed":true}'),
  ('module-vowel-u', 1905, 'phonetic', 'beginner', 'u', 'U', 'u', NULL, 'Patinig', 'beginner_module_vowel', 'Beginner Module Seed', 5, TRUE, '{"module_seed":true}')
ON CONFLICT (id) DO UPDATE SET
  display_text = EXCLUDED.display_text,
  syllable_hyphenation = EXCLUDED.syllable_hyphenation,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

WITH real_word_seed(id, sequence_no, content, display_text, syllable_hyphenation, definition, source_row) AS (
  VALUES
    ('module5-real-baka', 2401, 'baka', 'BA-KA', 'ba-ka', 'Isang malaking hayop na pinagmumulan ng gatas at karne.', 4),
    ('module5-real-baba', 2402, 'baba', 'BA-BA', 'ba-ba', 'Ang ibabang bahagi ng mukha.', 0),
    ('module5-real-buko', 2403, 'buko', 'BU-KO', 'bu-ko', 'Ang batang bunga ng niyog.', 0)
)
INSERT INTO public.curriculum_items
  (id, sequence_no, item_type, reading_level, content, display_text, syllable_hyphenation, definition, pattern_note, backend_category, source_sheet, source_row, is_active, metadata)
SELECT
  id,
  sequence_no,
  'word',
  'beginner',
  content,
  display_text,
  syllable_hyphenation,
  definition,
  'Verified Module 5 real word from Level 1 Simple.',
  'beginner_module5_real_word',
  'Level 1 Simple',
  source_row,
  TRUE,
  '{"module_seed":true,"module_item_kind":"real_word"}'::jsonb
FROM real_word_seed seed
WHERE NOT EXISTS (
  SELECT 1
  FROM public.curriculum_items existing
  WHERE lower(existing.content) = lower(seed.content)
    AND existing.item_type = 'word'
    AND existing.reading_level = 'beginner'
)
ON CONFLICT (id) DO UPDATE SET
  display_text = EXCLUDED.display_text,
  syllable_hyphenation = EXCLUDED.syllable_hyphenation,
  definition = EXCLUDED.definition,
  pattern_note = EXCLUDED.pattern_note,
  backend_category = EXCLUDED.backend_category,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO public.curriculum_items
  (id, sequence_no, item_type, reading_level, content, display_text, syllable_hyphenation, definition, pattern_note, backend_category, source_sheet, source_row, is_active, metadata)
VALUES
  ('module5-practice-ba-da', 2501, 'word', 'beginner', 'ba-da', 'BA-DA', 'ba-da', NULL, 'Syllable practice only; not vocabulary.', 'beginner_module5_syllable_practice', 'Beginner Module Seed', 501, TRUE, '{"module_seed":true,"module_item_kind":"syllable_practice"}'),
  ('module5-practice-ka-ba', 2502, 'word', 'beginner', 'ka-ba', 'KA-BA', 'ka-ba', NULL, 'Syllable practice only; not vocabulary.', 'beginner_module5_syllable_practice', 'Beginner Module Seed', 502, TRUE, '{"module_seed":true,"module_item_kind":"syllable_practice"}'),
  ('module5-practice-da-ka', 2503, 'word', 'beginner', 'da-ka', 'DA-KA', 'da-ka', NULL, 'Syllable practice only; not vocabulary.', 'beginner_module5_syllable_practice', 'Beginner Module Seed', 503, TRUE, '{"module_seed":true,"module_item_kind":"syllable_practice"}'),
  ('module5-practice-bi-ka', 2504, 'word', 'beginner', 'bi-ka', 'BI-KA', 'bi-ka', NULL, 'Syllable practice only; not vocabulary.', 'beginner_module5_syllable_practice', 'Beginner Module Seed', 504, TRUE, '{"module_seed":true,"module_item_kind":"syllable_practice"}'),
  ('module5-practice-ku-ko', 2505, 'word', 'beginner', 'ku-ko', 'KU-KO', 'ku-ko', NULL, 'Syllable practice only; not vocabulary.', 'beginner_module5_syllable_practice', 'Beginner Module Seed', 505, TRUE, '{"module_seed":true,"module_item_kind":"syllable_practice"}'),
  ('module5-practice-a-ko', 2506, 'word', 'beginner', 'a-ko', 'A-KO', 'a-ko', NULL, 'Syllable practice only; not vocabulary.', 'beginner_module5_syllable_practice', 'Beginner Module Seed', 506, TRUE, '{"module_seed":true,"module_item_kind":"syllable_practice"}'),
  ('module5-practice-da-ba', 2507, 'word', 'beginner', 'da-ba', 'DA-BA', 'da-ba', NULL, 'Syllable practice only; not vocabulary.', 'beginner_module5_syllable_practice', 'Beginner Module Seed', 507, TRUE, '{"module_seed":true,"module_item_kind":"syllable_practice"}'),
  ('module5-practice-bo-ka', 2508, 'word', 'beginner', 'bo-ka', 'BO-KA', 'bo-ka', NULL, 'Syllable practice only; not vocabulary.', 'beginner_module5_syllable_practice', 'Beginner Module Seed', 508, TRUE, '{"module_seed":true,"module_item_kind":"syllable_practice"}')
ON CONFLICT (id) DO UPDATE SET
  display_text = EXCLUDED.display_text,
  syllable_hyphenation = EXCLUDED.syllable_hyphenation,
  pattern_note = EXCLUDED.pattern_note,
  backend_category = EXCLUDED.backend_category,
  metadata = EXCLUDED.metadata,
  updated_at = NOW();

WITH module_item_seed(module_id, content, item_type, sequence_no, practice_set_number, module_item_kind) AS (
  VALUES
    ('beginner-module-1-vowels', 'a', 'phonetic', 1, 1, 'phonetic'),
    ('beginner-module-1-vowels', 'e', 'phonetic', 2, 1, 'phonetic'),
    ('beginner-module-1-vowels', 'i', 'phonetic', 3, 1, 'phonetic'),
    ('beginner-module-1-vowels', 'o', 'phonetic', 4, 1, 'phonetic'),
    ('beginner-module-1-vowels', 'u', 'phonetic', 5, 1, 'phonetic'),
    ('beginner-module-2-ba', 'ba', 'phonetic', 1, 1, 'phonetic'),
    ('beginner-module-2-ba', 'be', 'phonetic', 2, 1, 'phonetic'),
    ('beginner-module-2-ba', 'bi', 'phonetic', 3, 1, 'phonetic'),
    ('beginner-module-2-ba', 'bo', 'phonetic', 4, 1, 'phonetic'),
    ('beginner-module-2-ba', 'bu', 'phonetic', 5, 1, 'phonetic'),
    ('beginner-module-3-ka', 'ka', 'phonetic', 1, 1, 'phonetic'),
    ('beginner-module-3-ka', 'ke', 'phonetic', 2, 1, 'phonetic'),
    ('beginner-module-3-ka', 'ki', 'phonetic', 3, 1, 'phonetic'),
    ('beginner-module-3-ka', 'ko', 'phonetic', 4, 1, 'phonetic'),
    ('beginner-module-3-ka', 'ku', 'phonetic', 5, 1, 'phonetic'),
    ('beginner-module-4-da', 'da', 'phonetic', 1, 1, 'phonetic'),
    ('beginner-module-4-da', 'de', 'phonetic', 2, 1, 'phonetic'),
    ('beginner-module-4-da', 'di', 'phonetic', 3, 1, 'phonetic'),
    ('beginner-module-4-da', 'do', 'phonetic', 4, 1, 'phonetic'),
    ('beginner-module-4-da', 'du', 'phonetic', 5, 1, 'phonetic'),
    ('beginner-module-5-word-building', 'baka', 'word', 1, 1, 'real_word'),
    ('beginner-module-5-word-building', 'baba', 'word', 2, 1, 'real_word'),
    ('beginner-module-5-word-building', 'buko', 'word', 3, 1, 'real_word'),
    ('beginner-module-5-word-building', 'ba-da', 'word', 4, 1, 'syllable_practice'),
    ('beginner-module-5-word-building', 'ka-ba', 'word', 5, 1, 'syllable_practice'),
    ('beginner-module-5-word-building', 'da-ka', 'word', 6, 2, 'syllable_practice'),
    ('beginner-module-5-word-building', 'bi-ka', 'word', 7, 2, 'syllable_practice'),
    ('beginner-module-5-word-building', 'ku-ko', 'word', 8, 2, 'syllable_practice'),
    ('beginner-module-5-word-building', 'a-ko', 'word', 9, 2, 'syllable_practice'),
    ('beginner-module-5-word-building', 'da-ba', 'word', 10, 2, 'syllable_practice'),
    ('beginner-module-5-word-building', 'bo-ka', 'word', 11, 3, 'syllable_practice')
),
resolved_items AS (
  SELECT
    s.module_id,
    COALESCE(existing.id, seeded.id) AS curriculum_item_id,
    s.sequence_no,
    s.item_type AS content_type,
    s.practice_set_number,
    s.module_item_kind
  FROM module_item_seed s
  LEFT JOIN public.curriculum_items existing
    ON lower(existing.content) = lower(s.content)
    AND existing.item_type = s.item_type
    AND existing.reading_level = 'beginner'
    AND existing.is_active = TRUE
  LEFT JOIN public.curriculum_items seeded
    ON seeded.id = CASE
      WHEN s.item_type = 'phonetic' AND s.content IN ('a','e','i','o','u') THEN 'module-vowel-' || s.content
      WHEN s.content = 'ba-da' THEN 'module5-practice-ba-da'
      WHEN s.content = 'ka-ba' THEN 'module5-practice-ka-ba'
      WHEN s.content = 'da-ka' THEN 'module5-practice-da-ka'
      WHEN s.content = 'bi-ka' THEN 'module5-practice-bi-ka'
      WHEN s.content = 'ku-ko' THEN 'module5-practice-ku-ko'
      WHEN s.content = 'a-ko' THEN 'module5-practice-a-ko'
      WHEN s.content = 'da-ba' THEN 'module5-practice-da-ba'
      WHEN s.content = 'bo-ka' THEN 'module5-practice-bo-ka'
    END
)
INSERT INTO public.curriculum_module_items
  (module_id, curriculum_item_id, sequence_no, content_type, practice_set_number, module_item_kind)
SELECT module_id, curriculum_item_id, sequence_no, content_type, practice_set_number, module_item_kind
FROM resolved_items
WHERE curriculum_item_id IS NOT NULL
ON CONFLICT (module_id, curriculum_item_id) DO UPDATE SET
  sequence_no = EXCLUDED.sequence_no,
  content_type = EXCLUDED.content_type,
  practice_set_number = EXCLUDED.practice_set_number,
  module_item_kind = EXCLUDED.module_item_kind,
  updated_at = NOW();

ALTER TABLE public.curriculum_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_module_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_module_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "curriculum_modules_select_authenticated" ON public.curriculum_modules;
CREATE POLICY "curriculum_modules_select_authenticated"
  ON public.curriculum_modules FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "curriculum_module_items_select_authenticated" ON public.curriculum_module_items;
CREATE POLICY "curriculum_module_items_select_authenticated"
  ON public.curriculum_module_items FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "student_module_progress_select_owner_staff" ON public.student_module_progress;
CREATE POLICY "student_module_progress_select_owner_staff"
  ON public.student_module_progress FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.users u ON u.id = auth.uid()
      WHERE s.id = student_module_progress.student_id
      AND (
        u.role = 'admin'
        OR s.user_id = auth.uid()
        OR s.parent_id = auth.uid()
        OR s.teacher_id = auth.uid()
      )
    )
  );

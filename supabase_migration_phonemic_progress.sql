-- Phase 1 of the phonemic pronunciation/progress redesign.
-- Extends the existing reading_attempts table (instead of forking a
-- parallel one) and adds two new per-student tables for word mastery
-- and recurring phoneme-confusion patterns.
-- Run this in the Supabase SQL editor.

-- 1. Extend reading_attempts with phoneme/syllable detail + let
--    word-drill attempts (word-of-day, practice words) record without
--    a reading_materials row.
ALTER TABLE reading_attempts
  ADD COLUMN IF NOT EXISTS word_target        TEXT,
  ADD COLUMN IF NOT EXISTS mode               TEXT DEFAULT 'sentence',
  ADD COLUMN IF NOT EXISTS activity_type      TEXT DEFAULT 'lesson_material',
  ADD COLUMN IF NOT EXISTS phoneme_accuracy   NUMERIC,
  ADD COLUMN IF NOT EXISTS syllable_accuracy  NUMERIC,
  ADD COLUMN IF NOT EXISTS word_accuracy      NUMERIC,
  ADD COLUMN IF NOT EXISTS syllable_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS phoneme_ops        JSONB,
  ADD COLUMN IF NOT EXISTS confusion_tags     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS attempt_number     INTEGER;

ALTER TABLE reading_attempts ALTER COLUMN material_id DROP NOT NULL;

-- 2. Per (student, word) mastery state.
CREATE TABLE IF NOT EXISTS word_mastery (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id              UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  word                    TEXT NOT NULL,
  mastery_status          TEXT NOT NULL DEFAULT 'needs_practice'
                            CHECK (mastery_status IN ('mastered', 'needs_practice', 'difficult')),
  attempt_count           INTEGER DEFAULT 0,
  correct_count           INTEGER DEFAULT 0,
  avg_pronunciation_score NUMERIC DEFAULT 0,
  avg_phoneme_accuracy    NUMERIC DEFAULT 0,
  avg_syllable_accuracy   NUMERIC DEFAULT 0,
  last_attempt_at         TIMESTAMPTZ,
  last_status_change_at   TIMESTAMPTZ,
  UNIQUE (student_id, word)
);

CREATE INDEX IF NOT EXISTS idx_word_mastery_student ON word_mastery (student_id);
CREATE INDEX IF NOT EXISTS idx_word_mastery_status ON word_mastery (student_id, mastery_status);

ALTER TABLE word_mastery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "word_mastery_access" ON word_mastery;
CREATE POLICY "word_mastery_access"
  ON word_mastery
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = (SELECT user_id FROM students WHERE id = word_mastery.student_id LIMIT 1)
    OR EXISTS (SELECT 1 FROM students s WHERE s.id = word_mastery.student_id AND (s.teacher_id = auth.uid() OR s.parent_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- 3. Per (student, confusion pattern) recurring-mistake tracker.
CREATE TABLE IF NOT EXISTS confusion_patterns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  pattern_type      TEXT NOT NULL, -- e.g. d_r, b_p, t_k, g_k, final_vowel_drop, syllable_skip, syllable_merge
  occurrence_count  INTEGER DEFAULT 1,
  first_seen_at     TIMESTAMPTZ DEFAULT now(),
  last_seen_at      TIMESTAMPTZ DEFAULT now(),
  example_words     JSONB DEFAULT '[]',
  UNIQUE (student_id, pattern_type)
);

CREATE INDEX IF NOT EXISTS idx_confusion_patterns_student ON confusion_patterns (student_id);
CREATE INDEX IF NOT EXISTS idx_confusion_patterns_count ON confusion_patterns (student_id, occurrence_count DESC);

ALTER TABLE confusion_patterns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "confusion_patterns_access" ON confusion_patterns;
CREATE POLICY "confusion_patterns_access"
  ON confusion_patterns
  FOR ALL
  TO authenticated
  USING (
    auth.uid() = (SELECT user_id FROM students WHERE id = confusion_patterns.student_id LIMIT 1)
    OR EXISTS (SELECT 1 FROM students s WHERE s.id = confusion_patterns.student_id AND (s.teacher_id = auth.uid() OR s.parent_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- 4. Word of the Day streak fix: only count a completed day once the
--    student has successfully pronounced that day's word.
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS word_of_day_completed_date DATE;

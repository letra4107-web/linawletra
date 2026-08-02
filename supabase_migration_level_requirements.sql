-- Level-progression gating: students must meet real mastery/accuracy
-- thresholds (not just a completion count) to advance Easy -> Medium -> Hard.
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS level_requirements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level               TEXT NOT NULL UNIQUE CHECK (level IN ('Easy', 'Medium', 'Hard')),
  min_mastered_words  INTEGER NOT NULL DEFAULT 3,
  max_difficult_words INTEGER NOT NULL DEFAULT 0,
  min_avg_accuracy    NUMERIC NOT NULL DEFAULT 75,
  updated_at          TIMESTAMPTZ DEFAULT now()
);

INSERT INTO level_requirements (level, min_mastered_words, max_difficult_words, min_avg_accuracy)
VALUES
  ('Easy',   3, 1, 70),
  ('Medium', 4, 1, 75),
  ('Hard',   5, 0, 80)
ON CONFLICT (level) DO NOTHING;

ALTER TABLE level_requirements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "level_requirements_read" ON level_requirements;
CREATE POLICY "level_requirements_read"
  ON level_requirements
  FOR SELECT
  TO authenticated
  USING (true);

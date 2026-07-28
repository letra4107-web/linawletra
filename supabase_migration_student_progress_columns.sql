-- Move student game progress off users.metadata (a JSONB blob with no schema)
-- and onto dedicated columns on the students table, where it belongs.
-- Run this in the Supabase SQL editor.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS xp                       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS words_completed           INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_words           TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS achievements              INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accuracy                  DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed                 INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak                    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_login_date           DATE,
  ADD COLUMN IF NOT EXISTS history                   JSONB   DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS current_phonetic_level    TEXT    DEFAULT 'Easy',
  ADD COLUMN IF NOT EXISTS progress_in_level         INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS highest_phonetic_level    TEXT    DEFAULT 'Easy',
  ADD COLUMN IF NOT EXISTS hard_cycles_completed     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS had_streak_break          BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS unlocked_achievement_ids  TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS practice_level            TEXT    DEFAULT 'beginner';

-- One-time backfill: copy any progress already sitting in users.metadata
-- (from the previous storage location) onto the new students columns, so
-- existing students don't appear to lose their progress after this migration.
UPDATE students s
SET
  xp                      = COALESCE((u.metadata->>'xp')::INTEGER, s.xp),
  words_completed         = COALESCE((u.metadata->>'wordsCompleted')::INTEGER, s.words_completed),
  completed_words         = COALESCE(
                               ARRAY(SELECT jsonb_array_elements_text(u.metadata->'completedWords')),
                               s.completed_words
                             ),
  achievements             = COALESCE((u.metadata->>'achievements')::INTEGER, s.achievements),
  accuracy                 = COALESCE((u.metadata->>'accuracy')::DECIMAL, s.accuracy),
  completed                = COALESCE((u.metadata->>'completedLessons')::INTEGER, s.completed),
  streak                   = COALESCE((u.metadata->>'streak')::INTEGER, s.streak),
  last_login_date          = COALESCE((u.metadata->>'lastLoginDate')::DATE, s.last_login_date),
  history                  = COALESCE(u.metadata->'history', s.history),
  current_phonetic_level   = COALESCE(u.metadata->>'currentPhoneticLevel', s.current_phonetic_level),
  progress_in_level        = COALESCE((u.metadata->>'progressInCurrentLevel')::INTEGER, s.progress_in_level),
  highest_phonetic_level   = COALESCE(u.metadata->>'highestPhoneticLevel', s.highest_phonetic_level),
  hard_cycles_completed    = COALESCE((u.metadata->>'hardCyclesCompleted')::INTEGER, s.hard_cycles_completed),
  had_streak_break         = COALESCE((u.metadata->>'hadStreakBreak')::BOOLEAN, s.had_streak_break),
  unlocked_achievement_ids = COALESCE(
                               ARRAY(SELECT jsonb_array_elements_text(u.metadata->'unlockedAchievementIds')),
                               s.unlocked_achievement_ids
                             )
FROM users u
WHERE s.user_id = u.id
  AND u.metadata IS NOT NULL
  AND (u.metadata ? 'xp' OR u.metadata ? 'unlockedAchievementIds');

-- Students can update their own progress row
DROP POLICY IF EXISTS "students_update_own" ON students;
CREATE POLICY "students_update_own"
  ON students
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

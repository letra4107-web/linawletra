-- Adds a "longest streak" high-water mark alongside the existing `streak`
-- column, so parent/teacher overview panels can show best-ever streak, not
-- just current streak. Run this in the Supabase SQL editor.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0;

-- Backfill: for any student who already has a current streak, seed
-- longest_streak so it isn't 0 while streak is higher (one-time fix-up;
-- from this point on the app keeps it updated going forward).
UPDATE students
SET longest_streak = streak
WHERE longest_streak < streak;

-- ============================================================================
-- PRACTICE_WORDS TABLE - Vocabulary bank for reading-practice UI
-- ============================================================================
-- Run this in the Supabase SQL editor (same way prior schema files were
-- applied to this project). Safe to re-run: uses IF NOT EXISTS / ON CONFLICT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS practice_words (
  id TEXT PRIMARY KEY,                  -- stable slug, e.g. "magbabasa-1"
  word TEXT NOT NULL,                   -- plain spelling, used for matching spoken/typed input
  accented_spelling TEXT NOT NULL,      -- diacritic spelling shown in the UI
  meaning TEXT NOT NULL,                -- short Filipino definition
  example TEXT,                         -- optional example sentence, written with the accent
  is_homograph BOOLEAN NOT NULL DEFAULT FALSE,
  homograph_group TEXT,                 -- shared key linking sibling entries, e.g. "magbabasa"
  difficulty TEXT NOT NULL DEFAULT 'madali' CHECK (difficulty IN ('madali', 'katamtaman', 'mahirap')),
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_words_difficulty ON practice_words(difficulty);
CREATE INDEX IF NOT EXISTS idx_practice_words_homograph_group ON practice_words(homograph_group);

-- Row Level Security: everyone signed in can read; only teachers/admins can edit.
ALTER TABLE practice_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "practice_words_select_all" ON practice_words;
CREATE POLICY "practice_words_select_all"
  ON practice_words FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "practice_words_write_staff" ON practice_words;
CREATE POLICY "practice_words_write_staff"
  ON practice_words FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('teacher', 'admin')
    )
  );

-- ============================================================================
-- SEED DATA - initial 19-word bank
-- Homograph pairs verified against published sources before inclusion; see
-- docs/practice_words_sources.md for what was checked and what was left out.
-- ============================================================================

INSERT INTO practice_words (id, word, accented_spelling, meaning, example, is_homograph, homograph_group, difficulty, tags) VALUES
  ('aso-1',        'aso',        'aso',        'hayop na alagang tumatahol', NULL, FALSE, NULL, 'madali', ARRAY['hayop']),
  ('pusa-1',       'pusa',       'pusa',       'hayop na alagang umuungol', NULL, FALSE, NULL, 'madali', ARRAY['hayop']),
  ('bahay-1',      'bahay',      'bahay',      'tirahan ng tao', NULL, FALSE, NULL, 'madali', ARRAY['tahanan']),
  ('tubig-1',      'tubig',      'tubig',      'malinaw na likidong iniinom', NULL, FALSE, NULL, 'madali', ARRAY['kalikasan']),
  ('mesa-1',       'mesa',       'mesa',       'kasangkapang kinakainan o pinagsusulatan', NULL, FALSE, NULL, 'madali', ARRAY['bahay']),
  ('mata-1',       'mata',       'mata',       'bahagi ng katawan na ginagamit sa paningin', NULL, FALSE, NULL, 'madali', ARRAY['katawan']),
  ('kamay-1',      'kamay',      'kamay',      'bahagi ng katawan na ginagamit sa paghawak', NULL, FALSE, NULL, 'madali', ARRAY['katawan']),
  ('masaya-1',     'masaya',     'masaya',     'may ligaya; kuntento', NULL, FALSE, NULL, 'katamtaman', ARRAY['damdamin']),
  ('mabait-1',     'mabait',     'mabait',     'mabuti ang ugali; magiliw', NULL, FALSE, NULL, 'katamtaman', ARRAY['ugali']),
  ('malaki-1',     'malaki',     'malaki',     'higit sa karaniwang laki', NULL, FALSE, NULL, 'katamtaman', ARRAY['sukat']),
  ('maliit-1',     'maliit',     'maliit',     'mas mababa sa karaniwang laki', NULL, FALSE, NULL, 'katamtaman', ARRAY['sukat']),
  ('mabilis-1',    'mabilis',    'mabilis',    'hindi mabagal; matulin', NULL, FALSE, NULL, 'katamtaman', ARRAY['galaw']),
  ('tahimik-1',    'tahimik',    'tahimik',    'walang ingay; payapa', NULL, FALSE, NULL, 'katamtaman', ARRAY['tunog']),
  ('mahalaga-1',   'mahalaga',   'mahalaga',   'may malaking kabuluhan', NULL, FALSE, NULL, 'mahirap', ARRAY['halaga']),
  ('kumusta-1',    'kumusta',    'kumusta',    'bating pagtatanong kung kamusta ang kalagayan', NULL, FALSE, NULL, 'mahirap', ARRAY['bati']),
  ('baba-chin',    'baba',       'bába',       'bahagi ng mukha sa ibaba ng bibig', NULL, TRUE, 'baba', 'mahirap', ARRAY['katawan', 'homograph']),
  ('baba-low',     'baba',       'babâ',       'pagbaba; pagiging mababa (hal. presyo, puwesto)', 'Bumabâ ang presyo ng gulay.', TRUE, 'baba', 'mahirap', ARRAY['galaw', 'homograph']),
  ('magbabasa-read','magbabasa', 'magbabasá',  'gagawa ng pagbabasa (mula sa "basa" = read)', 'Magbabasá ako ng libro mamayang gabi.', TRUE, 'magbabasa', 'mahirap', ARRAY['aksyon', 'homograph']),
  ('magbabasa-wet', 'magbabasa', 'magbabasâ',  'magiging basa; malulubog sa tubig (mula sa "basâ" = wet)', 'Magbabasâ ang damit kung uulan.', TRUE, 'magbabasa', 'mahirap', ARRAY['aksyon', 'homograph'])
ON CONFLICT (id) DO UPDATE SET
  word = EXCLUDED.word,
  accented_spelling = EXCLUDED.accented_spelling,
  meaning = EXCLUDED.meaning,
  example = EXCLUDED.example,
  is_homograph = EXCLUDED.is_homograph,
  homograph_group = EXCLUDED.homograph_group,
  difficulty = EXCLUDED.difficulty,
  tags = EXCLUDED.tags,
  updated_at = NOW();

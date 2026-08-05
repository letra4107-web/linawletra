-- Optional LinawLetra practice word expansion.
-- Run after supabase_migration_practice_words.sql. Uses upsert so it is safe
-- to rerun and will not duplicate words with the same id.

insert into public.practice_words
  (id, word, accented_spelling, meaning, example, is_homograph, homograph_group, difficulty, tags)
values
  ('ama-1', 'ama', 'ama', 'lalaking magulang', 'Mabait ang aking ama.', false, null, 'madali', array['pamilya']),
  ('ina-1', 'ina', 'ina', 'babaeng magulang', 'Nagluluto ang ina.', false, null, 'madali', array['pamilya']),
  ('bata-1', 'bata', 'bata', 'murang edad na tao', 'Masaya ang bata.', false, null, 'madali', array['tao']),
  ('gatas-1', 'gatas', 'gatas', 'puting inuming mula sa hayop o halaman', 'Uminom ng gatas ang bata.', false, null, 'madali', array['pagkain']),
  ('saging-1', 'saging', 'saging', 'dilaw na prutas', 'Kumain ako ng saging.', false, null, 'madali', array['pagkain','prutas']),
  ('isda-1', 'isda', 'isda', 'hayop na nabubuhay sa tubig', 'Lumalangoy ang isda.', false, null, 'madali', array['hayop','tubig']),
  ('ibon-1', 'ibon', 'ibon', 'hayop na may pakpak', 'Lumilipad ang ibon.', false, null, 'madali', array['hayop']),
  ('araw-1', 'araw', 'araw', 'liwanag sa langit o isang buong maghapon', 'Mainit ang araw.', false, null, 'madali', array['kalikasan']),
  ('ulan-1', 'ulan', 'ulan', 'tubig na bumabagsak mula sa ulap', 'Malakas ang ulan.', false, null, 'madali', array['kalikasan']),
  ('lapis-1', 'lapis', 'lapis', 'gamit sa pagsulat', 'May lapis sa mesa.', false, null, 'madali', array['paaralan']),
  ('aklat-1', 'aklat', 'aklat', 'libro', 'Binasa ko ang aklat.', false, null, 'katamtaman', array['paaralan','pagbasa']),
  ('paaralan-1', 'paaralan', 'paaralan', 'lugar para matuto', 'Pumasok ako sa paaralan.', false, null, 'katamtaman', array['paaralan']),
  ('kaibigan-1', 'kaibigan', 'kaibigan', 'kasamang pinagkakatiwalaan', 'Kasama ko ang aking kaibigan.', false, null, 'katamtaman', array['tao','ugali']),
  ('laruan-1', 'laruan', 'laruan', 'bagay na ginagamit sa paglalaro', 'Bago ang laruan ni Ana.', false, null, 'katamtaman', array['bagay']),
  ('kumakain-1', 'kumakain', 'kumakain', 'kasalukuyang kumakain', 'Kumakain ng kanin ang bata.', false, null, 'katamtaman', array['aksyon']),
  ('tumatakbo-1', 'tumatakbo', 'tumatakbo', 'mabilis na lumalakad', 'Tumatakbo ang aso.', false, null, 'katamtaman', array['aksyon','galaw']),
  ('naglalaro-1', 'naglalaro', 'naglalaro', 'gumagawa ng laro', 'Naglalaro ang magkapatid.', false, null, 'katamtaman', array['aksyon']),
  ('malinis-1', 'malinis', 'malinis', 'walang dumi', 'Malinis ang silid.', false, null, 'katamtaman', array['katangian']),
  ('matapang-1', 'matapang', 'matapang', 'may lakas ng loob', 'Matapang ang bata.', false, null, 'katamtaman', array['ugali']),
  ('mapagmahal-1', 'mapagmahal', 'mapagmahal', 'marunong magmahal', 'Mapagmahal ang pamilya.', false, null, 'mahirap', array['ugali','damdamin']),
  ('nagtutulungan-1', 'nagtutulungan', 'nagtutulungan', 'sabay na tumutulong sa isa''t isa', 'Nagtutulungan ang magkakaibigan.', false, null, 'mahirap', array['aksyon','ugali']),
  ('kapaligiran-1', 'kapaligiran', 'kapaligiran', 'mga bagay at lugar sa paligid', 'Ingatan ang kapaligiran.', false, null, 'mahirap', array['kalikasan']),
  ('pananampalataya-1', 'pananampalataya', 'pananampalataya', 'paniniwala at tiwala', 'Mahalaga ang pananampalataya.', false, null, 'mahirap', array['halaga']),
  ('pagkakaibigan-1', 'pagkakaibigan', 'pagkakaibigan', 'ugnayan ng mga kaibigan', 'Matibay ang kanilang pagkakaibigan.', false, null, 'mahirap', array['tao','ugali']),
  ('responsibilidad-1', 'responsibilidad', 'responsibilidad', 'tungkulin o pananagutan', 'Responsibilidad kong mag-aral.', false, null, 'mahirap', array['halaga'])
on conflict (id) do update set
  word = excluded.word,
  accented_spelling = excluded.accented_spelling,
  meaning = excluded.meaning,
  example = excluded.example,
  is_homograph = excluded.is_homograph,
  homograph_group = excluded.homograph_group,
  difficulty = excluded.difficulty,
  tags = excluded.tags,
  updated_at = now();

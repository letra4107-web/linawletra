-- Cache index for Google Cloud TTS (fil-PH-Wavenet) audio synthesis.
-- Audio bytes live in the existing public "tts-cache" Storage bucket;
-- this table is the queryable lookup so repeat requests for the same
-- text+voice+speed skip the Google TTS call entirely. Server-only
-- (accessed via the service-role key, which bypasses RLS), so RLS is
-- enabled with no policies to deny all direct client access.

CREATE TABLE IF NOT EXISTS tts_cache (
  text_hash   TEXT PRIMARY KEY,
  voice       TEXT NOT NULL,
  speed       NUMERIC NOT NULL,
  audio_path  TEXT NOT NULL,
  audio_url   TEXT NOT NULL,
  timepoints  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tts_cache ENABLE ROW LEVEL SECURITY;

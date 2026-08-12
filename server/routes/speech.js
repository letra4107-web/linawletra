import express from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { computeTranscriptScore } from '../services/pronunciationScoring.js';
import readingProgression from '../services/readingProgression.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, '../temp/');
fs.mkdirSync(tempDir, { recursive: true });

const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'marin';
const STT_MODEL = process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe';
const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY;
const GOOGLE_TTS_VOICE = process.env.GOOGLE_TTS_VOICE || 'fil-PH-Wavenet-A';
const GOOGLE_TTS_LANGUAGE_CODE = 'fil-PH';
const GOOGLE_TTS_CACHE_BUCKET = 'tts-cache';
const isOpenAIConfigured = () =>
  Boolean(process.env.OPENAI_API_KEY) && process.env.OPENAI_API_KEY !== 'YOUR_OPENAI_API_KEY';
const TAGALOG_TTS_INSTRUCTIONS = [
  'Speak in clear Filipino/Tagalog pronunciation for young learners.',
  'Use natural Philippine pacing, soft classroom warmth, and distinct syllables.',
  'Keep Tagalog vowels crisp: a as in ama, e as in ate, i as in isa, o as in oso, u as in ulo.',
  'For hyphenated practice words, pause lightly between syllables without saying the hyphen.',
  'Do not use an American accent for Tagalog words.',
].join(' ');

const formatForTagalogSpeech = (text = '') =>
  String(text)
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const escapeSsml = (text = '') =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Builds SSML with a <mark> before each WORD (not each syllable) so Google's
// timepoint API can report back real per-word playback offsets. Marking every
// syllable was measured to add ~20% to the synthesized audio duration
// (verified: 39,168 bytes marked vs. 32,640 bytes plain, same text/voice/
// speed — the mark density visibly breaks up natural prosody, producing the
// choppy/robotic sound). Word-level marks produce byte-identical audio to
// unmarked plain text, so this keeps natural pacing while still giving the
// client a real per-word timing anchor; syllable position within a word is
// then estimated client-side (see useSyllableHighlight.js), same technique
// already used for the no-timepoints OpenAI fallback, just scoped to a much
// smaller (single-word) time window instead of the whole sentence.
const buildWordMarkedSsml = (text) => {
  const words = formatForTagalogSpeech(text).split(/\s+/).filter(Boolean);
  const parts = [];
  words.forEach((word, wordIndex) => {
    parts.push(`<mark name="w${wordIndex}"/>${escapeSsml(word)} `);
  });
  return `<speak>${parts.join('')}</speak>`;
};

// Builds SSML with a <mark> before each SYLLABLE of a single already-split
// word (caller passes the syllable parts, e.g. ["ka","li","ka","san"]) — this
// mirrors the mobile app's proven karaoke path (mobile-app-backend/backend/
// routes/tts.js buildMarkedSsml), which is always used for exactly one word
// at a deliberately slow rate, never a full sentence. Marking every syllable
// of a whole sentence measurably distorts natural prosody (see
// buildWordMarkedSsml above); marking every syllable of a single word at
// slow speed is the mobile-confirmed-working case this reproduces.
const buildSyllableMarkedSsml = (syllables) => {
  const body = syllables.map((syllable, index) => `<mark name="s${index}"/>${escapeSsml(syllable)}`).join('');
  return `<speak>${body}</speak>`;
};

// Google documents SSML mark timepoints as returned unordered; the mobile
// backend explicitly re-sorts by the numeric mark suffix rather than trusting
// array order (mobile-app-backend/backend/routes/tts.js). The web endpoints
// below were missing this, which could silently scramble which word/syllable
// gets highlighted at which timestamp when Google's ordering didn't match.
const sortTimepointsByMarkIndex = (timepoints, prefix) => {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  return [...timepoints].sort((a, b) => {
    const aMatch = re.exec(a.markName || '');
    const bMatch = re.exec(b.markName || '');
    return (aMatch ? Number(aMatch[1]) : 0) - (bMatch ? Number(bMatch[1]) : 0);
  });
};

// Bumping this invalidates previously cached audio synthesized with the old
// per-syllable-marked SSML (see buildWordMarkedSsml above) so stale, choppier
// clips aren't served from tts_cache forever after the fix.
const TTS_CACHE_VERSION = 'v2';

const hashCacheKey = (text, voice, speed) =>
  crypto.createHash('sha256').update(`${TTS_CACHE_VERSION}|${text}|${voice}|${speed}`).digest('hex');

const getCachedTts = async (textHash) => {
  const { data, error } = await supabase
    .from('tts_cache')
    .select('audio_url, timepoints')
    .eq('text_hash', textHash)
    .maybeSingle();
  if (error) {
    console.warn('[TTS] Cache lookup failed:', error.message);
    return null;
  }
  return data || null;
};

const storeCachedTts = async ({ textHash, voice, speed, buffer, timepoints }) => {
  const audioPath = `${textHash}.mp3`;
  const { error: uploadError } = await supabase.storage
    .from(GOOGLE_TTS_CACHE_BUCKET)
    .upload(audioPath, buffer, { contentType: 'audio/mpeg', upsert: true });
  if (uploadError) {
    console.warn('[TTS] Cache upload failed:', uploadError.message);
    return null;
  }

  const { data: publicData } = supabase.storage.from(GOOGLE_TTS_CACHE_BUCKET).getPublicUrl(audioPath);
  const audioUrl = publicData?.publicUrl;
  if (!audioUrl) return null;

  const { error: insertError } = await supabase
    .from('tts_cache')
    .upsert({
      text_hash: textHash,
      voice,
      speed,
      audio_path: audioPath,
      audio_url: audioUrl,
      timepoints,
    });
  if (insertError) {
    console.warn('[TTS] Cache index write failed:', insertError.message);
  }

  return audioUrl;
};

// v1beta1 is required for SSML <mark> timepoints on fil-PH-Wavenet voices —
// v1 accepts the same request shape but silently ignores enableTimePointing
// (confirmed by the mobile backend too: it 400s with "Unknown name
// enableTimePointing" on v1). Only used by the two marked-SSML paths below;
// plain-text synthesis (no highlighting requested) stays on v1 unchanged.
const GOOGLE_TTS_ENDPOINT_V1 = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const GOOGLE_TTS_ENDPOINT_V1BETA = 'https://texttospeech.googleapis.com/v1beta1/text:synthesize';

const callGoogleTTS = async ({ ssml, text, speed, voice, enableTimePointing }) => {
  const response = await fetch(
    `${enableTimePointing ? GOOGLE_TTS_ENDPOINT_V1BETA : GOOGLE_TTS_ENDPOINT_V1}?key=${GOOGLE_TTS_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: ssml ? { ssml } : { text },
        voice: { languageCode: GOOGLE_TTS_LANGUAGE_CODE, name: voice || GOOGLE_TTS_VOICE },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: Number(speed) || 0.88,
        },
        ...(enableTimePointing ? { enableTimePointing: ['SSML_MARK'] } : {}),
      }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.audioContent) {
    const err = new Error(data?.error?.message || `Google TTS request failed (status ${response.status})`);
    err.status = response.status;
    err.googleError = data?.error || null;
    throw err;
  }

  return { buffer: Buffer.from(data.audioContent, 'base64'), rawTimepoints: data.timepoints || [] };
};

const callGoogleTTSWithTimepoints = async (text, { speed, voice } = {}) => {
  const { buffer, rawTimepoints } = await callGoogleTTS({
    ssml: buildWordMarkedSsml(text), speed, voice, enableTimePointing: true,
  });

  const timepoints = sortTimepointsByMarkIndex(rawTimepoints, 'w').map((tp) => {
    const match = /^w(\d+)$/.exec(tp.markName || '');
    return {
      markName: tp.markName,
      wordIndex: match ? Number(match[1]) : null,
      timeSeconds: tp.timeSeconds,
    };
  });

  return { buffer, timepoints };
};

// Mirrors mobile's speak-syllables path: one <mark> per syllable of a single
// word, forced to a slow speaking rate so the per-syllable marks (which
// distort prosody at normal/sentence speed — see buildWordMarkedSsml) sound
// like deliberate, clear pronunciation practice instead of choppy speech.
const MIN_KARAOKE_RATE = 0.25;
const MAX_KARAOKE_RATE = 1.0;
const DEFAULT_KARAOKE_RATE = 0.5;

const callGoogleTTSSyllables = async (syllables, { speed, voice } = {}) => {
  const rate = Number.isFinite(Number(speed))
    ? Math.min(MAX_KARAOKE_RATE, Math.max(MIN_KARAOKE_RATE, Number(speed)))
    : DEFAULT_KARAOKE_RATE;

  const { buffer, rawTimepoints } = await callGoogleTTS({
    ssml: buildSyllableMarkedSsml(syllables), speed: rate, voice, enableTimePointing: true,
  });

  const timepoints = sortTimepointsByMarkIndex(rawTimepoints, 's').map((tp) => {
    const match = /^s(\d+)$/.exec(tp.markName || '');
    return {
      markName: tp.markName,
      wordIndex: 0,
      syllableIndex: match ? Number(match[1]) : null,
      timeSeconds: tp.timeSeconds,
    };
  });

  return { buffer, timepoints, rate };
};

// Configure multer for audio file uploads with temp storage
const upload = multer({
  dest: tempDir, // Temp directory
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit for Whisper
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

let openai = null;

const getOpenAIClient = () => {
  if (!isOpenAIConfigured()) return null;
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
};

// Speech-to-Text endpoint
router.post('/stt', authMiddleware, upload.single('audio'), async (req, res) => {
  try {
    const openaiClient = getOpenAIClient();
    if (!openaiClient) {
      return res.status(503).json({ error: 'Speech-to-text is not configured on this server' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const transcription = await openaiClient.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: STT_MODEL,
      language: 'tl', // Tagalog
      prompt: 'Tagalog or Filipino reading practice by a child. Preserve Filipino words as spoken.',
      response_format: 'text'
    });

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    res.json({ text: transcription });
  } catch (error) {
    console.error('STT Error:', error);
    // Clean up temp file if exists
    if (req.file && req.file.path) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    res.status(500).json({ error: 'Speech-to-text failed' });
  }
});

// Text-to-Speech endpoint. Google Cloud (Wavenet + SSML mark timepoints) is
// primary so the client can drive real syllable-level highlighting; OpenAI
// is the fallback when Google is unavailable, with no real timepoints (the
// client falls back further to its own character-length estimate for that
// case — see useSyllableHighlight.js).
router.post('/tts', authMiddleware, async (req, res) => {
  const { text, voice, speed, instructions } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  const normalizedSpeed = Number(speed) || 0.88;
  const effectiveVoice = voice || GOOGLE_TTS_VOICE;

  if (GOOGLE_TTS_API_KEY) {
    const textHash = hashCacheKey(formatForTagalogSpeech(text), effectiveVoice, normalizedSpeed);

    const cached = await getCachedTts(textHash);
    if (cached) {
      console.log('[TTS] /tts cache hit', { voice: effectiveVoice, characters: text.length });
      return res.json({ audioUrl: cached.audio_url, timepoints: cached.timepoints, source: 'google-cache' });
    }

    try {
      const { buffer, timepoints } = await callGoogleTTSWithTimepoints(text, {
        speed: normalizedSpeed,
        voice: effectiveVoice,
      });

      const audioUrl = await storeCachedTts({
        textHash, voice: effectiveVoice, speed: normalizedSpeed, buffer, timepoints,
      });

      console.log('[TTS] /tts synthesized via google', { voice: effectiveVoice, characters: text.length, cached: false });

      if (audioUrl) {
        return res.json({ audioUrl, timepoints, source: 'google' });
      }

      // Cache write failed but synthesis succeeded — serve directly rather
      // than losing the audio, just without a durable URL to reuse later.
      return res.json({
        audioUrl: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
        timepoints,
        source: 'google',
      });
    } catch (error) {
      // Never log the request URL here — it carries ?key=<GOOGLE_TTS_API_KEY>.
      console.error('[TTS] /tts Google synthesis failed, falling back to OpenAI:', {
        status: error.status || null,
        message: error.message,
        googleError: error.googleError || null,
      });
    }
  }

  if (isOpenAIConfigured()) {
    try {
      const openaiClient = getOpenAIClient();
      const mp3 = await openaiClient.audio.speech.create({
        model: TTS_MODEL,
        voice: (voice && voice.startsWith('fil-PH') ? null : voice) || TTS_VOICE,
        input: formatForTagalogSpeech(text),
        instructions: instructions || TAGALOG_TTS_INSTRUCTIONS,
        speed: normalizedSpeed,
        response_format: 'mp3',
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());

      console.log('[TTS] /tts synthesized via openai-fallback', { characters: text.length });

      return res.json({
        audioUrl: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
        timepoints: [],
        source: 'openai-fallback',
      });
    } catch (error) {
      console.error('[TTS] /tts OpenAI fallback also failed:', {
        status: error.status || null,
        message: error.message,
      });
    }
  }

  console.error('[TTS] /tts exhausted all providers', {
    googleConfigured: Boolean(GOOGLE_TTS_API_KEY),
    openaiConfigured: isOpenAIConfigured(),
  });
  res.status(503).json({ error: 'Text-to-speech is not configured on this server' });
});

// Syllable karaoke endpoint. Mirrors the mobile app's proven /tts/speak-syllables
// path (mobile-app-backend/backend/routes/tts.js): takes an already-split
// single word's syllables, marks each one in SSML, synthesizes at a slow
// rate, and returns real per-syllable timepoints (not estimated). There is
// intentionally no OpenAI fallback here — mobile's own comment explains why:
// an alternate voice/provider carries no timing data, so there is no way to
// keep highlighting in sync. On failure the client falls back to plain
// (non-highlighted) playback via /tts instead.
router.post('/tts-syllables', authMiddleware, async (req, res) => {
  const { syllables, voice, speed } = req.body || {};

  if (!Array.isArray(syllables) || !syllables.length) {
    return res.status(400).json({ error: 'syllables must be a non-empty array' });
  }
  const cleanSyllables = syllables.map((s) => String(s || '').trim()).filter(Boolean);
  if (!cleanSyllables.length) {
    return res.status(400).json({ error: 'syllables must be a non-empty array' });
  }
  if (cleanSyllables.length > 12) {
    return res.status(400).json({ error: 'Too many syllables (max 12)' });
  }

  if (!GOOGLE_TTS_API_KEY) {
    console.error('[TTS] /tts-syllables requested but GOOGLE_TTS_API_KEY is not configured');
    return res.status(503).json({ error: 'Syllable read-along is not configured on this server' });
  }

  const effectiveVoice = voice || GOOGLE_TTS_VOICE;
  const rateForCacheKey = Number.isFinite(Number(speed))
    ? Math.min(MAX_KARAOKE_RATE, Math.max(MIN_KARAOKE_RATE, Number(speed)))
    : DEFAULT_KARAOKE_RATE;
  const textHash = hashCacheKey(`SYL:${cleanSyllables.join('|')}`, effectiveVoice, rateForCacheKey);

  const cached = await getCachedTts(textHash);
  if (cached) {
    console.log('[TTS] /tts-syllables cache hit', { voice: effectiveVoice, syllableCount: cleanSyllables.length });
    return res.json({ audioUrl: cached.audio_url, timepoints: cached.timepoints, source: 'google-cache' });
  }

  try {
    const { buffer, timepoints, rate } = await callGoogleTTSSyllables(cleanSyllables, {
      speed, voice: effectiveVoice,
    });

    const audioUrl = await storeCachedTts({
      textHash, voice: effectiveVoice, speed: rate, buffer, timepoints,
    });

    console.log('[TTS] /tts-syllables synthesized via google', { voice: effectiveVoice, syllableCount: cleanSyllables.length, rate, cached: false });

    if (audioUrl) {
      return res.json({ audioUrl, timepoints, source: 'google' });
    }
    return res.json({
      audioUrl: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
      timepoints,
      source: 'google',
    });
  } catch (error) {
    console.error('[TTS] /tts-syllables Google synthesis failed:', {
      status: error.status || null,
      message: error.message,
      googleError: error.googleError || null,
    });
    return res.status(502).json({ error: 'Could not generate syllable read-along right now' });
  }
});

// Lightweight scoring endpoint: compares expected text to a transcript
router.post('/score', authMiddleware, async (req, res) => {
  try {
    const {
      expected_text: expectedText,
      transcript,
      content_id: contentId,
      duration_seconds: durationSeconds,
      is_full_submission: isFullSubmission,
    } = req.body || {};
    if (!expectedText || !transcript) return res.status(400).json({ error: 'expected_text and transcript are required' });

    const score = computeTranscriptScore(expectedText, transcript);

    if (!contentId) {
      return res.json({ score, progression: null, recorded: false, reason: 'no_content_id' });
    }

    // If the caller provided a content_id, record the attempt using the canonical
    // server-side RPC so progression logic is centralized.
    try {
      let childId = null;
      // Prefer authenticated user's auth UID -> children.auth_uid
      if (req.user && req.user.id) {
        const { data: childRow, error: childErr } = await supabase
          .from('children')
          .select('id')
          .eq('auth_uid', String(req.user.id))
          .limit(1)
          .maybeSingle();
        if (!childErr && childRow && childRow.id) childId = childRow.id;
      }

      // If no child found via auth, but a legacy student_id was provided, resolve via mapping
      if (!childId && req.body.student_id) {
        childId = await readingProgression.resolveChildIdForStudent(req.body.student_id);
      }

      if (!childId) {
        return res.json({ score, progression: null, recorded: false, reason: 'no_child_resolved' });
      }

      const params = {
        p_student_id: childId,
        p_content_id: contentId,
        p_accuracy: score,
        p_transcript: transcript,
        p_duration_seconds: Number.isFinite(Number(durationSeconds)) ? Math.trunc(Number(durationSeconds)) : null,
        p_is_full_submission: isFullSubmission === true,
        p_source: 'practice',
      };

      const { data: rpcData, error: rpcError } = await supabase.rpc('record_student_content_attempt', params);
      if (rpcError) {
        console.warn('[Speech.score] record_student_content_attempt RPC failed:', rpcError.message || rpcError);
        return res.json({ score, progression: null, recorded: false, reason: 'rpc_error' });
      }

      return res.json({ score, progression: rpcData, recorded: true });
    } catch (recordErr) {
      console.warn('[Speech.score] attempt recording failed:', recordErr && recordErr.message ? recordErr.message : recordErr);
      return res.json({ score, progression: null, recorded: false, reason: 'record_error' });
    }
  } catch (error) {
    console.error('[Speech.score] Error:', error);
    return res.status(500).json({ error: 'Scoring failed' });
  }
});

export default router;



import express from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { syllabify } from '../services/tagalogPhonetics.js';
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

// Builds SSML with a <mark> before each syllable so Google's timepoint API
// can report back the exact playback offset each syllable starts at —
// that's what makes real karaoke-style highlighting possible, instead of
// the character-length estimate used for the OpenAI fallback path.
//
// A mark isolating a single-letter syllable (e.g. the "a" in "a-so") makes
// Google's fil-PH voices read that letter as its English alphabet name
// ("ay") instead of the Tagalog vowel sound ("ah") — confirmed by A/B
// testing plain text vs. marked text with identical voice/endpoint. Since
// Tagalog syllables frequently start with a lone vowel ("a-so", "u-lo",
// "i-sa"...), a 1-letter syllable is merged into the following syllable
// (or the preceding one, if it's word-final) so no mark ever isolates a
// single letter. The merged unit gets one mark at its first syllable's
// index; the syllable(s) folded into it don't get their own highlight
// step, which is the accepted trade-off for correct pronunciation.
const buildSyllableSsml = (text) => {
  const words = formatForTagalogSpeech(text).split(/\s+/).filter(Boolean);
  const parts = [];
  words.forEach((word, wordIndex) => {
    const rawSyllables = syllabify(word);
    const syllables = rawSyllables.length ? rawSyllables : [word];

    const units = [];
    syllables.forEach((syllable, syllableIndex) => {
      if (syllable.length === 1 && syllableIndex + 1 < syllables.length) {
        units.push({ text: syllable, firstIndex: syllableIndex, pendingMerge: true });
      } else if (units.length && units[units.length - 1].pendingMerge) {
        units[units.length - 1].text += syllable;
        delete units[units.length - 1].pendingMerge;
      } else {
        units.push({ text: syllable, firstIndex: syllableIndex });
      }
    });

    units.forEach((unit) => {
      parts.push(`<mark name="w${wordIndex}_s${unit.firstIndex}"/>${escapeSsml(unit.text)}`);
    });
    parts.push(' ');
  });
  return `<speak>${parts.join('')}</speak>`;
};

const hashCacheKey = (text, voice, speed) =>
  crypto.createHash('sha256').update(`${text}|${voice}|${speed}`).digest('hex');

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
// v1 accepts the same request shape but silently ignores enableTimePointing.
const callGoogleTTSWithTimepoints = async (text, { speed, voice } = {}) => {
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { ssml: buildSyllableSsml(text) },
        voice: { languageCode: GOOGLE_TTS_LANGUAGE_CODE, name: voice || GOOGLE_TTS_VOICE },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: Number(speed) || 0.88,
        },
        enableTimePointing: ['SSML_MARK'],
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Google TTS request failed');
  }

  const timepoints = (data.timepoints || []).map((tp) => {
    const match = /^w(\d+)_s(\d+)$/.exec(tp.markName || '');
    return {
      markName: tp.markName,
      wordIndex: match ? Number(match[1]) : null,
      syllableIndex: match ? Number(match[2]) : null,
      timeSeconds: tp.timeSeconds,
    };
  });

  return { buffer: Buffer.from(data.audioContent, 'base64'), timepoints };
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
      console.error('Google TTS Error, falling back to OpenAI:', error.message || error);
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

      return res.json({
        audioUrl: `data:audio/mpeg;base64,${buffer.toString('base64')}`,
        timepoints: [],
        source: 'openai-fallback',
      });
    } catch (error) {
      console.error('OpenAI TTS Error:', error.message || error);
    }
  }

  res.status(503).json({ error: 'Text-to-speech is not configured on this server' });
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



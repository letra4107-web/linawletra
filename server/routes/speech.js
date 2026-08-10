import express from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, '../temp/');
fs.mkdirSync(tempDir, { recursive: true });

const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'marin';
const STT_MODEL = process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe';
const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY;
const GOOGLE_TTS_VOICE = process.env.GOOGLE_TTS_VOICE || 'fil-PH-Standard-A';
const GOOGLE_TTS_LANGUAGE_CODE = 'fil-PH';
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

const callGoogleTTS = async (text, { speed } = {}) => {
  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: formatForTagalogSpeech(text) },
        voice: { languageCode: GOOGLE_TTS_LANGUAGE_CODE, name: GOOGLE_TTS_VOICE },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: Number(speed) || 0.88,
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Google TTS request failed');
  }

  return Buffer.from(data.audioContent, 'base64');
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

// Text-to-Speech endpoint
router.post('/tts', authMiddleware, async (req, res) => {
  const { text, instructions, voice, speed } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  if (isOpenAIConfigured()) {
    try {
      const openaiClient = getOpenAIClient();
      const mp3 = await openaiClient.audio.speech.create({
        model: TTS_MODEL,
        voice: voice || TTS_VOICE,
        input: formatForTagalogSpeech(text),
        instructions: instructions || TAGALOG_TTS_INSTRUCTIONS,
        speed: Number(speed) || 0.88,
        response_format: 'mp3'
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length,
      });

      return res.send(buffer);
    } catch (error) {
      console.error('OpenAI TTS Error, falling back to Google TTS:', error.message || error);
    }
  }

  if (GOOGLE_TTS_API_KEY) {
    try {
      const buffer = await callGoogleTTS(text, { speed });

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length,
      });

      return res.send(buffer);
    } catch (error) {
      console.error('Google TTS Error:', error.message || error);
    }
  }

  res.status(503).json({ error: 'Text-to-speech is not configured on this server' });
});

export default router;


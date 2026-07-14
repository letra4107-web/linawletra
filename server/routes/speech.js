import express from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const tempDir = path.join(__dirname, '../temp/');
fs.mkdirSync(tempDir, { recursive: true });

const TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'marin';
const STT_MODEL = process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe';
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

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Speech-to-Text endpoint
router.post('/stt', upload.single('audio'), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'Speech-to-text is not configured on this server' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const transcription = await openai.audio.transcriptions.create({
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
router.post('/tts', async (req, res) => {
  try {
    const { text, instructions, voice, speed } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'Text-to-speech is not configured on this server' });
    }

    const mp3 = await openai.audio.speech.create({
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

    res.send(buffer);
  } catch (error) {
    console.error('TTS Error:', error);
    res.status(500).json({ error: 'Text-to-speech failed' });
  }
});

export default router;


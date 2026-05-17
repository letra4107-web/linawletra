const express = require('express');
const multer = require('multer');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Configure multer for audio file uploads with temp storage
const upload = multer({
  dest: path.join(__dirname, '../temp/'), // Temp directory
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
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: 'whisper-1',
      language: 'tl', // Tagalog
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
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy', // Can be alloy, echo, fable, onyx, nova, shimmer
      input: text,
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

module.exports = router;
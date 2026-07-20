import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eye, Loader2, Mic, Pause, Play, RotateCcw, Settings, Volume2 } from 'lucide-react';
import { readingService, speechService } from '../services/api';
import { compareReadingText, splitIntoSentences } from '../utils/readingAccuracy';
import { READING_LEVEL_LABELS, normalizeReadingLevel } from '../constants/readingLevels';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './ReadingAssistant.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
const DEFAULT_READING_SETTINGS = {
  font: 'comic',
  fontSize: 2,
  lineHeight: 2,
  letterSpacing: 0,
  theme: 'soft',
  focusMode: true,
  showPdf: true,
};

const getStoredReadingSettings = () => {
  try {
    return { ...DEFAULT_READING_SETTINGS, ...JSON.parse(localStorage.getItem('readingAccessibilitySettings') || '{}') };
  } catch (error) {
    return DEFAULT_READING_SETTINGS;
  }
};

const splitSyllables = (word = '') => String(word).split(/([-‐‑‒–—]+)/).filter(Boolean);

export default function StudentReadingAssistant() {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState([]);
  const [studentReadingLevel, setStudentReadingLevel] = useState('beginner');
  const [selectedId, setSelectedId] = useState('');
  const [material, setMaterial] = useState(null);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [rate, setRate] = useState(0.85);
  const [speakingWordIndex, setSpeakingWordIndex] = useState(-1);
  const [listening, setListening] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [speechLoading, setSpeechLoading] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [readingSettings, setReadingSettings] = useState(getStoredReadingSettings);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);

  const sentences = useMemo(() => splitIntoSentences(material?.extracted_text || material?.extractedText || ''), [material]);
  const currentSentence = sentences[sentenceIndex] || '';
  const currentWords = currentSentence.split(/\s+/).filter(Boolean);

  useEffect(() => {
    const loadMaterials = async () => {
      setLoading(true);
      try {
        const response = await readingService.getMaterials();
        const list = response?.data?.materials || [];
        setStudentReadingLevel(normalizeReadingLevel(response?.data?.studentReadingLevel));
        setMaterials(list);
        if (list[0]?.id) setSelectedId(list[0].id);
      } finally {
        setLoading(false);
      }
    };
    loadMaterials();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const loadMaterial = async () => {
      setLoading(true);
      try {
        const response = await readingService.getMaterial(selectedId);
        setMaterial(response?.data?.material || null);
        setSentenceIndex(0);
        setPageNumber(1);
        setFeedback(null);
        setSpokenText('');
      } finally {
        setLoading(false);
      }
    };
    loadMaterial();
  }, [selectedId]);

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    audioRef.current?.pause?.();
    recognitionRef.current?.abort?.();
  }, []);

  useEffect(() => {
    localStorage.setItem('readingAccessibilitySettings', JSON.stringify(readingSettings));
  }, [readingSettings]);

  const getTagalogVoice = () => {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    return voices.find((voice) => /fil|tl|ph/i.test(`${voice.lang} ${voice.name}`)) || voices.find((voice) => /en/i.test(voice.lang)) || null;
  };

  const readWithBrowserVoice = (text = currentSentence) => {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setAudioPlaying(true);
    setSpeakingWordIndex(0);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fil-PH';
    utterance.rate = rate;
    utterance.pitch = 1;
    utterance.voice = getTagalogVoice();
    utterance.onboundary = (event) => {
      if (event.name !== 'word') return;
      const spokenPrefix = text.slice(0, event.charIndex);
      setSpeakingWordIndex(spokenPrefix.split(/\s+/).filter(Boolean).length);
    };
    utterance.onend = () => {
      setSpeakingWordIndex(-1);
      setAudioPlaying(false);
    };
    window.speechSynthesis.speak(utterance);
  };

  const readText = async (text = currentSentence) => {
    if (!text) return;

    audioRef.current?.pause?.();
    window.speechSynthesis?.cancel();
    setSpeakingWordIndex(-1);
    setSpeechLoading(true);
    setAudioPlaying(false);

    try {
      const response = await speechService.textToSpeech(text, {
        speed: rate,
        instructions: 'Read this Filipino/Tagalog sentence naturally for a young learner. Use Philippine Tagalog pronunciation, gentle pacing, and clear syllables.',
      });
      const audioUrl = URL.createObjectURL(response.data);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onplay = () => setAudioPlaying(true);
      audio.onpause = () => setAudioPlaying(false);
      audio.onended = () => {
        setAudioPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setAudioPlaying(false);
        URL.revokeObjectURL(audioUrl);
        readWithBrowserVoice(text);
      };
      await audio.play();
    } catch (error) {
      readWithBrowserVoice(text);
    } finally {
      setSpeechLoading(false);
    }
  };

  const readCurrentSentence = () => readText(currentSentence);
  const readWord = (word) => readText(word);

  const pauseSpeech = () => {
    audioRef.current?.pause?.();
    if (window.speechSynthesis?.speaking) window.speechSynthesis.pause();
    setAudioPlaying(false);
  };

  const replaySpeech = () => {
    audioRef.current?.pause?.();
    window.speechSynthesis?.cancel();
    readCurrentSentence();
  };

  const startListening = () => {
    if (!SpeechRecognition) {
      setFeedback({ accuracyScore: 0, feedback: 'Speech recognition is not supported in this browser.' });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'fil-PH';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    setListening(true);
    setSpokenText('');
    setFeedback(null);

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ');
      setSpokenText(transcript);
      if (event.results[event.results.length - 1]?.isFinal) {
        evaluateSpeech(transcript);
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setFeedback({ accuracyScore: 0, feedback: 'I could not hear clearly. Check the microphone, then try again.' });
    };
    recognition.onend = () => setListening(false);
    recognition.start();
  };

  const evaluateSpeech = async (transcript = spokenText) => {
    const result = compareReadingText(currentSentence, transcript);
    setFeedback(result);
    setSaving(true);
    try {
      await readingService.saveAttempt({
        materialId: material.id,
        sentence: currentSentence,
        expectedText: currentSentence,
        spokenText: transcript,
      });
    } catch (error) {
      setFeedback({ ...result, feedback: `${result.feedback} Progress could not be saved right now.` });
    } finally {
      setSaving(false);
    }
  };

  const moveSentence = (direction) => {
    setSentenceIndex((current) => Math.max(0, Math.min(sentences.length - 1, current + direction)));
    setFeedback(null);
    setSpokenText('');
    setSpeakingWordIndex(-1);
    audioRef.current?.pause?.();
    window.speechSynthesis?.cancel();
  };

  const updateReadingSetting = (key, value) => {
    setReadingSettings((current) => ({ ...current, [key]: value }));
  };

  const sentenceStyle = {
    fontSize: `${readingSettings.fontSize}rem`,
    lineHeight: readingSettings.lineHeight,
    letterSpacing: `${readingSettings.letterSpacing}px`,
  };

  const wordStatusByIndex = new Map((feedback?.checkedWords || []).map((item, index) => [index, item.status]));

  return (
    <div className={`student-reading-page reading-theme-${readingSettings.theme} reading-font-${readingSettings.font}`}>
      <header className="student-reading-header">
        <div>
          <button type="button" className="reading-back-button" onClick={() => navigate('/student-dashboard')}>
            <ChevronLeft size={18} />
            Back
          </button>
          <p className="reading-kicker">Learn</p>
          <h1>PDF Reading Assistant</h1>
          <p>Listen, read aloud, and get friendly feedback for each Tagalog sentence.</p>
          <span className="reading-level-badge">Level: {READING_LEVEL_LABELS[studentReadingLevel]}</span>
        </div>
        <div className="reading-header-actions">
          <button type="button" className="reading-back-button" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}>
            <Settings size={18} />
            Reading settings
          </button>
          <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={loading}>
            {materials.length === 0 ? <option>No assigned materials</option> : materials.map((item) => {
              const level = normalizeReadingLevel(item.difficulty_level);
              const matchLabel = item.matches_reading_level ? 'matches your level' : READING_LEVEL_LABELS[level];
              return <option key={item.id} value={item.id}>{item.title} - {matchLabel}</option>;
            })}
          </select>
        </div>
      </header>

      {settingsOpen && (
        <section className="reading-accessibility-panel" aria-label="Reading accessibility settings">
          <label>
            Font
            <select value={readingSettings.font} onChange={(event) => updateReadingSetting('font', event.target.value)}>
              <option value="comic">Comic Sans</option>
              <option value="dyslexic">OpenDyslexic</option>
              <option value="hyperlegible">Atkinson Hyperlegible</option>
              <option value="simple">Simple sans</option>
            </select>
          </label>
          <label>
            Font size
            <input type="range" min="1.4" max="3" step="0.1" value={readingSettings.fontSize} onChange={(event) => updateReadingSetting('fontSize', Number(event.target.value))} />
          </label>
          <label>
            Line spacing
            <input type="range" min="1.4" max="2.6" step="0.1" value={readingSettings.lineHeight} onChange={(event) => updateReadingSetting('lineHeight', Number(event.target.value))} />
          </label>
          <label>
            Letter spacing
            <input type="range" min="0" max="6" step="1" value={readingSettings.letterSpacing} onChange={(event) => updateReadingSetting('letterSpacing', Number(event.target.value))} />
          </label>
          <label>
            Theme
            <select value={readingSettings.theme} onChange={(event) => updateReadingSetting('theme', event.target.value)}>
              <option value="soft">Soft green</option>
              <option value="cream">Cream</option>
              <option value="blue">Pale blue</option>
              <option value="contrast">High contrast</option>
            </select>
          </label>
          <label className="reading-toggle">
            <input type="checkbox" checked={readingSettings.focusMode} onChange={(event) => updateReadingSetting('focusMode', event.target.checked)} />
            One item at a time
          </label>
          <label className="reading-toggle">
            <input type="checkbox" checked={readingSettings.showPdf} onChange={(event) => updateReadingSetting('showPdf', event.target.checked)} />
            Show PDF
          </label>
        </section>
      )}

      {loading ? (
        <div className="reading-loading"><Loader2 className="spin" /> Loading reading material...</div>
      ) : !material ? (
        <div className="reading-empty">Your teacher has not assigned a PDF reading material yet.</div>
      ) : (
        <main className={`student-reading-grid ${!readingSettings.showPdf ? 'reading-grid-practice-only' : ''}`}>
          {readingSettings.showPdf && <section className="pdf-viewer-panel">
            <div className="pdf-toolbar">
              <button type="button" onClick={() => setPageNumber((page) => Math.max(1, page - 1))}><ChevronLeft size={18} /></button>
              <span>Page {pageNumber} of {numPages || material.pages || 1}</span>
              <button type="button" onClick={() => setPageNumber((page) => Math.min(numPages || material.pages || 1, page + 1))}><ChevronRight size={18} /></button>
            </div>
            <div className="pdf-canvas-wrap">
              <Document file={material.pdf_url} onLoadSuccess={({ numPages: nextPages }) => setNumPages(nextPages)} loading="Loading PDF...">
                <Page pageNumber={pageNumber} width={Math.min(720, window.innerWidth - 48)} />
              </Document>
            </div>
          </section>}

          <section className="reading-practice-panel">
            <div className="sentence-progress">
              Sentence {sentenceIndex + 1} of {sentences.length || 1}
            </div>
            <div className={`material-level-note ${material.matches_reading_level ? 'match' : ''}`}>
              Material level: {READING_LEVEL_LABELS[normalizeReadingLevel(material.difficulty_level)]}
              {material.matches_reading_level ? ' - matches your enrolled reading level' : ''}
            </div>
            <div className={`current-sentence ${readingSettings.focusMode ? 'focus-mode' : ''}`} style={sentenceStyle}>
              {currentWords.map((word, index) => (
                <button
                  type="button"
                  key={`${word}-${index}`}
                  className={`reading-word ${index === speakingWordIndex ? 'word-active' : ''} ${wordStatusByIndex.get(index) ? `word-${wordStatusByIndex.get(index)}` : ''}`}
                  onClick={() => readWord(word)}
                  aria-label={`Read ${word}`}
                >
                  {splitSyllables(word).map((part, partIndex) => (
                    /^[-‐‑‒–—]+$/.test(part)
                      ? <span key={`${part}-${partIndex}`} className="syllable-divider">{part}</span>
                      : <span key={`${part}-${partIndex}`} className="syllable-part">{part}</span>
                  ))}
                </button>
              ))}
            </div>
            <p className="reading-helper"><Eye size={16} /> Tap a word to hear it again.</p>

            <div className="reading-controls">
              <button type="button" className="read-button" onClick={readCurrentSentence} disabled={speechLoading || audioPlaying}>
                {speechLoading ? <Loader2 className="spin" size={22} /> : <Volume2 size={22} />}
                {speechLoading ? 'Getting voice...' : audioPlaying ? 'Reading...' : 'Read For Me'}
              </button>
              <button type="button" className="icon-reading-button" onClick={pauseSpeech} aria-label="Pause speech"><Pause size={20} /></button>
              <button type="button" className="icon-reading-button" onClick={replaySpeech} aria-label="Replay speech"><RotateCcw size={20} /></button>
            </div>

            <label className="speed-control">
              Reading speed
              <input type="range" min="0.6" max="1.2" step="0.05" value={rate} onChange={(event) => setRate(Number(event.target.value))} />
              <span>{rate.toFixed(2)}x</span>
            </label>

            <button type="button" className={`mic-button ${listening ? 'listening' : ''}`} onClick={startListening} disabled={listening || saving}>
              {listening ? <Play size={24} /> : <Mic size={24} />}
              {listening ? 'Nakikinig...' : 'Read aloud'}
            </button>

            {spokenText && (
              <div className="spoken-box">
                <span>You said</span>
                <p>{spokenText}</p>
              </div>
            )}

            {feedback && (
              <div className={`feedback-card ${feedback.accuracyScore >= 90 ? 'great' : feedback.accuracyScore >= 70 ? 'ok' : 'try'}`}>
                <strong>{feedback.accuracyScore >= 90 ? 'Great reading' : feedback.accuracyScore >= 70 ? 'Good try' : 'Try again'}</strong>
                <span className="teacher-score">{feedback.accuracyScore}% accuracy</span>
                <p>{feedback.feedback}</p>
                {feedback.practiceParts?.length > 0 && <p>Practice: {feedback.practiceParts.join(', ')}</p>}
                {feedback.checkedWords?.length > 0 && (
                  <div className="word-feedback-list">
                    {feedback.checkedWords.map((item, index) => (
                      <span key={`${item.expected}-${index}`} className={`word-feedback-pill ${item.status}`}>
                        {item.expected}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="sentence-actions">
              <button type="button" onClick={() => moveSentence(-1)} disabled={sentenceIndex === 0}>Previous</button>
              <button type="button" onClick={() => moveSentence(1)} disabled={sentenceIndex >= sentences.length - 1}>Next sentence</button>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

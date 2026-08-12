import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Eye, Loader2, Mic, Pause, Play, RotateCcw, Settings, Volume2 } from 'lucide-react';
import { readingService, speechService } from '../services/api';
import { compareReadingText, splitIntoSentences } from '../utils/readingAccuracy';
import { syllabify } from '../utils/tagalogPhonetics';
import { useSyllableHighlight } from '../hooks/useSyllableHighlight';
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
  const { activeWordIndex, activeSyllableIndex, prepare, prepareFromTimepoints, updateFromProgress, highlightWholeWord, reset: resetHighlight } = useSyllableHighlight(syllabify);
  const [listening, setListening] = useState(false);
  const [spokenText, setSpokenText] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [speechLoading, setSpeechLoading] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [readingSettings, setReadingSettings] = useState(getStoredReadingSettings);
  // Shown only when BOTH TTS layers (cloud + browser speechSynthesis
  // fallback) fail for the same read request -- kept separate from
  // `feedback`, which is for the STT pronunciation-check result, not TTS.
  const [ttsError, setTtsError] = useState('');
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  // Bumped at the start of every readText()/pause/navigation. A request only
  // gets to touch audio/highlight state if it's still the latest one when its
  // network call resolves -- otherwise an older, slower request finishing
  // after a newer one (rapid word clicks, changing sentence mid-fetch) would
  // start playing stale audio on top of what's already playing.
  const ttsRequestIdRef = useRef(0);

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
    ttsRequestIdRef.current += 1;
    window.speechSynthesis?.cancel();
    const audio = audioRef.current;
    if (audio) {
      audio.onplay = null;
      audio.onpause = null;
      audio.onended = null;
      audio.onerror = null;
      audio.ontimeupdate = null;
      try { audio.pause(); } catch (e) { /* already stopped/released */ }
    }
    recognitionRef.current?.abort?.();
  }, []);

  useEffect(() => {
    localStorage.setItem('readingAccessibilitySettings', JSON.stringify(readingSettings));
  }, [readingSettings]);

  const getTagalogVoice = () => {
    const voices = window.speechSynthesis?.getVoices?.() || [];
    return voices.find((voice) => /fil|tl|ph/i.test(`${voice.lang} ${voice.name}`)) || voices.find((voice) => /en/i.test(voice.lang)) || null;
  };

  // Shown only when BOTH TTS layers failed for this request -- resets on the
  // next successful read/speak attempt (auto-clears here so it doesn't
  // linger once the student moves on).
  const showTtsError = (message) => {
    setTtsError(message);
    setTimeout(() => setTtsError((current) => (current === message ? '' : current)), 4000);
  };

  // Stops/detaches whatever is currently in audioRef so its onplay/onpause/
  // onended/onerror/ontimeupdate handlers can never fire again -- without
  // this, an audio element superseded by a newer readText() call could still
  // fire a late event (e.g. onended) that clobbers highlight/playing state
  // set up by the request that replaced it.
  const stopAudio = () => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (!audio) return;
    audio.onplay = null;
    audio.onpause = null;
    audio.onended = null;
    audio.onerror = null;
    audio.ontimeupdate = null;
    try { audio.pause(); } catch (e) { /* already stopped/released */ }
  };

  // Only fires (and updates state) if this request is still the current one
  // -- callers pass their captured requestId so a superseded request (e.g.
  // the student moved to another sentence) can't start narrating over
  // whatever is now on screen. Surfaces a real, user-facing error only when
  // this fallback itself is unavailable/fails too, i.e. BOTH TTS layers
  // failed for this request.
  const readWithBrowserVoice = (text = currentSentence, wordIndexOffset = 0, requestId = ttsRequestIdRef.current) => {
    if (requestId !== ttsRequestIdRef.current) return;
    if (!text) return;
    if (!window.speechSynthesis) {
      console.error('[TTS] both cloud synthesis and browser speechSynthesis are unavailable');
      showTtsError('Unable to play the pronunciation. Please try again.');
      return;
    }
    window.speechSynthesis.cancel();
    setAudioPlaying(true);
    highlightWholeWord(wordIndexOffset);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fil-PH';
    utterance.rate = rate;
    utterance.pitch = 1;
    utterance.voice = getTagalogVoice();
    utterance.onboundary = (event) => {
      if (event.name !== 'word' || requestId !== ttsRequestIdRef.current) return;
      const spokenPrefix = text.slice(0, event.charIndex);
      highlightWholeWord(wordIndexOffset + spokenPrefix.split(/\s+/).filter(Boolean).length);
    };
    utterance.onend = () => {
      if (requestId !== ttsRequestIdRef.current) return;
      resetHighlight();
      setAudioPlaying(false);
    };
    utterance.onerror = (event) => {
      console.error('[TTS] browser speechSynthesis fallback failed', { error: event?.error });
      if (requestId !== ttsRequestIdRef.current) return;
      setAudioPlaying(false);
      resetHighlight();
      showTtsError('Unable to play the pronunciation. Please try again.');
    };
    window.speechSynthesis.speak(utterance);
  };

  const readText = async (text = currentSentence, wordIndexOffset = 0) => {
    if (!text) return;

    const requestId = ++ttsRequestIdRef.current;
    setTtsError('');
    stopAudio();
    window.speechSynthesis?.cancel();
    resetHighlight();
    setSpeechLoading(true);
    setAudioPlaying(false);

    try {
      const { data } = await speechService.textToSpeech(text, {
        speed: rate,
        instructions: 'Read this Filipino/Tagalog sentence naturally for a young learner. Use Philippine Tagalog pronunciation, gentle pacing, and clear syllables.',
      });
      if (requestId !== ttsRequestIdRef.current) return; // superseded while the request was in flight

      const audio = new Audio(data.audioUrl);
      stopAudio();
      audioRef.current = audio;
      prepare(text, wordIndexOffset);
      const offsetTimepoints = (data.timepoints || []).map((tp) => ({
        ...tp, wordIndex: tp.wordIndex + wordIndexOffset,
      }));
      prepareFromTimepoints(offsetTimepoints);
      audio.ontimeupdate = () => {
        if (requestId === ttsRequestIdRef.current) updateFromProgress(audio.currentTime, audio.duration);
      };
      audio.onplay = () => { if (requestId === ttsRequestIdRef.current) setAudioPlaying(true); };
      audio.onpause = () => { if (requestId === ttsRequestIdRef.current) setAudioPlaying(false); };
      audio.onended = () => {
        if (requestId !== ttsRequestIdRef.current) return;
        setAudioPlaying(false);
        resetHighlight();
      };
      audio.onerror = () => {
        console.warn('[TTS] audio element playback error', {
          code: audio.error?.code,
          message: audio.error?.message,
        });
        if (requestId !== ttsRequestIdRef.current) return;
        setAudioPlaying(false);
        readWithBrowserVoice(text, wordIndexOffset, requestId);
      };
      await audio.play();
    } catch (error) {
      console.warn('[TTS] /tts request failed', {
        status: error?.response?.status,
        message: error?.response?.data?.error || error?.message,
      });
      if (requestId === ttsRequestIdRef.current) readWithBrowserVoice(text, wordIndexOffset, requestId);
    } finally {
      if (requestId === ttsRequestIdRef.current) setSpeechLoading(false);
    }
  };

  const readCurrentSentence = () => readText(currentSentence, 0);
  const readWord = (word, index) => readText(word, index);

  const pauseSpeech = () => {
    ttsRequestIdRef.current += 1; // invalidate any in-flight read so it can't start playing after this pause
    audioRef.current?.pause?.();
    if (window.speechSynthesis?.speaking) window.speechSynthesis.pause();
    setAudioPlaying(false);
    setSpeechLoading(false);
  };

  const replaySpeech = () => {
    stopAudio();
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
    ttsRequestIdRef.current += 1; // invalidate any in-flight read for the sentence being left
    setSentenceIndex((current) => Math.max(0, Math.min(sentences.length - 1, current + direction)));
    setFeedback(null);
    setSpokenText('');
    resetHighlight();
    stopAudio();
    window.speechSynthesis?.cancel();
    setAudioPlaying(false);
    setSpeechLoading(false);
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
                  className={`reading-word ${index === activeWordIndex ? 'word-active' : ''} ${wordStatusByIndex.get(index) ? `word-${wordStatusByIndex.get(index)}` : ''}`}
                  onClick={() => readWord(word, index)}
                  aria-label={`Read ${word}`}
                >
                  {syllabify(word).map((syllable, syllableIndex, arr) => (
                    <span key={`${syllable}-${syllableIndex}`}>
                      <span className={`syllable-part ${index === activeWordIndex && (activeSyllableIndex === -1 || syllableIndex === activeSyllableIndex) ? 'syllable-active' : ''}`}>
                        {syllable}
                      </span>
                      {syllableIndex < arr.length - 1 && <span className="syllable-divider" aria-hidden="true">&middot;</span>}
                    </span>
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
            {ttsError && <p className="tts-error-note" role="alert">{ttsError}</p>}

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
                <p>{feedback.pronunciationIssues?.[0]?.message || feedback.feedback}</p>
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

import { useCallback, useRef, useState } from 'react';

// Rough Tagalog TTS pacing used only as a fallback when the browser can't report a real
// audio duration (see below) — not used at all once real duration is available.
const ESTIMATED_CHARS_PER_SECOND = 9;

// TTS audio (OpenAI/Google) carries no word or phoneme timing data, so this estimates
// which syllable is "active" from real audio playback progress: each syllable gets a
// weight proportional to its character length, and the syllable whose cumulative
// [start, end) time-slice contains the current progress fraction is highlighted.
export function useSyllableHighlight(syllabifyFn) {
  const [active, setActive] = useState({ wordIndex: -1, syllableIndex: -1 });
  const segmentsRef = useRef([]);
  const estimatedDurationRef = useRef(1);

  const prepare = useCallback((text, wordIndexOffset = 0) => {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const segments = [];
    let totalWeight = 0;

    words.forEach((word, localIndex) => {
      const syllables = syllabifyFn(word);
      const list = syllables.length ? syllables : [word];
      list.forEach((syllable, syllableIndex) => {
        const weight = Math.max(1, syllable.length);
        totalWeight += weight;
        segments.push({ wordIndex: wordIndexOffset + localIndex, syllableIndex, weight });
      });
    });

    let cumulative = 0;
    segments.forEach((segment) => {
      segment.start = cumulative / (totalWeight || 1);
      cumulative += segment.weight;
      segment.end = cumulative / (totalWeight || 1);
    });

    segmentsRef.current = segments;
    estimatedDurationRef.current = Math.max(0.4, String(text || '').trim().length / ESTIMATED_CHARS_PER_SECOND);
  }, [syllabifyFn]);

  // Takes raw currentTime/duration (seconds) rather than a pre-divided fraction: some
  // browsers report Infinity/NaN for a blob-sourced <audio> element's duration until the
  // whole file has been scanned, which would otherwise make currentTime/duration collapse
  // to 0 for the entire clip. Falling back to the text-length estimate keeps highlighting
  // moving even when the real duration isn't available yet.
  const updateFromProgress = useCallback((currentTime, duration) => {
    const segments = segmentsRef.current;
    if (!segments.length) return;
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : estimatedDurationRef.current;
    const clamped = Math.min(1, Math.max(0, currentTime / safeDuration));
    const match = segments.find((segment) => clamped < segment.end) || segments[segments.length - 1];
    setActive({ wordIndex: match.wordIndex, syllableIndex: match.syllableIndex });
  }, []);

  const highlightWholeWord = useCallback((wordIndex) => setActive({ wordIndex, syllableIndex: -1 }), []);
  const reset = useCallback(() => setActive({ wordIndex: -1, syllableIndex: -1 }), []);

  return {
    activeWordIndex: active.wordIndex,
    activeSyllableIndex: active.syllableIndex,
    prepare,
    updateFromProgress,
    highlightWholeWord,
    reset,
  };
}

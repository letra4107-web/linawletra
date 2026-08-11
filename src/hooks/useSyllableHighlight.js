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
  const timepointsRef = useRef([]);

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
    timepointsRef.current = [];
  }, [syllabifyFn]);

  // Real Google TTS timepoints (one per syllable's start offset) — used
  // instead of the character-length estimate whenever they're available.
  // Falls back to `updateFromProgress`'s estimate when timepoints is [],
  // e.g. the OpenAI fallback path, which carries no real timing data.
  const prepareFromTimepoints = useCallback((timepoints) => {
    timepointsRef.current = Array.isArray(timepoints) ? timepoints : [];
  }, []);

  const updateFromTimepoints = useCallback((currentTime) => {
    const timepoints = timepointsRef.current;
    if (!timepoints.length) return false;

    let match = timepoints[0];
    for (const tp of timepoints) {
      if (tp.timeSeconds <= currentTime) match = tp;
      else break;
    }
    setActive({ wordIndex: match.wordIndex, syllableIndex: match.syllableIndex });
    return true;
  }, []);

  // Takes raw currentTime/duration (seconds) rather than a pre-divided fraction: some
  // browsers report Infinity/NaN for a blob-sourced <audio> element's duration until the
  // whole file has been scanned, which would otherwise make currentTime/duration collapse
  // to 0 for the entire clip. Falling back to the text-length estimate keeps highlighting
  // moving even when the real duration isn't available yet.
  //
  // Prefers real Google timepoints (set via prepareFromTimepoints) when present;
  // falls back to the character-length estimate otherwise (e.g. OpenAI fallback audio).
  const updateFromProgress = useCallback((currentTime, duration) => {
    if (updateFromTimepoints(currentTime)) return;

    const segments = segmentsRef.current;
    if (!segments.length) return;
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : estimatedDurationRef.current;
    const clamped = Math.min(1, Math.max(0, currentTime / safeDuration));
    const match = segments.find((segment) => clamped < segment.end) || segments[segments.length - 1];
    setActive({ wordIndex: match.wordIndex, syllableIndex: match.syllableIndex });
  }, [updateFromTimepoints]);

  const highlightWholeWord = useCallback((wordIndex) => setActive({ wordIndex, syllableIndex: -1 }), []);
  const reset = useCallback(() => setActive({ wordIndex: -1, syllableIndex: -1 }), []);

  return {
    activeWordIndex: active.wordIndex,
    activeSyllableIndex: active.syllableIndex,
    prepare,
    prepareFromTimepoints,
    updateFromProgress,
    highlightWholeWord,
    reset,
  };
}

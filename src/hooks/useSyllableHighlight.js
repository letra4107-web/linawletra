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
  const wordSyllablesRef = useRef({});
  const estimatedDurationRef = useRef(1);
  const timepointsRef = useRef([]);

  const prepare = useCallback((text, wordIndexOffset = 0) => {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const segments = [];
    const wordSyllables = {};
    let totalWeight = 0;

    words.forEach((word, localIndex) => {
      const syllables = syllabifyFn(word);
      const list = syllables.length ? syllables : [word];
      const globalWordIndex = wordIndexOffset + localIndex;

      let wordWeight = 0;
      const localWeights = list.map((syllable, syllableIndex) => {
        const weight = Math.max(1, syllable.length);
        wordWeight += weight;
        return { syllableIndex, weight };
      });
      let wordCumulative = 0;
      wordSyllables[globalWordIndex] = localWeights.map(({ syllableIndex, weight }) => {
        const start = wordCumulative / (wordWeight || 1);
        wordCumulative += weight;
        const end = wordCumulative / (wordWeight || 1);
        return { syllableIndex, start, end };
      });

      list.forEach((syllable, syllableIndex) => {
        const weight = Math.max(1, syllable.length);
        totalWeight += weight;
        segments.push({ wordIndex: globalWordIndex, syllableIndex, weight });
      });
    });

    let cumulative = 0;
    segments.forEach((segment) => {
      segment.start = cumulative / (totalWeight || 1);
      cumulative += segment.weight;
      segment.end = cumulative / (totalWeight || 1);
    });

    segmentsRef.current = segments;
    wordSyllablesRef.current = wordSyllables;
    estimatedDurationRef.current = Math.max(0.4, String(text || '').trim().length / ESTIMATED_CHARS_PER_SECOND);
    timepointsRef.current = [];
  }, [syllabifyFn]);

  // Real Google TTS timepoints. Two shapes are accepted:
  //  - Word-level: { wordIndex, timeSeconds } — one per WORD's start offset
  //    (see buildWordMarkedSsml in server/routes/speech.js; marking every
  //    syllable of a whole sentence measurably distorted the audio's natural
  //    pacing, so only word starts are real there). Syllable position within
  //    the word is then estimated (see updateFromTimepoints below).
  //  - Exact syllable-level: { wordIndex, syllableIndex, timeSeconds } — one
  //    per SYLLABLE, real (see buildSyllableMarkedSsml / the /tts-syllables
  //    endpoint, used for single-word karaoke practice, mirroring the mobile
  //    app's proven speak-syllables path). No estimation needed; used as-is.
  // Falls back to `updateFromProgress`'s character-length estimate when
  // timepoints is [], e.g. the OpenAI fallback path, which carries no real
  // timing data at all.
  const prepareFromTimepoints = useCallback((timepoints) => {
    timepointsRef.current = Array.isArray(timepoints) ? timepoints : [];
  }, []);

  // Anchors on the real timepoint at-or-before currentTime. If it already
  // carries an exact syllableIndex, uses it directly — no estimation, no
  // faked timing. Otherwise (word-level-only timepoints), estimates which
  // syllable within that word is active from the fraction of the word's time
  // window (this word's start to the next word's start, or to `duration` for
  // the last word) elapsed so far — same character-weight technique as the
  // no-timepoints fallback below, just scoped to one word instead of the
  // whole sentence, so estimation error stays small.
  const updateFromTimepoints = useCallback((currentTime, duration) => {
    const timepoints = timepointsRef.current;
    if (!timepoints.length) return false;

    let index = 0;
    for (let i = 0; i < timepoints.length; i += 1) {
      if (timepoints[i].timeSeconds <= currentTime) index = i;
      else break;
    }
    const current = timepoints[index];

    if (current.syllableIndex !== undefined && current.syllableIndex !== null) {
      setActive({ wordIndex: current.wordIndex ?? 0, syllableIndex: current.syllableIndex });
      return true;
    }

    const next = timepoints[index + 1];
    const windowStart = current.timeSeconds;
    const windowEnd = next
      ? next.timeSeconds
      : (Number.isFinite(duration) && duration > windowStart ? duration : windowStart + 1);
    const fraction = windowEnd > windowStart
      ? Math.min(1, Math.max(0, (currentTime - windowStart) / (windowEnd - windowStart)))
      : 0;

    const syllables = wordSyllablesRef.current[current.wordIndex] || [];
    const match = syllables.find((segment) => fraction < segment.end) || syllables[syllables.length - 1];
    setActive({ wordIndex: current.wordIndex, syllableIndex: match ? match.syllableIndex : -1 });
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
    if (updateFromTimepoints(currentTime, duration)) return;

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

import { supabase } from '../config/supabase.js';
import { authorizeStudent } from '../utils/studentAccess.js';

const MIN_ATTEMPTS_FOR_MASTERED = 3;
const MIN_ATTEMPTS_FOR_DIFFICULT = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

const clampScore = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const normalizeWordText = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeTags = (value) => {
  if (Array.isArray(value)) return value.map((tag) => String(tag).toLowerCase()).filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean);
};

const computeRecencyNeed = (lastAttemptAt) => {
  if (!lastAttemptAt) return 1;
  const elapsedDays = (Date.now() - new Date(lastAttemptAt).getTime()) / DAY_MS;
  if (!Number.isFinite(elapsedDays) || elapsedDays <= 0) return 0;
  return clampScore(elapsedDays / 14);
};

const buildRecommendation = (row = {}, context = {}) => {
  const word = normalizeWordText(row.word);
  const tags = normalizeTags(row.tags);
  const patternWords = context.confusionPatterns || [];
  const weaknessMatch = clampScore(
    patternWords.reduce((score, pattern) => {
      const examples = Array.isArray(pattern.example_words) ? pattern.example_words.map(normalizeWordText) : [];
      const tagHit = tags.includes(String(pattern.pattern_type || '').toLowerCase());
      const exampleHit = examples.includes(word);
      if (!tagHit && !exampleHit) return score;
      return score + Math.min(Number(pattern.occurrence_count || 1) / 5, 1);
    }, 0)
  );
  const masteryGap = clampScore(1 - (Number(row.avg_pronunciation_score || 0) / 100));
  const recencyNeed = computeRecencyNeed(row.last_attempt_at);
  const structuralFit = row.mastery_status === 'difficult'
    ? 1
    : row.mastery_status === 'needs_practice'
      ? 0.75
      : row.source === 'practice_words'
        ? 0.55
        : 0.5;
  const score = Math.round((
    weaknessMatch * 0.35 +
    masteryGap * 0.3 +
    recencyNeed * 0.2 +
    structuralFit * 0.15
  ) * 100);

  return {
    ...row,
    word,
    recommendation_score: score,
    predicted_probability: null,
    ranking: {
      weakness_match: Number(weaknessMatch.toFixed(2)),
      mastery_gap: Number(masteryGap.toFixed(2)),
      recency_need: Number(recencyNeed.toFixed(2)),
      structural_fit: Number(structuralFit.toFixed(2)),
      score,
      rationale: [
        weaknessMatch > 0 ? 'Matches recurring phoneme/sound confusions.' : null,
        masteryGap >= 0.4 ? 'Pronunciation mastery still has room to improve.' : null,
        recencyNeed >= 0.5 ? 'Has not been practiced recently.' : null,
        structuralFit >= 0.75 ? 'Fits the current practice priority.' : null,
      ].filter(Boolean),
    },
  };
};

/**
 * Upsert a student's mastery state for one word, and bump any confusion
 * patterns this attempt revealed. Called once per word from a recorded
 * reading attempt (word, phrase, sentence, or story mode).
 */
export async function recordWordOutcome(studentId, word, evaluation) {
  const cleanWord = String(word || '').toLowerCase().trim();
  if (!studentId || !cleanWord || !evaluation) return;

  const { data: existing } = await supabase
    .from('word_mastery')
    .select('*')
    .eq('student_id', studentId)
    .eq('word', cleanWord)
    .maybeSingle();

  const prevAttempts = existing?.attempt_count || 0;
  const prevCorrect = existing?.correct_count || 0;
  const newAttempts = prevAttempts + 1;
  const isCorrect = (evaluation.pronunciationScore || 0) >= 80;
  const newCorrect = prevCorrect + (isCorrect ? 1 : 0);

  const rollingAvg = (prevAvg, value) => Math.round((((prevAvg || 0) * prevAttempts) + (value || 0)) / newAttempts);
  const avgPronunciation = rollingAvg(existing?.avg_pronunciation_score, evaluation.pronunciationScore);
  const avgPhoneme = rollingAvg(existing?.avg_phoneme_accuracy, evaluation.phonemeAccuracy);
  const avgSyllable = rollingAvg(existing?.avg_syllable_accuracy, evaluation.syllableAccuracy);

  let masteryStatus = 'needs_practice';
  if (newAttempts >= MIN_ATTEMPTS_FOR_MASTERED && avgPronunciation >= 85) masteryStatus = 'mastered';
  else if (newAttempts >= MIN_ATTEMPTS_FOR_DIFFICULT && avgPronunciation < 60) masteryStatus = 'difficult';

  const now = new Date().toISOString();
  const statusChanged = existing?.mastery_status !== masteryStatus;

  await supabase.from('word_mastery').upsert({
    student_id: studentId,
    word: cleanWord,
    mastery_status: masteryStatus,
    attempt_count: newAttempts,
    correct_count: newCorrect,
    avg_pronunciation_score: avgPronunciation,
    avg_phoneme_accuracy: avgPhoneme,
    avg_syllable_accuracy: avgSyllable,
    last_attempt_at: now,
    ...(statusChanged ? { last_status_change_at: now } : {}),
  }, { onConflict: 'student_id,word' });

  for (const pattern of evaluation.confusions || []) {
    const { data: existingPattern } = await supabase
      .from('confusion_patterns')
      .select('occurrence_count, example_words')
      .eq('student_id', studentId)
      .eq('pattern_type', pattern)
      .maybeSingle();

    const exampleWords = new Set(existingPattern?.example_words || []);
    exampleWords.add(cleanWord);

    await supabase.from('confusion_patterns').upsert({
      student_id: studentId,
      pattern_type: pattern,
      occurrence_count: (existingPattern?.occurrence_count || 0) + 1,
      last_seen_at: now,
      example_words: [...exampleWords].slice(0, 10),
    }, { onConflict: 'student_id,pattern_type' });
  }
}

async function authorizeStudentAccess(req, studentId) {
  const { student, allowed } = await authorizeStudent(req, studentId);
  return allowed ? student : null;
}

export async function getWordMastery(req, res) {
  try {
    const student = await authorizeStudentAccess(req, req.params.studentId);
    if (!student) return res.status(403).json({ message: 'You do not have permission to view this data.' });

    const { data, error } = await supabase
      .from('word_mastery')
      .select('*')
      .eq('student_id', student.id)
      .order('last_attempt_at', { ascending: false });
    if (error) throw error;

    const grouped = { mastered: [], needsPractice: [], difficult: [] };
    (data || []).forEach((row) => {
      if (row.mastery_status === 'mastered') grouped.mastered.push(row);
      else if (row.mastery_status === 'difficult') grouped.difficult.push(row);
      else grouped.needsPractice.push(row);
    });

    res.json({
      counts: { mastered: grouped.mastered.length, needsPractice: grouped.needsPractice.length, difficult: grouped.difficult.length },
      ...grouped,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getConfusionPatterns(req, res) {
  try {
    const student = await authorizeStudentAccess(req, req.params.studentId);
    if (!student) return res.status(403).json({ message: 'You do not have permission to view this data.' });

    const { data, error } = await supabase
      .from('confusion_patterns')
      .select('*')
      .eq('student_id', student.id)
      .order('occurrence_count', { ascending: false });
    if (error) throw error;

    res.json({ patterns: data || [] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getPracticeRecommendations(req, res) {
  try {
    const student = await authorizeStudentAccess(req, req.params.studentId);
    if (!student) return res.status(403).json({ message: 'You do not have permission to view this data.' });

    const { data: confusionPatterns, error: confusionError } = await supabase
      .from('confusion_patterns')
      .select('*')
      .eq('student_id', student.id)
      .order('occurrence_count', { ascending: false })
      .limit(10);
    if (confusionError) throw confusionError;

    const { data, error } = await supabase
      .from('word_mastery')
      .select('*')
      .eq('student_id', student.id)
      .in('mastery_status', ['needs_practice', 'difficult'])
      .order('last_attempt_at', { ascending: false })
      .limit(25);
    if (error) throw error;

    if ((data || []).length > 0) {
      const words = (data || [])
        .map((row) => buildRecommendation(row, { confusionPatterns }))
        .sort((a, b) => b.recommendation_score - a.recommendation_score)
        .slice(0, 10);
      return res.json({
        strategy: 'rule_based_mastery_history',
        model_type: 'transparent_rule_based_ranking',
        predicted_probability: null,
        factors: ['weakness_match', 'mastery_gap', 'recency_need', 'structural_fit'],
        words,
      });
    }

    const levelToDifficulty = {
      Easy: 'madali',
      Medium: 'katamtaman',
      Hard: 'mahirap',
    };
    const difficulty = levelToDifficulty[student.current_phonetic_level || 'Easy'] || 'madali';
    const { data: coldStartWords, error: coldStartError } = await supabase
      .from('practice_words')
      .select('*')
      .eq('difficulty', difficulty)
      .order('id', { ascending: true })
      .limit(10);
    if (coldStartError) throw coldStartError;

    return res.json({
      strategy: 'rule_based_cold_start_level_words',
      model_type: 'transparent_rule_based_ranking',
      predicted_probability: null,
      factors: ['weakness_match', 'mastery_gap', 'recency_need', 'structural_fit'],
      words: (coldStartWords || []).map((word) => ({
        word: word.word,
        mastery_status: 'new',
        avg_pronunciation_score: null,
        source: 'practice_words',
        ...word,
      }))
        .map((row) => buildRecommendation(row, { confusionPatterns }))
        .sort((a, b) => b.recommendation_score - a.recommendation_score),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getLevelReadiness(req, res) {
  try {
    const student = await authorizeStudentAccess(req, req.params.studentId);
    if (!student) return res.status(403).json({ message: 'You do not have permission to view this data.' });

    const levelWords = Array.isArray(req.body.levelWords)
      ? req.body.levelWords.map((w) => String(w).toLowerCase().trim()).filter(Boolean)
      : [];

    const { data: studentRow } = await supabase
      .from('students')
      .select('current_phonetic_level')
      .eq('id', student.id)
      .maybeSingle();
    const currentLevel = studentRow?.current_phonetic_level || 'Easy';

    const { data: requirement } = await supabase
      .from('level_requirements')
      .select('*')
      .eq('level', currentLevel)
      .maybeSingle();

    if (!requirement) {
      return res.json({ ready: true, currentLevel, reason: 'No requirements configured for this level.' });
    }

    const { data: masteryRows } = await supabase
      .from('word_mastery')
      .select('word, mastery_status, avg_pronunciation_score')
      .eq('student_id', student.id)
      .in('word', levelWords.length ? levelWords : ['']);

    const rows = masteryRows || [];
    const masteredCount = rows.filter((r) => r.mastery_status === 'mastered').length;
    const difficultCount = rows.filter((r) => r.mastery_status === 'difficult').length;
    const avgAccuracy = rows.length
      ? Math.round(rows.reduce((sum, r) => sum + (r.avg_pronunciation_score || 0), 0) / rows.length)
      : 0;

    const checks = {
      masteredWords: {
        required: requirement.min_mastered_words,
        actual: masteredCount,
        pass: masteredCount >= requirement.min_mastered_words,
      },
      difficultWords: {
        required: requirement.max_difficult_words,
        actual: difficultCount,
        pass: difficultCount <= requirement.max_difficult_words,
      },
      avgAccuracy: {
        required: requirement.min_avg_accuracy,
        actual: avgAccuracy,
        pass: avgAccuracy >= requirement.min_avg_accuracy,
      },
    };

    const ready = Object.values(checks).every((c) => c.pass);
    res.json({ ready, currentLevel, checks });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

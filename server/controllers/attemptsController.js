import { supabase } from '../config/supabase.js';

const MIN_ATTEMPTS_FOR_MASTERED = 3;
const MIN_ATTEMPTS_FOR_DIFFICULT = 2;

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
  const { data: student } = await supabase
    .from('students')
    .select('id, user_id, parent_id, teacher_id')
    .or(`id.eq.${studentId},user_id.eq.${studentId}`)
    .maybeSingle();
  if (!student) return null;

  const isOwn = student.user_id === req.user.id;
  const isParent = req.user.role === 'parent' && student.parent_id === req.user.id;
  const isTeacher = req.user.role === 'teacher' && student.teacher_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  return (isOwn || isParent || isTeacher || isAdmin) ? student : null;
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

    const { data, error } = await supabase
      .from('word_mastery')
      .select('*')
      .eq('student_id', student.id)
      .in('mastery_status', ['needs_practice', 'difficult'])
      .order('last_attempt_at', { ascending: false })
      .limit(10);
    if (error) throw error;

    res.json({ words: data || [] });
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

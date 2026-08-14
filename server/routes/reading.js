import express from 'express';
import multer from 'multer';
import { createRequire } from 'module';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { compareReadingText } from '../services/readingAccuracy.js';
import { evaluateWord } from '../services/tagalogPhonetics.js';
import { VALID_READING_LEVELS, normalizeReadingLevel, getReadingLevelRank } from '../services/readingLevels.js';
import { recordWordOutcome, getWordMastery, getConfusionPatterns, getPracticeRecommendations, getLevelReadiness } from '../controllers/attemptsController.js';
import { getVisibleStudentIds } from '../utils/studentAccess.js';
import { getStudentStats } from '../services/studentStatsService.js';

const router = express.Router();
const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const isPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    if (!isPdf) return cb(new Error('Only PDF files are allowed.'));
    return cb(null, true);
  },
});

const parseAssignedStudents = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (error) {
    return String(value).split(',').map((item) => item.trim()).filter(Boolean);
  }
};

const normalizeId = (value) => (value == null ? '' : String(value).trim());

const uniqueIds = (values = []) => [...new Set(values.map(normalizeId).filter(Boolean))];
const XP_PER_CORRECT_WORD = 50;
const XP_BONUS_PERFECT_WORD = 25;
const PHONETIC_LEVEL_THRESHOLDS = { Easy: 5, Medium: 3, Hard: 2 };
const normalizePracticeText = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
// Same as normalizePracticeText but keeps hyphens intact, matching how
// curriculum_items.content/practice_words.word are actually stored (e.g.
// "ba-da"). Used only for the DB lookup in assertKnownPracticeTarget --
// normalizePracticeText's hyphen-stripping is for comparing two client-
// supplied strings to each other, not for matching against stored content.
const normalizeStoredPracticeText = (value = '') =>
  String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;

const getUtc8DateString = (date = new Date()) =>
  new Date(date.getTime() + UTC8_OFFSET_MS).toISOString().slice(0, 10);

const addDaysToDateString = (dateString, days) => {
  if (!dateString) return null;
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const getAssignedIds = (material = {}) => {
  const assigned = material.assigned_students || material.assignedStudents || [];
  if (Array.isArray(assigned)) return uniqueIds(assigned);
  try {
    const parsed = JSON.parse(assigned);
    return Array.isArray(parsed) ? uniqueIds(parsed) : uniqueIds([assigned]);
  } catch (error) {
    return uniqueIds(String(assigned).split(','));
  }
};

const resolveAssignedStudentIds = async (assignedStudents = []) => {
  const rawIds = uniqueIds(assignedStudents);
  if (!rawIds.length) return [];

  const { data: students, error } = await supabase
    .from('students')
    .select('id,user_id');

  if (error) {
    console.warn('[Reading] Could not expand assigned student ids:', error.message);
    return rawIds;
  }

  const expanded = [...rawIds];
  (students || []).forEach((student) => {
    const ids = uniqueIds([student.id, student.user_id]);
    if (ids.some((id) => rawIds.includes(id))) {
      expanded.push(...ids);
    }
  });

  return uniqueIds(expanded);
};

const safeFileName = (name = 'reading-material.pdf') =>
  name.replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-').slice(0, 120);

const parsePdfBuffer = async (buffer) => {
  if (typeof pdfParseModule === 'function') {
    return pdfParseModule(buffer);
  }

  if (typeof pdfParseModule.default === 'function') {
    return pdfParseModule.default(buffer);
  }

  if (typeof pdfParseModule.PDFParse === 'function') {
    const parser = new pdfParseModule.PDFParse({ data: buffer });
    try {
      const textResult = await parser.getText();
      return {
        text: textResult?.text || '',
        numpages: textResult?.total || textResult?.pages?.length || 0,
      };
    } finally {
      await parser.destroy?.();
    }
  }

  throw new Error('PDF parser is not available on this server.');
};

const getCurrentStudentRecord = async (userId) => {
  const { data } = await supabase
    .from('students')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data || null;
};

const assertKnownPracticeTarget = async (expectedText, wordTarget) => {
  const expected = normalizePracticeText(expectedText);
  const target = normalizePracticeText(wordTarget || expectedText);

  if (!target || expected !== target) {
    return { allowed: false, message: 'Practice target does not match the expected text.' };
  }

  const storedTarget = normalizeStoredPracticeText(wordTarget || expectedText);

  const { data: practiceWord, error: practiceWordError } = await supabase
    .from('practice_words')
    .select('id,word')
    .eq('word', storedTarget)
    .limit(1)
    .maybeSingle();

  if (practiceWordError && practiceWordError.code !== 'PGRST116') {
    throw practiceWordError;
  }

  if (practiceWord) {
    return { allowed: true, source: 'practice_words' };
  }

  const { data: curriculumItem, error: curriculumError } = await supabase
    .from('curriculum_items')
    .select('id,content')
    .eq('content', storedTarget)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (curriculumError && curriculumError.code !== 'PGRST116') {
    throw curriculumError;
  }

  if (curriculumItem) {
    return { allowed: true, source: 'curriculum_items' };
  }

  return { allowed: false, message: 'Practice target is not available for this student.' };
};

const updateStudentPronunciationProgress = async (student, payload, result) => {
  if (!student?.id) return null;

  const score = Number(result?.accuracyScore || 0);
  const target = String(payload.word_target || payload.expected_text || '').toLowerCase().trim();
  if (!target) return null;

  const isCorrect = score >= 80;
  const isPerfect = score === 100;
  const normalizedTarget = normalizePracticeText(target);
  const currentCompletedWords = Array.isArray(student.completed_words) ? student.completed_words : [];
  const alreadyCompleted = currentCompletedWords.some((word) => normalizePracticeText(word) === normalizedTarget);
  const history = Array.isArray(student.history) ? student.history : [];
  const alreadyPerfect = history.some((entry) =>
    normalizePracticeText(entry?.word || '') === normalizedTarget && Number(entry?.score || 0) === 100
  );
  const earnsCompletionXp = isCorrect && !alreadyCompleted;
  const earnsPerfectBonus = isPerfect && !alreadyPerfect;
  const earnedXp = (earnsCompletionXp ? XP_PER_CORRECT_WORD : 0) + (earnsPerfectBonus ? XP_BONUS_PERFECT_WORD : 0);
  const currentLevel = student.current_phonetic_level || 'Easy';
  const threshold = PHONETIC_LEVEL_THRESHOLDS[currentLevel] || PHONETIC_LEVEL_THRESHOLDS.Easy;
  const previousAccuracy = Number(student.accuracy || 0);
  const attemptRecord = {
    word: target,
    spoken: payload.spoken_text,
    score,
    correct: isCorrect,
    xp: earnedXp,
    completionXpAwarded: earnsCompletionXp,
    perfectBonusAwarded: earnsPerfectBonus,
    activityType: payload.activity_type,
    timestamp: Date.now(),
  };

  const nextHistory = [...history, attemptRecord].slice(-200);
  const previousTotalAttempts = Number(student.total_attempts || history.length || 0);
  const previousAccuracySum = Number(
    student.accuracy_sum ||
    history.reduce((sum, entry) => sum + (Number(entry?.score ?? entry?.accuracy ?? entry?.accuracy_percentage ?? 0) || 0), 0)
  );
  const updateData = {
    history: nextHistory,
    total_attempts: previousTotalAttempts + 1,
    accuracy_sum: previousAccuracySum + score,
    baseline_accuracy: student.baseline_accuracy ?? (previousTotalAttempts === 0 ? score : null),
    last_practice_date: new Date().toISOString(),
    accuracy: Math.round((previousAccuracySum + score) / (previousTotalAttempts + 1)),
    updated_at: new Date().toISOString(),
  };

  if (!isCorrect) {
    updateData.progress_in_level = 0;
  } else {
    if (earnedXp > 0) {
      updateData.xp = Number(student.xp || 0) + earnedXp;
    }
    if (!alreadyCompleted) {
      const nextWordsCompleted = Number(student.words_completed || 0) + 1;
      const nextProgressInLevel = Math.min(Number(student.progress_in_level || 0) + 1, threshold);
      updateData.words_completed = nextWordsCompleted;
      updateData.completed_words = [...currentCompletedWords, target];
      updateData.progress_in_level = nextProgressInLevel;
      updateData.activities_completed = Number(student.activities_completed || 0) + 1;
      if (nextWordsCompleted % 5 === 0) {
        updateData.achievements = Number(student.achievements || 0) + 1;
      }
    }

    if (payload.activity_type === 'word_of_day') {
      const today = getUtc8DateString();
      const previousWordOfDayDate = student.word_of_day_completed_date || null;

      if (previousWordOfDayDate !== today) {
        const previousStreak = Number(student.streak || 0);
        const yesterday = addDaysToDateString(today, -1);
        const nextStreak = previousWordOfDayDate === yesterday ? previousStreak + 1 : 1;
        updateData.word_of_day_completed_date = today;
        updateData.streak = nextStreak;
        updateData.longest_streak = Math.max(Number(student.longest_streak || 0), nextStreak);
        if (previousWordOfDayDate && previousWordOfDayDate !== yesterday && previousStreak >= 3) {
          updateData.had_streak_break = true;
        }
      }
    }
  }

  const { data, error } = await supabase
    .from('students')
    .update(updateData)
    .eq('id', student.id)
    .select()
    .single();

  if (error) {
    console.warn('[Reading] student progress update failed:', error.message);
    return null;
  }

  return getStudentStats(data.id);
};

const decorateMaterialForLevel = (material, studentLevel) => {
  const materialLevel = normalizeReadingLevel(material.difficulty_level || material.difficultyLevel);
  const learnerLevel = normalizeReadingLevel(studentLevel);
  return {
    ...material,
    difficulty_level: materialLevel,
    learner_reading_level: learnerLevel,
    matches_reading_level: materialLevel === learnerLevel,
    is_within_reading_level: getReadingLevelRank(materialLevel) <= getReadingLevelRank(learnerLevel),
  };
};

const userCanAccessMaterial = async (req, material) => {
  if (!material) return false;
  if (['admin', 'teacher'].includes(req.user.role)) {
    return req.user.role === 'admin' || material.uploaded_by === req.user.id || material.uploadedBy === req.user.id;
  }

  if (req.user.role === 'student') {
    const assigned = getAssignedIds(material);
    const student = await getCurrentStudentRecord(req.user.id);
    const ids = uniqueIds([req.user.id, student?.id, student?.user_id]);
    return assigned.some((id) => ids.includes(id));
  }

  if (req.user.role === 'parent') {
    const assigned = getAssignedIds(material);
    const { data: children } = await supabase
      .from('students')
      .select('id,user_id')
      .eq('parent_id', req.user.id);
    return (children || []).some((child) => uniqueIds([child.id, child.user_id]).some((id) => assigned.includes(id)));
  }

  return false;
};

router.post(
  '/preview',
  authMiddleware,
  roleMiddleware('teacher', 'admin'),
  upload.single('pdf'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'PDF file is required.' });

      const parsed = await parsePdfBuffer(req.file.buffer);
      const extractedText = (parsed.text || '').replace(/\s+\n/g, '\n').trim();
      return res.json({
        extractedText,
        pages: parsed.numpages || 0,
        needsManualText: !extractedText,
        message: extractedText
          ? 'Review the extracted text before assigning it.'
          : 'No selectable text was found. This PDF may be image-only, so paste or type the reading text.',
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  '/upload',
  authMiddleware,
  roleMiddleware('teacher', 'admin'),
  upload.single('pdf'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'PDF file is required.' });

      const { title, description = '', difficultyLevel = 'beginner', extractedText: editedText = '' } = req.body;
      const normalizedDifficulty = normalizeReadingLevel(difficultyLevel);
      if (!VALID_READING_LEVELS.includes(normalizedDifficulty)) {
        return res.status(400).json({ message: 'Difficulty must be beginner, intermediate, or advanced.' });
      }
      const assignedStudents = await resolveAssignedStudentIds(parseAssignedStudents(req.body.assignedStudents));
      const materialTitle = (title || req.file.originalname.replace(/\.pdf$/i, '')).trim();

      const parsed = await parsePdfBuffer(req.file.buffer);
      const extractedText = (editedText || parsed.text || '').replace(/\s+\n/g, '\n').trim();
      if (!extractedText) {
        return res.status(422).json({ message: 'No readable text was found. Paste or type the reading text before assigning this PDF.' });
      }

      const path = `${req.user.id}/${Date.now()}-${safeFileName(req.file.originalname)}`;
      const { error: uploadError } = await supabase.storage
        .from('reading-materials')
        .upload(path, req.file.buffer, {
          contentType: 'application/pdf',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from('reading-materials').getPublicUrl(path);
      const pdfUrl = publicData?.publicUrl || path;

      const insertPayload = {
        title: materialTitle,
        description,
        pdf_url: pdfUrl,
        storage_path: path,
        extracted_text: extractedText,
        pages: parsed.numpages || 0,
        uploaded_by: req.user.id,
        assigned_students: assignedStudents,
        difficulty_level: normalizedDifficulty,
      };

      const { data, error } = await supabase
        .from('reading_materials')
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;

      return res.status(201).json({ material: data });
    } catch (error) {
      return next(error);
    }
  }
);

router.get('/materials', authMiddleware, async (req, res, next) => {
  try {
    let query = supabase.from('reading_materials').select('*').order('created_at', { ascending: false });

    if (req.user.role === 'teacher') {
      query = query.eq('uploaded_by', req.user.id);
      const { data, error } = await query;
      if (error) throw error;
      return res.json({ materials: data || [] });
    }

    const { data, error } = await query;
    if (error) throw error;

    if (req.user.role === 'student') {
      const student = await getCurrentStudentRecord(req.user.id);
      const ids = uniqueIds([req.user.id, student?.id, student?.user_id]);
      const studentLevel = student?.reading_level || 'beginner';
      return res.json({
        studentReadingLevel: studentLevel,
        materials: (data || [])
          .filter((item) => getAssignedIds(item).some((id) => ids.includes(id)))
          .map((item) => decorateMaterialForLevel(item, studentLevel))
          .sort((a, b) => Number(b.matches_reading_level) - Number(a.matches_reading_level)),
      });
    }

    if (req.user.role === 'parent') {
      const { data: children } = await supabase.from('students').select('id,user_id').eq('parent_id', req.user.id);
      const ids = uniqueIds((children || []).flatMap((child) => [child.id, child.user_id]));
      return res.json({
        materials: (data || []).filter((item) => getAssignedIds(item).some((id) => ids.includes(id))),
      });
    }

    return res.json({ materials: req.user.role === 'admin' ? data || [] : [] });
  } catch (error) {
    return next(error);
  }
});

router.get('/materials/:id', authMiddleware, async (req, res, next) => {
  try {
    const { data: material, error } = await supabase
      .from('reading_materials')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !material) return res.status(404).json({ message: 'Reading material not found.' });

    const allowed = await userCanAccessMaterial(req, material);
    if (!allowed) return res.status(403).json({ message: 'You can only open assigned reading materials.' });

    if (req.user.role === 'student') {
      const student = await getCurrentStudentRecord(req.user.id);
      return res.json({ material: decorateMaterialForLevel(material, student?.reading_level || 'beginner') });
    }

    return res.json({ material });
  } catch (error) {
    return next(error);
  }
});

router.post('/attempts', authMiddleware, roleMiddleware('student'), async (req, res, next) => {
  try {
    const { materialId, sentence, expectedText, spokenText, mode, wordTarget, activityType } = req.body;
    if (!expectedText || !spokenText) {
      return res.status(400).json({ message: 'expectedText and spokenText are required.' });
    }
    if (!materialId && !wordTarget) {
      return res.status(400).json({ message: 'materialId or wordTarget is required.' });
    }

    if (!materialId && wordTarget) {
      const targetCheck = await assertKnownPracticeTarget(expectedText, wordTarget);
      if (!targetCheck.allowed) {
        return res.status(422).json({ message: targetCheck.message });
      }
    }

    if (materialId) {
      const { data: material, error: materialError } = await supabase
        .from('reading_materials')
        .select('*')
        .eq('id', materialId)
        .single();
      if (materialError || !material) return res.status(404).json({ message: 'Reading material not found.' });

      const allowed = await userCanAccessMaterial(req, material);
      if (!allowed) return res.status(403).json({ message: 'This material is not assigned to you.' });
    }

    const student = await getCurrentStudentRecord(req.user.id);
    const studentId = student?.id || req.user.id;
    const result = compareReadingText(expectedText, spokenText);
    const payload = {
      student_id: studentId,
      material_id: materialId || null,
      sentence: sentence || expectedText,
      expected_text: expectedText,
      spoken_text: spokenText,
      accuracy_score: result.accuracyScore,
      pronunciation_issues: result,
      completed_at: new Date().toISOString(),
      word_target: wordTarget || null,
      mode: mode || 'sentence',
      activity_type: activityType || (materialId ? 'lesson_material' : 'word_practice'),
      phoneme_accuracy: result.phonemeAccuracy,
      syllable_accuracy: result.syllableAccuracy,
      confusion_tags: result.confusionTags || [],
    };

    const { data, error } = await supabase
      .from('reading_attempts')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;

    for (const checkedWord of result.checkedWords) {
      const phonemeEval = checkedWord.phoneme || evaluateWord(checkedWord.expected, checkedWord.spoken || '');
      await recordWordOutcome(studentId, checkedWord.expected, phonemeEval).catch((e) =>
        console.warn('[Reading] word mastery update failed:', e.message)
      );
    }

    const studentProgress = await updateStudentPronunciationProgress(student, payload, result);

    return res.status(201).json({ attempt: data, result, studentProgress });
  } catch (error) {
    return next(error);
  }
});

router.get('/mastery/:studentId', authMiddleware, getWordMastery);
router.get('/confusions/:studentId', authMiddleware, getConfusionPatterns);
router.get('/practice-recommendations/:studentId', authMiddleware, getPracticeRecommendations);
router.post('/level-check/:studentId', authMiddleware, getLevelReadiness);

router.get('/analytics', authMiddleware, roleMiddleware('teacher', 'admin', 'parent'), async (req, res, next) => {
  try {
    const visibleStudentIds = await getVisibleStudentIds(req);
    const { data: attempts, error } = await supabase
      .from('reading_attempts')
      .select('*, reading_materials(title, uploaded_by)')
      .order('completed_at', { ascending: false })
      .limit(500);
    if (error) throw error;

    const visible = (attempts || []).filter((attempt) => {
      if (req.user.role === 'admin') return true;
      return visibleStudentIds.includes(attempt.student_id);
    });
    const studentIds = [...new Set(visible.map((attempt) => attempt.student_id).filter(Boolean))];
    const { data: studentRows, error: studentRowsError } = studentIds.length
      ? await supabase.from('students').select('id,name,user_id,reading_level,practice_level').in('id', studentIds)
      : { data: [], error: null };
    if (studentRowsError) throw studentRowsError;
    const usersById = new Map();
    const userIds = [...new Set((studentRows || []).map((student) => student.user_id).filter(Boolean))];
    if (userIds.length) {
      const { data: userRows, error: userRowsError } = await supabase.from('users').select('id,name,email,metadata').in('id', userIds);
      if (userRowsError) throw userRowsError;
      (userRows || []).forEach((user) => usersById.set(user.id, user));
    }
    const studentsById = new Map((studentRows || []).map((student) => [student.id, student]));
    const visibleWithStudents = visible.map((attempt) => {
      const student = studentsById.get(attempt.student_id) || {};
      const user = usersById.get(student.user_id) || {};
      return {
        ...attempt,
        student_name: student.name || user.name || user.metadata?.displayName || user.email || attempt.student_id,
        reading_level: student.reading_level || student.practice_level || null,
      };
    });

    const averageAccuracy = visibleWithStudents.length
      ? Math.round(visibleWithStudents.reduce((sum, item) => sum + Number(item.accuracy_score || 0), 0) / visibleWithStudents.length)
      : 0;
    const difficultWords = visibleWithStudents
      .flatMap((item) => item.pronunciation_issues?.missingWords || [])
      .reduce((acc, word) => {
        acc[word] = (acc[word] || 0) + 1;
        return acc;
      }, {});

    return res.json({
      averageAccuracy,
      completedAttempts: visibleWithStudents.length,
      difficultWords: Object.entries(difficultWords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, count]) => ({ word, count })),
      attempts: visibleWithStudents,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;



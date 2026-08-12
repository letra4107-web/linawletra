import { supabase } from '../config/supabase.js';
import { compareReadingText } from './readingAccuracy.js';
import { authorizeStudent, resolveStudent } from '../utils/studentAccess.js';
import { recordWordOutcome } from '../controllers/attemptsController.js';
import { getStudentStats } from './studentStatsService.js';
import {
  assertStudentCanAttemptModuleItem,
  canStudentAdvanceFromLevel,
  getStudentModulesForLevel,
  syncModuleProgressForItem,
} from './curriculumModules.js';

const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced'];
const PASS_ACCURACY = 80;
const MASTERY_ACCURACY = 100;
const PASSED_STATUSES = new Set(['passed_80', 'mastered_100']);

const TYPE_REQUIREMENT_KEYS = {
  word: 'required_words',
  phonetic: 'required_phonetics',
  phrase: 'required_phrases',
  sentence: 'required_sentences',
  paragraph: 'required_paragraphs',
};

const normalizeLevel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return LEVEL_ORDER.includes(normalized) ? normalized : 'beginner';
};

const nextLevelFor = (level) => {
  const index = LEVEL_ORDER.indexOf(normalizeLevel(level));
  if (index < 0 || index >= LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[index + 1];
};

const statusRank = (status) => {
  if (status === 'mastered_100') return 3;
  if (status === 'passed_80') return 2;
  if (status === 'in_progress') return 1;
  return 0;
};

const statusForAccuracy = (accuracy, existingStatus = 'not_started') => {
  const candidate = accuracy >= MASTERY_ACCURACY
    ? 'mastered_100'
    : accuracy >= PASS_ACCURACY
      ? 'passed_80'
      : 'in_progress';

  return statusRank(candidate) >= statusRank(existingStatus) ? candidate : existingStatus;
};

const requiredTypesFor = (requirement = {}) =>
  Object.entries(TYPE_REQUIREMENT_KEYS)
    .filter(([, key]) => Number(requirement[key] || 0) > 0)
    .map(([type]) => type);

export async function getCurrentStudentForUser(userId) {
  return resolveStudent(userId);
}

export async function getCurriculumRequirements() {
  const { data, error } = await supabase
    .from('curriculum_level_requirements')
    .select('*');

  if (error) throw error;

  return new Map((data || []).map((row) => [row.reading_level, row]));
}

export async function getStudentCurriculumSummary(studentId) {
  const student = await resolveStudent(studentId);
  if (!student) {
    return { student: null, summary: null };
  }

  const requirementsByLevel = await getCurriculumRequirements();
  const level = normalizeLevel(student.reading_level);
  const requirement = requirementsByLevel.get(level) || {};
  const requiredTypes = requiredTypesFor(requirement);

  const { data: items, error: itemsError } = await supabase
    .from('curriculum_items')
    .select('id,item_type,reading_level,sequence_no')
    .eq('reading_level', level)
    .in('item_type', requiredTypes.length ? requiredTypes : ['word'])
    .eq('is_active', true)
    .order('sequence_no', { ascending: true });

  if (itemsError) throw itemsError;

  const itemIds = (items || []).map((item) => item.id);
  const { data: progressRows, error: progressError } = itemIds.length
    ? await supabase
        .from('curriculum_progress')
        .select('*')
        .eq('student_id', student.id)
        .in('curriculum_item_id', itemIds)
    : { data: [], error: null };

  if (progressError) throw progressError;

  const progressByItem = new Map((progressRows || []).map((row) => [row.curriculum_item_id, row]));
  const counts = {};

  requiredTypes.forEach((type) => {
    const typeItems = (items || []).filter((item) => item.item_type === type);
    const passed = typeItems.filter((item) => PASSED_STATUSES.has(progressByItem.get(item.id)?.status)).length;
    const mastered = typeItems.filter((item) => progressByItem.get(item.id)?.status === 'mastered_100').length;
    counts[type] = {
      required: Number(requirement[TYPE_REQUIREMENT_KEYS[type]] || 0),
      available: typeItems.length,
      passed,
      mastered,
      complete: passed >= Number(requirement[TYPE_REQUIREMENT_KEYS[type]] || 0),
    };
  });

  const readyForNextLevel = requiredTypes.length > 0 && requiredTypes.every((type) => counts[type]?.complete);

  return {
    student,
    summary: {
      level,
      nextLevel: readyForNextLevel ? nextLevelFor(level) : null,
      readyForNextLevel,
      completedProgram: readyForNextLevel && level === 'advanced',
      counts,
    },
  };
}

export async function getNextCurriculumItemForStudent(req, studentIdOrUserId) {
  const { student, allowed } = await authorizeStudent(req, studentIdOrUserId);
  if (!student) return { status: 404, body: { success: false, message: 'Student not found' } };
  if (!allowed) return { status: 403, body: { success: false, message: 'You do not have permission to access this student curriculum' } };

  const { summary } = await getStudentCurriculumSummary(student.id);
  const requirement = (await getCurriculumRequirements()).get(summary.level) || {};
  const requiredTypes = requiredTypesFor(requirement);

  const { modules } = await getStudentModulesForLevel(student.id, summary.level);
  if (modules.length > 0) {
    const activeModule = modules.find((module) =>
      ['unlocked', 'in_progress'].includes(module.status)
    );
    const nextModuleItem = activeModule?.items.find((item) => !item.passed) || null;

    if (nextModuleItem) {
      const { data: item, error: itemError } = await supabase
        .from('curriculum_items')
        .select('*')
        .eq('id', nextModuleItem.id)
        .eq('is_active', true)
        .maybeSingle();

      if (itemError) throw itemError;

      return {
        status: 200,
        body: {
          success: true,
          studentId: student.id,
          item,
          progress: nextModuleItem.progress || null,
          module: activeModule,
          summary,
        },
      };
    }

    const assessmentReadyModule = modules.find((module) => module.status === 'assessment_ready');
    if (assessmentReadyModule) {
      return {
        status: 200,
        body: {
          success: true,
          studentId: student.id,
          item: null,
          progress: null,
          module: assessmentReadyModule,
          summary,
          message: 'Module assessment is ready before the next module unlocks.',
        },
      };
    }
  }

  const { data: items, error: itemsError } = await supabase
    .from('curriculum_items')
    .select('*')
    .eq('reading_level', summary.level)
    .in('item_type', requiredTypes.length ? requiredTypes : ['word'])
    .eq('is_active', true)
    .order('sequence_no', { ascending: true });

  if (itemsError) throw itemsError;

  const itemIds = (items || []).map((item) => item.id);
  const { data: progressRows, error: progressError } = itemIds.length
    ? await supabase
        .from('curriculum_progress')
        .select('*')
        .eq('student_id', student.id)
        .in('curriculum_item_id', itemIds)
    : { data: [], error: null };

  if (progressError) throw progressError;

  const progressByItem = new Map((progressRows || []).map((row) => [row.curriculum_item_id, row]));
  const item = (items || []).find((candidate) => !PASSED_STATUSES.has(progressByItem.get(candidate.id)?.status)) || null;

  return {
    status: 200,
    body: {
      success: true,
      studentId: student.id,
      item,
      progress: item ? progressByItem.get(item.id) || null : null,
      summary,
    },
  };
}

export async function recordCurriculumAttemptForStudent(req, { curriculumItemId, spokenText }) {
  const student = await getCurrentStudentForUser(req.user.id);
  if (!student) return { status: 404, body: { success: false, message: 'Student profile not found' } };

  const { data: item, error: itemError } = await supabase
    .from('curriculum_items')
    .select('*')
    .eq('id', curriculumItemId)
    .eq('is_active', true)
    .maybeSingle();

  if (itemError) throw itemError;
  if (!item) return { status: 404, body: { success: false, message: 'Curriculum item not found' } };

  const moduleGate = await assertStudentCanAttemptModuleItem(student.id, item.id);
  if (!moduleGate.allowed) {
    return {
      status: moduleGate.status || 403,
      body: { success: false, message: moduleGate.message || 'This module item is locked' },
    };
  }

  const expectedText = item.content;
  const result = compareReadingText(expectedText, spokenText);
  const accuracy = Number(result.accuracyScore || 0);
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await supabase
    .from('curriculum_progress')
    .select('*')
    .eq('student_id', student.id)
    .eq('curriculum_item_id', item.id)
    .maybeSingle();

  if (existingError) throw existingError;

  const nextStatus = statusForAccuracy(accuracy, existing?.status);
  const nextBestAccuracy = Math.max(Number(existing?.best_accuracy || 0), accuracy);
  const payload = {
    student_id: student.id,
    curriculum_item_id: item.id,
    status: nextStatus,
    best_accuracy: nextBestAccuracy,
    attempts_count: Number(existing?.attempts_count || 0) + 1,
    passed_at: existing?.passed_at || (accuracy >= PASS_ACCURACY ? now : null),
    mastered_at: existing?.mastered_at || (accuracy >= MASTERY_ACCURACY ? now : null),
    last_attempt_at: now,
    updated_at: now,
  };

  const { data: progress, error: upsertError } = await supabase
    .from('curriculum_progress')
    .upsert(existing ? payload : { ...payload, created_at: now }, { onConflict: 'student_id,curriculum_item_id' })
    .select()
    .single();

  if (upsertError) throw upsertError;

  const previousHistory = Array.isArray(student.history) ? student.history : [];
  const previousTotalAttempts = Number(student.total_attempts || previousHistory.length || 0);
  const previousAccuracySum = Number(
    student.accuracy_sum ||
    previousHistory.reduce((sum, entry) => sum + (Number(entry?.score ?? entry?.accuracy ?? entry?.accuracy_percentage ?? 0) || 0), 0)
  );
  const nextHistory = [
    ...previousHistory,
    {
      word: expectedText,
      spoken: spokenText,
      score: accuracy,
      correct: accuracy >= PASS_ACCURACY,
      activityType: 'curriculum_practice',
      timestamp: Date.now(),
    },
  ].slice(-200);

  const { error: statsError } = await supabase
    .from('students')
    .update({
      history: nextHistory,
      total_attempts: previousTotalAttempts + 1,
      accuracy_sum: previousAccuracySum + accuracy,
      baseline_accuracy: student.baseline_accuracy ?? (previousTotalAttempts === 0 ? accuracy : null),
      activities_completed: Number(student.activities_completed || student.completed || 0) + 1,
      completed: Number(student.completed || 0) + 1,
      accuracy: Math.round((previousAccuracySum + accuracy) / (previousTotalAttempts + 1)),
      last_practice_date: now,
      updated_at: now,
    })
    .eq('id', student.id);

  if (statsError) throw statsError;

  if (item.item_type === 'word') {
    await recordWordOutcome(student.id, item.content, {
      pronunciationScore: accuracy,
      phonemeAccuracy: result.phonemeAccuracy,
      syllableAccuracy: result.syllableAccuracy,
      confusions: result.confusionTags || [],
    }).catch((error) => console.warn('[Curriculum] word mastery update failed:', error.message));
  }

  const moduleProgress = await syncModuleProgressForItem(student.id, item.id);
  const { summary } = await getStudentCurriculumSummary(student.id);
  let updatedLevel = student.reading_level;
  const moduleAdvance = summary.readyForNextLevel
    ? await canStudentAdvanceFromLevel(student.id, summary.level)
    : { canAdvance: false };
  if (
    summary.readyForNextLevel &&
    moduleAdvance.canAdvance &&
    summary.nextLevel &&
    normalizeLevel(student.reading_level) === summary.level
  ) {
    const { error: levelError } = await supabase
      .from('students')
      .update({ reading_level: summary.nextLevel, updated_at: now })
      .eq('id', student.id);
    if (levelError) throw levelError;
    updatedLevel = summary.nextLevel;
  }

  const studentStats = await getStudentStats(student.id);

  return {
    status: 201,
    body: {
      success: true,
      item,
      result,
      progress,
      passUnlocked: accuracy >= PASS_ACCURACY,
      masteryUnlocked: accuracy >= MASTERY_ACCURACY,
      moduleProgress,
      summary: {
        ...summary,
        updatedLevel,
        moduleGate: {
          finalModuleCompleted: moduleAdvance.finalModuleCompleted ?? false,
          requirementsMet: moduleAdvance.requirementsMet ?? summary.readyForNextLevel,
        },
      },
      studentStats,
    },
  };
}

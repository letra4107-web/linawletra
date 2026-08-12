import { supabase } from '../config/supabase.js';
import { compareReadingText } from './readingAccuracy.js';
import { resolveStudent } from '../utils/studentAccess.js';

const PASSED_STATUSES = new Set(['passed_80', 'mastered_100']);
const PASS_ACCURACY = 80;
const LEVEL_ORDER = ['beginner', 'intermediate', 'advanced'];

const TYPE_REQUIREMENT_KEYS = {
  word: 'required_words',
  phonetic: 'required_phonetics',
  phrase: 'required_phrases',
  sentence: 'required_sentences',
  paragraph: 'required_paragraphs',
};

const LEVEL_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const normalizeLevel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['beginner', 'intermediate', 'advanced'].includes(normalized) ? normalized : 'beginner';
};

const nextLevelFor = (level) => {
  const index = LEVEL_ORDER.indexOf(normalizeLevel(level));
  if (index < 0 || index >= LEVEL_ORDER.length - 1) return null;
  return LEVEL_ORDER[index + 1];
};

const requiredTypesFor = (requirement = {}) =>
  Object.entries(TYPE_REQUIREMENT_KEYS)
    .filter(([, key]) => Number(requirement[key] || 0) > 0)
    .map(([type]) => type);

const normalizeModuleStatus = (status) =>
  ['locked', 'unlocked', 'in_progress', 'assessment_ready', 'completed'].includes(status) ? status : 'unlocked';

const toDisplayText = (item = {}) => item.display_text || item.syllable_hyphenation || item.content || '';

const getCurrentStudent = async (req) => {
  const student = await resolveStudent(req.user.id);
  if (!student) {
    return { status: 404, body: { success: false, message: 'Student profile not found' } };
  }
  if (req.user.role !== 'student') {
    return { status: 403, body: { success: false, message: 'Only students can change module progress' } };
  }
  return { student };
};

const fetchModulesWithItems = async (level) => {
  const { data: modules, error: modulesError } = await supabase
    .from('curriculum_modules')
    .select('*')
    .eq('reading_level', level)
    .eq('is_active', true)
    .order('sequence_no', { ascending: true });

  if (modulesError) throw modulesError;
  if (!modules?.length) return [];

  const moduleIds = modules.map((module) => module.id);
  const { data: links, error: linksError } = await supabase
    .from('curriculum_module_items')
    .select('*')
    .in('module_id', moduleIds)
    .order('sequence_no', { ascending: true });

  if (linksError) throw linksError;

  const itemIds = [...new Set((links || []).map((link) => link.curriculum_item_id))];
  const { data: items, error: itemsError } = itemIds.length
    ? await supabase.from('curriculum_items').select('*').in('id', itemIds).eq('is_active', true)
    : { data: [], error: null };

  if (itemsError) throw itemsError;

  const itemsById = new Map((items || []).map((item) => [item.id, item]));

  return modules.map((module) => ({
    ...module,
    items: (links || [])
      .filter((link) => link.module_id === module.id)
      .map((link) => ({
        ...link,
        curriculum_item: itemsById.get(link.curriculum_item_id),
      }))
      .filter((link) => link.curriculum_item),
  }));
};

const fetchStudentRows = async (studentId, modules) => {
  const moduleIds = modules.map((module) => module.id);
  const itemIds = [...new Set(modules.flatMap((module) => module.items.map((link) => link.curriculum_item_id)))];

  const { data: moduleProgress, error: moduleProgressError } = moduleIds.length
    ? await supabase.from('student_module_progress').select('*').eq('student_id', studentId).in('module_id', moduleIds)
    : { data: [], error: null };
  if (moduleProgressError) throw moduleProgressError;

  const { data: itemProgress, error: itemProgressError } = itemIds.length
    ? await supabase.from('curriculum_progress').select('*').eq('student_id', studentId).in('curriculum_item_id', itemIds)
    : { data: [], error: null };
  if (itemProgressError) throw itemProgressError;

  return {
    moduleProgressById: new Map((moduleProgress || []).map((row) => [row.module_id, row])),
    itemProgressById: new Map((itemProgress || []).map((row) => [row.curriculum_item_id, row])),
  };
};

const typeLabelFor = (contentType) => ({
  phonetic: 'Phonetics',
  word: 'Words',
  phrase: 'Phrases',
  sentence: 'Sentences',
  paragraph: 'Reading',
}[contentType] || contentType);

const getModuleLevel = async (moduleId) => {
  const { data, error } = await supabase
    .from('curriculum_modules')
    .select('reading_level')
    .eq('id', moduleId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  return data?.reading_level || null;
};

const getLevelRequirementStatus = async (studentId, levelValue) => {
  const level = normalizeLevel(levelValue);
  const { data: requirement, error: requirementError } = await supabase
    .from('curriculum_level_requirements')
    .select('*')
    .eq('reading_level', level)
    .maybeSingle();

  if (requirementError) throw requirementError;
  const requiredTypes = requiredTypesFor(requirement || {});
  if (!requiredTypes.length) return { met: true, counts: {} };

  const { data: items, error: itemsError } = await supabase
    .from('curriculum_items')
    .select('id,item_type')
    .eq('reading_level', level)
    .in('item_type', requiredTypes)
    .eq('is_active', true);

  if (itemsError) throw itemsError;

  const itemIds = (items || []).map((item) => item.id);
  const { data: progressRows, error: progressError } = itemIds.length
    ? await supabase
        .from('curriculum_progress')
        .select('curriculum_item_id,status')
        .eq('student_id', studentId)
        .in('curriculum_item_id', itemIds)
    : { data: [], error: null };

  if (progressError) throw progressError;

  const progressByItem = new Map((progressRows || []).map((row) => [row.curriculum_item_id, row]));
  const counts = {};
  requiredTypes.forEach((type) => {
    const required = Number(requirement?.[TYPE_REQUIREMENT_KEYS[type]] || 0);
    const typeItems = (items || []).filter((item) => item.item_type === type);
    const passed = typeItems.filter((item) => PASSED_STATUSES.has(progressByItem.get(item.id)?.status)).length;
    counts[type] = {
      required,
      available: typeItems.length,
      passed,
      met: passed >= required,
    };
  });

  return {
    met: requiredTypes.every((type) => counts[type]?.met),
    counts,
  };
};

const isFinalRequiredModuleCompleted = async (studentId, levelValue) => {
  const level = normalizeLevel(levelValue);
  const { data: finalModule, error: moduleError } = await supabase
    .from('curriculum_modules')
    .select('id')
    .eq('reading_level', level)
    .eq('is_active', true)
    .eq('required', true)
    .order('sequence_no', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (moduleError) throw moduleError;
  if (!finalModule) return true;

  const { data: progress, error: progressError } = await supabase
    .from('student_module_progress')
    .select('status,assessment_passed')
    .eq('student_id', studentId)
    .eq('module_id', finalModule.id)
    .maybeSingle();

  if (progressError) throw progressError;
  return progress?.status === 'completed' && Boolean(progress?.assessment_passed);
};

export async function canStudentAdvanceFromLevel(studentId, levelValue) {
  const level = normalizeLevel(levelValue);
  const requirementStatus = await getLevelRequirementStatus(studentId, level);
  const finalModuleCompleted = await isFinalRequiredModuleCompleted(studentId, level);
  return {
    canAdvance: requirementStatus.met && finalModuleCompleted,
    requirementsMet: requirementStatus.met,
    finalModuleCompleted,
    nextLevel: nextLevelFor(level),
    counts: requirementStatus.counts,
  };
}

const isLevelUnlockedForStudent = async (studentId, targetLevelValue) => {
  const targetLevel = normalizeLevel(targetLevelValue);
  const targetIndex = LEVEL_ORDER.indexOf(targetLevel);
  if (targetIndex <= 0) return { unlocked: true };

  for (const previousLevel of LEVEL_ORDER.slice(0, targetIndex)) {
    const advanceStatus = await canStudentAdvanceFromLevel(studentId, previousLevel);
    if (!advanceStatus.canAdvance) {
      return {
        unlocked: false,
        blockedByLevel: previousLevel,
        requirementsMet: advanceStatus.requirementsMet,
        finalModuleCompleted: advanceStatus.finalModuleCompleted,
      };
    }
  }

  return { unlocked: true };
};

const computeModuleView = (module, index, previousModule, rows, options = {}) => {
  const row = rows.moduleProgressById.get(module.id);
  const unlockedBySequence = index === 0 || previousModule?.status === 'completed';
  const moduleItems = module.items.map((link) => {
    const progress = rows.itemProgressById.get(link.curriculum_item_id) || null;
    return {
      id: link.curriculum_item_id,
      moduleItemId: link.id,
      sequenceNo: link.sequence_no,
      practiceSetNumber: link.practice_set_number,
      kind: link.module_item_kind,
      required: link.required,
      content: link.curriculum_item.content,
      displayText: toDisplayText(link.curriculum_item),
      itemType: link.curriculum_item.item_type,
      definition: link.curriculum_item.definition,
      syllableHyphenation: link.curriculum_item.syllable_hyphenation,
      progress,
      passed: PASSED_STATUSES.has(progress?.status),
      mastered: progress?.status === 'mastered_100',
    };
  });

  const requiredItems = moduleItems.filter((item) => item.required !== false);
  const passedRequired = requiredItems.filter((item) => item.passed).length;
  const itemProgressPercent = requiredItems.length
    ? Math.round((passedRequired / requiredItems.length) * 100)
    : 0;
  const assessmentPassed = Boolean(row?.assessment_passed);
  const computedStatus = options.forceLocked
    ? 'locked'
    : !unlockedBySequence
    ? 'locked'
    : assessmentPassed
      ? 'completed'
      : itemProgressPercent >= 100
        ? 'assessment_ready'
        : itemProgressPercent > 0
          ? 'in_progress'
          : 'unlocked';

  return {
    id: module.id,
    readingLevel: module.reading_level,
    level: LEVEL_LABELS[module.reading_level] || module.reading_level,
    moduleNumber: module.module_number,
    number: module.module_number,
    title: module.title,
    description: module.description,
    subtitle: module.description,
    contentType: module.content_type,
    type: typeLabelFor(module.content_type),
    required: module.required,
    assessmentId: module.assessment_id,
    passingScore: Number(module.passing_score || PASS_ACCURACY),
    accent: module.metadata?.accent || ['violet', 'green', 'sun', 'blue', 'coral'][index % 5],
    status: computedStatus,
    progress: assessmentPassed ? 100 : itemProgressPercent,
    assessmentScore: row?.assessment_score ?? null,
    assessmentPassed,
    completedAt: row?.completed_at || null,
    items: moduleItems,
    helper: options.lockedReason || (computedStatus === 'locked'
      ? `Complete Module ${module.module_number - 1} first`
      : computedStatus === 'completed'
        ? 'Completed'
        : computedStatus === 'assessment_ready'
          ? 'Assessment ready'
          : computedStatus === 'in_progress'
            ? `${itemProgressPercent}% complete`
            : 'Ready to start'),
  };
};

export async function getStudentModulesForLevel(studentIdOrUserId, levelValue = 'beginner') {
  const student = await resolveStudent(studentIdOrUserId);
  if (!student) return { student: null, modules: [] };

  const level = normalizeLevel(levelValue);
  const modules = await fetchModulesWithItems(level);
  const rows = await fetchStudentRows(student.id, modules);
  const levelUnlock = await isLevelUnlockedForStudent(student.id, level);
  const lockedReason = levelUnlock.unlocked
    ? null
    : levelUnlock.requirementsMet
      ? `Pass the final ${LEVEL_LABELS[levelUnlock.blockedByLevel]} module assessment first`
      : `Complete ${LEVEL_LABELS[levelUnlock.blockedByLevel]} level requirements first`;

  const views = [];
  modules.forEach((module, index) => {
    views.push(computeModuleView(module, index, views[index - 1], rows, {
      forceLocked: !levelUnlock.unlocked,
      lockedReason,
    }));
  });

  return { student, modules: views };
}

export async function getStudentModules(req, levelValue = 'beginner') {
  const studentResult = await getCurrentStudent(req);
  if (!studentResult.student) return studentResult;
  const { modules } = await getStudentModulesForLevel(studentResult.student.id, levelValue);
  return { status: 200, body: { success: true, studentId: studentResult.student.id, modules } };
}

export async function getStudentModuleDetail(req, moduleId) {
  const studentResult = await getCurrentStudent(req);
  if (!studentResult.student) return studentResult;

  const level = await getModuleLevel(moduleId);
  if (!level) return { status: 404, body: { success: false, message: 'Module not found' } };
  const { modules } = await getStudentModulesForLevel(studentResult.student.id, level);
  const module = modules.find((item) => item.id === moduleId);
  if (!module) return { status: 404, body: { success: false, message: 'Module not found' } };
  if (module.status === 'locked') return { status: 403, body: { success: false, message: 'This module is locked' } };

  return { status: 200, body: { success: true, module } };
}

export async function assertStudentCanAttemptModuleItem(studentId, curriculumItemId) {
  const student = await resolveStudent(studentId);
  if (!student) return { allowed: false, status: 404, message: 'Student profile not found' };

  const { data: item, error: itemError } = await supabase
    .from('curriculum_items')
    .select('reading_level')
    .eq('id', curriculumItemId)
    .eq('is_active', true)
    .maybeSingle();

  if (itemError) throw itemError;
  if (!item) return { allowed: false, status: 404, message: 'Curriculum item not found' };

  const { modules } = await getStudentModulesForLevel(student.id, item.reading_level);
  const module = modules.find((candidate) => candidate.items.some((item) => item.id === curriculumItemId));
  if (!module) return { allowed: true, module: null };
  if (module.status === 'locked') {
    return { allowed: false, status: 403, message: 'Complete the previous module before practicing this item' };
  }
  return { allowed: true, module };
}

export async function syncModuleProgressForItem(studentId, curriculumItemId) {
  const student = await resolveStudent(studentId);
  if (!student) return null;
  const { data: item, error: itemError } = await supabase
    .from('curriculum_items')
    .select('reading_level')
    .eq('id', curriculumItemId)
    .eq('is_active', true)
    .maybeSingle();

  if (itemError) throw itemError;
  if (!item) return null;

  const { modules } = await getStudentModulesForLevel(student.id, item.reading_level);
  const module = modules.find((candidate) => candidate.items.some((item) => item.id === curriculumItemId));
  if (!module || module.status === 'locked' || module.assessmentPassed) return module || null;

  const nextStatus = module.progress >= 100 ? 'assessment_ready' : module.progress > 0 ? 'in_progress' : 'unlocked';
  const now = new Date().toISOString();
  await supabase
    .from('student_module_progress')
    .upsert({
      student_id: student.id,
      module_id: module.id,
      status: nextStatus,
      progress: module.progress,
      assessment_passed: false,
      last_activity_at: now,
      updated_at: now,
    }, { onConflict: 'student_id,module_id' });

  return module;
}

export async function submitModuleAssessment(req, moduleId) {
  const studentResult = await getCurrentStudent(req);
  if (!studentResult.student) return studentResult;

  const level = await getModuleLevel(moduleId);
  if (!level) return { status: 404, body: { success: false, message: 'Module not found' } };
  const { modules } = await getStudentModulesForLevel(studentResult.student.id, level);
  const module = modules.find((item) => item.id === moduleId);
  if (!module) return { status: 404, body: { success: false, message: 'Module not found' } };
  if (module.status === 'locked') return { status: 403, body: { success: false, message: 'This module is locked' } };
  if (module.assessmentPassed) {
    return {
      status: 200,
      body: {
        success: true,
        assessment: {
          moduleId: module.id,
          moduleNumber: module.moduleNumber,
          title: module.title,
          score: Number(module.assessmentScore || module.passingScore || PASS_ACCURACY),
          passed: true,
          items: module.items.map((item) => item.displayText),
        },
        progress: {
          student_id: studentResult.student.id,
          module_id: module.id,
          status: 'completed',
          progress: 100,
          assessment_score: module.assessmentScore,
          assessment_passed: true,
          completed_at: module.completedAt,
        },
        modules,
      },
    };
  }

  const attempts = Array.isArray(req.body?.attempts) ? req.body.attempts : [];
  let score = 0;

  if (attempts.length) {
    const allowedItemIds = new Set(module.items.map((item) => item.id));
    const scored = attempts
      .filter((attempt) => allowedItemIds.has(attempt.curriculumItemId))
      .map((attempt) => {
        const item = module.items.find((candidate) => candidate.id === attempt.curriculumItemId);
        return compareReadingText(item?.content || '', attempt.spokenText || '').accuracyScore || 0;
      });
    score = scored.length ? Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length) : 0;
  } else {
    const bestScores = module.items.map((item) => Number(item.progress?.best_accuracy || 0));
    const allPassed = module.items.length > 0 && module.items.every((item) => item.passed);
    score = allPassed && bestScores.length
      ? Math.round(bestScores.reduce((sum, value) => sum + value, 0) / bestScores.length)
      : 0;
  }

  const passingScore = Number(module.passingScore || PASS_ACCURACY);
  const passed = score >= passingScore && module.items.length > 0 && module.items.every((item) => item.passed);
  const now = new Date().toISOString();
  const { data: progress, error } = await supabase
    .from('student_module_progress')
    .upsert({
      student_id: studentResult.student.id,
      module_id: module.id,
      status: passed ? 'completed' : module.progress >= 100 ? 'assessment_ready' : 'in_progress',
      progress: passed ? 100 : module.progress,
      assessment_score: score,
      assessment_passed: passed,
      completed_at: passed ? now : null,
      last_activity_at: now,
      updated_at: now,
    }, { onConflict: 'student_id,module_id' })
    .select()
    .single();

  if (error) throw error;

  let updatedLevel = normalizeLevel(studentResult.student.reading_level);
  if (passed) {
    const advanceStatus = await canStudentAdvanceFromLevel(studentResult.student.id, level);
    if (advanceStatus.canAdvance && advanceStatus.nextLevel && updatedLevel === level) {
      const { error: levelError } = await supabase
        .from('students')
        .update({ reading_level: advanceStatus.nextLevel, updated_at: now })
        .eq('id', studentResult.student.id);
      if (levelError) throw levelError;
      updatedLevel = advanceStatus.nextLevel;
    }
  }

  const refreshed = await getStudentModulesForLevel(studentResult.student.id, level);
  return {
    status: 200,
    body: {
      success: true,
      assessment: {
        moduleId: module.id,
        moduleNumber: module.moduleNumber,
        title: module.title,
        score,
        passed,
        items: module.items.map((item) => item.displayText),
      },
      progress,
      updatedLevel,
      modules: refreshed.modules,
    },
  };
}

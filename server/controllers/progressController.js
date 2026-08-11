import Progress from '../models/Progress.js';
import { supabase } from '../config/supabase.js';
import { authorizeStudent, getVisibleStudentIds } from '../utils/studentAccess.js';

async function assertParentOwnsStudent(req, studentId) {
  const { allowed } = await authorizeStudent(req, studentId);
  return allowed;
}

const normalizeLessonStatus = (status) => {
  const value = String(status || '').trim().toLowerCase();
  return ['not-started', 'in-progress', 'completed'].includes(value) ? value : null;
};

const attachStudentInfo = async (progressRows = []) => {
  const studentIds = [...new Set((progressRows || []).map((item) => item.studentId || item.student_id).filter(Boolean))];
  if (!studentIds.length) return progressRows;

  const { data: students } = await supabase
    .from('students')
    .select('id,user_id,grade_level,reading_level')
    .in('id', studentIds);

  const userIds = [...new Set((students || []).map((student) => student.user_id).filter(Boolean))];
  const { data: users } = userIds.length
    ? await supabase.from('users').select('id,name,email,metadata').in('id', userIds)
    : { data: [] };

  const usersById = new Map((users || []).map((user) => [user.id, user]));
  const studentsById = new Map((students || []).map((student) => [student.id, student]));

  return progressRows.map((row) => {
    const studentId = row.studentId || row.student_id;
    const student = studentsById.get(studentId);
    const user = student ? usersById.get(student.user_id) : null;
    const score = row.score ?? row.percentageComplete ?? row.percentage_complete ?? 0;
    return {
      ...row,
      studentName: user?.name || user?.metadata?.displayName || user?.email || 'Student',
      grade: student?.grade_level || '',
      date: row.updatedAt || row.updated_at || row.createdAt || row.created_at,
      overallScore: score,
      trend: score >= 80 ? 'up' : score >= 60 ? 'stable' : 'down',
      categories: row.categories || {
        Reading: score,
        Completion: row.percentageComplete ?? row.percentage_complete ?? score,
      },
    };
  });
};

// Create or get progress
export const createOrGetProgress =async (req, res) => {
  try {
    const { studentId, lessonId } = req.body;

    if (!(await assertParentOwnsStudent(req, studentId))) {
      return res.status(403).json({ message: 'You do not have permission to access this student progress' });
    }

    let progress = await Progress.findOne({ studentId, lessonId });

    if (!progress) {
      progress = new Progress({
        studentId,
        lessonId,
        status: 'not-started',
      });
      await progress.save();
    }

    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update progress
export const updateProgress =async (req, res) => {
  try {
    const { progressId } = req.params;
    const { status, score, percentageComplete, timeSpent, feedback } = req.body;

    const existing = await Progress.findById(progressId).select('studentId');
    if (!existing) return res.status(404).json({ message: 'Progress not found' });

    if (!(await assertParentOwnsStudent(req, existing.studentId))) {
      return res.status(403).json({ message: 'You do not have permission to update this progress' });
    }

    const requestedStatus = normalizeLessonStatus(status);
    if (status !== undefined && !requestedStatus) {
      return res.status(422).json({ message: 'Invalid progress status' });
    }

    const isStudentSelfUpdate = req.user.role === 'student';
    const safeStudentUpdate = requestedStatus
      ? {
          status: requestedStatus,
          percentageComplete: requestedStatus === 'completed'
            ? 100
            : Math.max(0, Number(existing.percentageComplete || 0)),
          feedback: requestedStatus === 'completed' ? 'Lesson completed.' : existing.feedback,
          updatedAt: Date.now(),
          ...(requestedStatus === 'completed' && { completedAt: Date.now() }),
        }
      : {
          status: existing.status || 'in-progress',
          updatedAt: Date.now(),
        };

    const progress = await Progress.findByIdAndUpdate(
      progressId,
      isStudentSelfUpdate
        ? safeStudentUpdate
        : {
            status: requestedStatus || status,
            score,
            percentageComplete,
            timeSpent,
            feedback,
            updatedAt: Date.now(),
            ...(requestedStatus === 'completed' && { completedAt: Date.now() }),
          },
      { new: true }
    );

    if (!progress) {
      return res.status(404).json({ message: 'Progress not found' });
    }

    res.json({ message: 'Progress updated', progress });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get progress by student
export const getProgressByStudent =async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!(await assertParentOwnsStudent(req, studentId))) {
      return res.status(403).json({ message: 'You do not have permission to access this student progress' });
    }

    const progress = await Progress.find({ studentId })
      .populate('lessonId', 'title category level')
      .sort({ createdAt: -1 });

    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get dashboard data
export const getDashboardData =async (req, res) => {
  try {
    const { studentId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const { data: student, error } = await supabase
      .from('students')
      .select('*')
      .or(`id.eq.${studentId},user_id.eq.${studentId}`)
      .single();

    if (error || !student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const isOwnStudent = student.user_id === userId;
    const isParent = userRole === 'parent' && student.parent_id === userId;
    const isTeacher = userRole === 'teacher' && student.teacher_id === userId;
    const isAdmin = userRole === 'admin';

    if (!isOwnStudent && !isParent && !isTeacher && !isAdmin) {
      return res.status(403).json({ message: 'You do not have permission to access this student dashboard data' });
    }

    const { data: masteryRows } = await supabase
      .from('word_mastery')
      .select('word, mastery_status, avg_phoneme_accuracy, avg_syllable_accuracy, last_attempt_at')
      .eq('student_id', student.id);
    const mastered = (masteryRows || []).filter((w) => w.mastery_status === 'mastered');
    const needsPractice = (masteryRows || []).filter((w) => w.mastery_status === 'needs_practice');
    const difficult = (masteryRows || []).filter((w) => w.mastery_status === 'difficult');
    const phonemeAccuracy = masteryRows?.length
      ? Math.round(masteryRows.reduce((sum, w) => sum + (w.avg_phoneme_accuracy || 0), 0) / masteryRows.length)
      : null;

    const { data: confusionRows } = await supabase
      .from('confusion_patterns')
      .select('pattern_type, occurrence_count')
      .eq('student_id', student.id)
      .order('occurrence_count', { ascending: false })
      .limit(5);

    const { data: lessonProgressRows } = await supabase
      .from('lesson_progress')
      .select('*')
      .in('student_id', [student.id, student.user_id].filter(Boolean));

    const history = Array.isArray(student.history) ? student.history : [];
    const totalAttempts = Number(student.total_attempts || history.length || 0);
    const accuracySum = Number(
      student.accuracy_sum ||
      history.reduce((sum, entry) => sum + (Number(entry?.score ?? entry?.accuracy ?? entry?.accuracy_percentage ?? 0) || 0), 0)
    );
    const activitiesCompleted = (lessonProgressRows || []).filter((row) =>
      String(row.status || '').toLowerCase().includes('completed')
    ).length;
    const recentActivities = [
      ...(lessonProgressRows || [])
        .sort((a, b) => {
          const aTime = new Date(a.completed_at || a.completedAt || a.updated_at || a.updatedAt || a.created_at || a.createdAt || 0).getTime();
          const bTime = new Date(b.completed_at || b.completedAt || b.updated_at || b.updatedAt || b.created_at || b.createdAt || 0).getTime();
          return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
        })
        .slice(0, 5)
        .map((row) => ({
        id: row.id,
        lessonTitle: row.lesson_title || row.lessonTitle || row.title || 'Lesson',
        status: row.status || 'completed',
        score: row.score,
        timeSpent: row.time_spent || row.timeSpent || row.duration,
        completedAt: row.completed_at || row.completedAt || row.updated_at || row.updatedAt || row.created_at || row.createdAt,
        activityType: 'lesson',
      })),
      ...history.slice(-10).map((entry) => ({
        ...entry,
        lessonTitle: entry.word || entry.target || 'Reading practice',
        status: entry.correct ? 'completed' : 'practice',
        completedAt: entry.timestamp || entry.created_at || entry.createdAt || entry.date,
        activityType: entry.activityType || 'pronunciation_practice',
      })),
    ].sort((a, b) => {
      const aTime = new Date(a.completedAt || a.timestamp || 0).getTime();
      const bTime = new Date(b.completedAt || b.timestamp || 0).getTime();
      return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    }).slice(0, 8);

    res.json({
      wordMastery: { mastered: mastered.length, needsPractice: needsPractice.length, difficult: difficult.length },
      phonemeAccuracy,
      topConfusions: confusionRows || [],
      recommendedPracticeWords: [...needsPractice, ...difficult]
        .sort((a, b) => new Date(b.last_attempt_at || 0) - new Date(a.last_attempt_at || 0))
        .slice(0, 5)
        .map((w) => w.word),
      xp: student.xp ?? 0,
      streak: student.streak ?? 0,
      longestStreak: student.longest_streak ?? student.streak ?? 0,
      lastLoginDate: student.last_login_date ?? null,
      lastPracticeDate: student.last_practice_date ?? student.last_login_date ?? null,
      wordsCompleted: student.words_completed ?? 0,
      completedWords: student.completed_words ?? [],
      achievements: Array.isArray(student.unlocked_achievement_ids) ? student.unlocked_achievement_ids.length : (student.achievements ?? 0),
      accuracy: totalAttempts > 0 ? Math.round(accuracySum / totalAttempts) : (student.accuracy ?? 0),
      completed: activitiesCompleted || student.completed || 0,
      activitiesCompleted: activitiesCompleted || student.completed || 0,
      lessonsCompleted: activitiesCompleted || student.completed || 0,
      totalAttempts,
      accuracySum,
      baselineAccuracy: student.baseline_accuracy ?? null,
      history,
      recentActivities,
      currentPhoneticLevel: student.current_phonetic_level ?? 'Easy',
      progressInCurrentLevel: student.progress_in_level ?? 0,
      highestPhoneticLevel: student.highest_phonetic_level ?? 'Easy',
      hardCyclesCompleted: student.hard_cycles_completed ?? 0,
      hadStreakBreak: student.had_streak_break ?? false,
      unlockedAchievementIds: student.unlocked_achievement_ids ?? [],
      totalLessons: 7,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getProgressReports =async (req, res) => {
  try {
    const visibleStudentIds = await getVisibleStudentIds(req);
    if (!visibleStudentIds.length) {
      return res.json({ reports: [] });
    }

    const progress = req.user.role === 'admin'
      ? await Progress.find({})
      : (await Promise.all(visibleStudentIds.map((studentId) => Progress.find({ studentId })))).flat();
    const reports = await attachStudentInfo(
      [...progress].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    );

    res.json({ reports });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


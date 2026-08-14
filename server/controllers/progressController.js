import Progress from '../models/Progress.js';
import { supabase } from '../config/supabase.js';
import { authorizeStudent, getVisibleStudentIds } from '../utils/studentAccess.js';
import { getManyStudentStats, getStudentStats } from '../services/studentStatsService.js';

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
    const { student, allowed, status } = await authorizeStudent(req, studentId);
    if (!student) return res.status(404).json({ message: 'Student not found' });
    if (!allowed) {
      return res.status(status || 403).json({ message: 'You do not have permission to access this student dashboard data' });
    }

    const stats = await getStudentStats(student.id);
    return res.json(stats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCanonicalStudentStats = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { student, allowed, status } = await authorizeStudent(req, studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    if (!allowed) {
      return res.status(status || 403).json({ success: false, message: 'You do not have permission to access these student statistics' });
    }

    const stats = await getStudentStats(student.id);
    return res.json({ success: true, data: stats });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getProgressReports =async (req, res) => {
  try {
    const visibleStudentIds = await getVisibleStudentIds(req);
    if (!visibleStudentIds.length) {
      return res.json({ reports: [] });
    }

    const statsRows = await getManyStudentStats(visibleStudentIds);
    const reports = statsRows.flatMap((stats) => {
      const activities = stats.recentActivities || stats.recentActivity || [];
      if (!activities.length) {
        return [{
          id: `summary-${stats.studentId}`,
          studentId: stats.studentId,
          student_id: stats.studentId,
          studentName: stats.name,
          grade: stats.gradeLevel || stats.grade || '',
          date: stats.lastActivityAt || stats.updated_at || null,
          score: stats.accuracy,
          trend: 'stable',
          categories: { summary: stats.activitiesCompleted || stats.totalAttempts || 0 },
          recentActivities: [],
        }];
      }
      return activities.map((activity, index) => ({
        id: activity.id || `${stats.studentId}-${index}`,
        studentId: stats.studentId,
        student_id: stats.studentId,
        studentName: stats.name,
        grade: stats.gradeLevel || stats.grade || '',
        date: activity.completedAt || activity.completed_at || activity.createdAt || activity.created_at || stats.lastActivityAt,
        score: activity.score ?? null,
        trend: Number(activity.score ?? stats.accuracy ?? 0) >= 80 ? 'up' : 'stable',
        categories: { [activity.activityType || activity.activity_type || 'activity']: 1 },
        lessonTitle: activity.lessonTitle || activity.lesson_name || 'Reading activity',
        activityType: activity.activityType || activity.activity_type || 'activity',
        recentActivities: [activity],
      }));
    }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    res.json({ reports });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


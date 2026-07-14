import Progress from '../models/Progress.js';
import Student from '../models/Student.js';
import { supabase } from '../config/supabase.js';

async function assertParentOwnsStudent(req, studentId) {
  if (req.user?.role !== 'parent') return;
  const student = await Student.findById(studentId).select('parentId');
  if (!student) return false;
  return student.parentId?.toString() === req.user.id;
}

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

    const progress = await Progress.findByIdAndUpdate(
      progressId,
      {
        status,
        score,
        percentageComplete,
        timeSpent,
        feedback,
        updatedAt: Date.now(),
        ...(status === 'completed' && { completedAt: Date.now() }),
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

    if (!(await assertParentOwnsStudent(req, studentId))) {
      return res.status(403).json({ message: 'You do not have permission to access this student dashboard data' });
    }

    const totalLessons = await Progress.countDocuments({ studentId });
    const completedLessons = await Progress.countDocuments({ studentId, status: 'completed' });
    const averageScore = await Progress.aggregate([
      { $match: { studentId } },
      { $group: { _id: null, avgScore: { $avg: '$score' } } },
    ]);

    const recentProgress = await Progress.find({ studentId })
      .populate('lessonId', 'title category')
      .sort({ updatedAt: -1 })
      .limit(5);

    res.json({
      totalLessons,
      completedLessons,
      completionRate: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
      averageScore: averageScore[0]?.avgScore || 0,
      recentProgress,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getProgressReports =async (req, res) => {
  try {
    const progress = await Progress.find({});
    const reports = await attachStudentInfo(
      [...progress].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    );

    res.json({ reports });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


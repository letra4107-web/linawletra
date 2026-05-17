const Progress = require('../models/Progress');
const Student = require('../models/Student');

async function assertParentOwnsStudent(req, studentId) {
  if (req.user?.role !== 'parent') return;
  const student = await Student.findById(studentId).select('parentId');
  if (!student) return false;
  return student.parentId?.toString() === req.user.id;
}

// Create or get progress
exports.createOrGetProgress = async (req, res) => {
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
exports.updateProgress = async (req, res) => {
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
exports.getProgressByStudent = async (req, res) => {
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
exports.getDashboardData = async (req, res) => {
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

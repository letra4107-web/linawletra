const Assessment = require('../models/Assessment');
const Student = require('../models/Student');

async function assertParentOwnsStudent(req, studentId) {
  if (req.user?.role !== 'parent') return true;
  const student = await Student.findById(studentId).select('parentId');
  if (!student) return false;
  return student.parentId?.toString() === req.user.id;
}

// Create assessment
exports.createAssessment = async (req, res) => {
  try {
    const { studentId } = req.body;
    let parentId = req.user.id;

    // If a non-parent starts an assessment, infer parentId from the student record
    // so the Assessment model (which requires parentId) remains consistent.
    if (req.user.role !== 'parent') {
      const student = await Student.findById(studentId);
      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }
      parentId = student.parentId;
    }

    // If a parent is creating, ensure ownership
    if (!(await assertParentOwnsStudent(req, studentId))) {
      return res.status(403).json({ message: 'You do not have permission to access this student assessment' });
    }

    const assessment = new Assessment({
      studentId,
      parentId,
      categories: {
        alphabetRecognition: { score: 0, maxScore: 100 },
        letterIdentification: { score: 0, maxScore: 100 },
        letterFormation: { score: 0, maxScore: 100 },
        readingAbility: { score: 0, maxScore: 100 },
        writingAbility: { score: 0, maxScore: 100 },
      },
    });

    await assessment.save();
    res.status(201).json({ message: 'Assessment created', assessment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update assessment scores
exports.updateAssessmentScores = async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const { categories } = req.body;

    const assessment = await Assessment.findById(assessmentId);
    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found' });
    }

    if (!(await assertParentOwnsStudent(req, assessment.studentId))) {
      return res.status(403).json({ message: 'You do not have permission to update this assessment' });
    }

    // Update categories
    Object.keys(categories).forEach(key => {
      if (assessment.categories[key]) {
        assessment.categories[key].score = categories[key].score;
        assessment.categories[key].completed = true;
      }
    });

    // Calculate overall score
    const scores = Object.values(assessment.categories).map(cat => cat.score);
    assessment.overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // Determine difficulty adaptation
    if (assessment.overallScore < 40) {
      assessment.difficultyAdaptation = 'beginner';
      assessment.recommendedStartLevel = 1;
    } else if (assessment.overallScore < 70) {
      assessment.difficultyAdaptation = 'intermediate';
      assessment.recommendedStartLevel = 2;
    } else {
      assessment.difficultyAdaptation = 'advanced';
      assessment.recommendedStartLevel = 3;
    }

    assessment.completedAt = new Date();
    await assessment.save();

    // Update student's assessment status
    await Student.findByIdAndUpdate(
      assessment.studentId,
      {
        assessmentCompleted: true,
        latestAssessmentId: assessment._id,
        currentLessonLevel: assessment.recommendedStartLevel,
      }
    );

    res.json({ message: 'Assessment updated', assessment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get assessment by student
exports.getAssessmentByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!(await assertParentOwnsStudent(req, studentId))) {
      return res.status(403).json({ message: 'You do not have permission to access this student assessment' });
    }

    const assessment = await Assessment.findOne({ studentId }).sort({ createdAt: -1 });

    if (!assessment) {
      return res.status(404).json({ message: 'Assessment not found' });
    }

    res.json(assessment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all assessments for parent
exports.getAssessmentsByParent = async (req, res) => {
  try {
    const parentId = req.user.id;
    const assessments = await Assessment.find({ parentId }).populate('studentId', 'name');
    res.json(assessments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const express = require('express');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const {
  createAssessment,
  updateAssessmentScores,
  getAssessmentByStudent,
  getAssessmentsByParent,
  getAssessments,
} = require('../controllers/assessmentController');

const router = express.Router();

// Create assessment
router.post('/', authMiddleware, createAssessment);

// Update assessment scores
router.put('/:assessmentId', authMiddleware, updateAssessmentScores);

// Get assessment by student
router.get('/student/:studentId', authMiddleware, getAssessmentByStudent);

// Get assessments visible to the signed-in user
router.get('/', authMiddleware, roleMiddleware('parent', 'teacher', 'admin'), getAssessments);

module.exports = router;

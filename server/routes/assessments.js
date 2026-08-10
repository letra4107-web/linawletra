import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { createAssessment,
  updateAssessmentScores,
  getAssessmentByStudent,
  getAssessmentsByParent,
  getAssessments, } from '../controllers/assessmentController.js';

const router = express.Router();

// Create assessment
router.post('/', authMiddleware, roleMiddleware('parent', 'teacher', 'admin'), createAssessment);

// Update assessment scores
router.put('/:assessmentId', authMiddleware, roleMiddleware('parent', 'teacher', 'admin'), updateAssessmentScores);

// Get assessment by student
router.get('/student/:studentId', authMiddleware, getAssessmentByStudent);

// Get assessments visible to the signed-in user
router.get('/', authMiddleware, roleMiddleware('parent', 'teacher', 'admin'), getAssessments);

export default router;


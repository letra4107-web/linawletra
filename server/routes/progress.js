import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { createOrGetProgress,
  updateProgress,
  getProgressByStudent,
  getDashboardData,
  getCanonicalStudentStats,
  getProgressReports, } from '../controllers/progressController.js';

const router = express.Router();

// Create or get progress
router.post('/', authMiddleware, createOrGetProgress);

// Update progress
router.put('/:progressId', authMiddleware, updateProgress);

// Get progress by student
router.get('/student/:studentId', authMiddleware, getProgressByStudent);

// Get canonical student statistics
router.get('/:studentId/stats', authMiddleware, getCanonicalStudentStats);

// Get teacher/admin progress reports
router.get('/reports', authMiddleware, getProgressReports);

// Get dashboard data
router.get('/dashboard/:studentId', authMiddleware, getDashboardData);

export default router;


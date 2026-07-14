import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { createOrGetProgress,
  updateProgress,
  getProgressByStudent,
  getDashboardData,
  getProgressReports, } from '../controllers/progressController.js';

const router = express.Router();

// Create or get progress
router.post('/', authMiddleware, createOrGetProgress);

// Update progress
router.put('/:progressId', authMiddleware, updateProgress);

// Get progress by student
router.get('/student/:studentId', authMiddleware, getProgressByStudent);

// Get teacher/admin progress reports
router.get('/reports', authMiddleware, getProgressReports);

// Get dashboard data
router.get('/dashboard/:studentId', authMiddleware, getDashboardData);

export default router;


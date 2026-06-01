const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  createOrGetProgress,
  updateProgress,
  getProgressByStudent,
  getDashboardData,
  getProgressReports,
} = require('../controllers/progressController');

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

module.exports = router;

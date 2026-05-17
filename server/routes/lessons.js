const express = require('express');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const {
  createLesson,
  getLessonsByLevelAndCategory,
  getLesson,
  updateLesson,
  deleteLesson,
} = require('../controllers/lessonController');

const router = express.Router();

// Create lesson (admin/teacher only)
router.post('/', authMiddleware, roleMiddleware('admin', 'teacher'), createLesson);

// Get lessons by level and category
router.get('/', getLessonsByLevelAndCategory);

// Get single lesson
router.get('/:id', getLesson);

// Update lesson (admin/teacher only)
router.put('/:id', authMiddleware, roleMiddleware('admin', 'teacher'), updateLesson);

// Delete lesson (admin only)
router.delete('/:id', authMiddleware, roleMiddleware('admin'), deleteLesson);

module.exports = router;

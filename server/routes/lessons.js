import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { createLesson,
  getLessonsByLevelAndCategory,
  getLesson,
  updateLesson,
  deleteLesson, } from '../controllers/lessonController.js';

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

export default router;

import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { createSchedule,
  getSchedulesByStudent,
  getSchedulesByParent,
  getSchedulesByTeacher,
  updateSchedule,
  deleteSchedule, } from '../controllers/scheduleController.js';

const router = express.Router();

// Create schedule (teacher or parent)
router.post('/', authMiddleware, createSchedule);

// Get schedules for student
router.get('/student/:studentId', authMiddleware, getSchedulesByStudent);

// Get schedules for parent
router.get('/parent/list', authMiddleware, roleMiddleware('parent'), getSchedulesByParent);

// Get schedules for teacher
router.get('/teacher/list', authMiddleware, roleMiddleware('teacher'), getSchedulesByTeacher);

// Update schedule
router.put('/:id', authMiddleware, updateSchedule);

// Delete schedule
router.delete('/:id', authMiddleware, deleteSchedule);

export default router;

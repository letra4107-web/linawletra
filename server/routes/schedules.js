import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { createSchedule,
  getSchedulesByStudent,
  getParentCalendar,
  getSchedulesByParent,
  getSchedulesByTeacher,
  updateSchedule,
  deleteSchedule, } from '../controllers/scheduleController.js';

const router = express.Router();

// Create schedule (teacher or parent)
router.post('/', authMiddleware, roleMiddleware('teacher', 'parent'), createSchedule);

// Get schedules for student
router.get('/student/:studentId', authMiddleware, getSchedulesByStudent);

// Get schedules for parent
router.get('/parent/list', authMiddleware, roleMiddleware('parent'), getSchedulesByParent);

// Get parent calendar summary from real schedules and learning activity
router.get('/parent/calendar', authMiddleware, roleMiddleware('parent'), getParentCalendar);

// Get schedules for teacher
router.get('/teacher/list', authMiddleware, roleMiddleware('teacher'), getSchedulesByTeacher);

// Update schedule
router.put('/:id', authMiddleware, roleMiddleware('teacher', 'parent'), updateSchedule);

// Delete schedule
router.delete('/:id', authMiddleware, roleMiddleware('teacher', 'parent'), deleteSchedule);

export default router;

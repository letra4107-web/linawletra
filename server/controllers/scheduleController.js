import Schedule from '../models/Schedule.js';
import Student from '../models/Student.js';

async function assertParentOwnsStudent(req, studentId) {
  if (req.user?.role !== 'parent') return true;
  const student = await Student.findById(studentId).select('parentId');
  if (!student) return false;
  return student.parentId?.toString() === req.user.id;
}

const sortByScheduledDate = (items = []) =>
  [...items].sort((a, b) => new Date(a.scheduledDate || a.date || 0) - new Date(b.scheduledDate || b.date || 0));

const normalizeSchedulePayload = (body = {}) => {
  const scheduledDate = body.scheduledDate || body.scheduled_date || body.date || null;
  return {
    studentId: body.studentId || body.student_id,
    lessonId: body.lessonId || body.lesson_id || null,
    title: body.title || 'Lesson session',
    description: body.description || body.notes || '',
    sessionType: body.sessionType || body.session_type || 'reading',
    scheduledDate,
    duration: Number(body.duration || 60),
    status: body.status || 'upcoming',
    notes: body.notes || '',
  };
};

// Create schedule
export const createSchedule =async (req, res) => {
  try {
    const payload = normalizeSchedulePayload(req.body);
    const { studentId } = payload;

    if (!studentId) {
      return res.status(400).json({ message: 'Student is required' });
    }

    // Get student to verify parent relationship
    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if user is teacher or parent of the student
    let teacherId = null;
    let parentId = null;

    if (req.user.role === 'teacher') {
      teacherId = req.user.id;
      parentId = student.parentId || student.parent_id || null;
    } else if (req.user.role === 'parent') {
      // Verify the parent owns this student
      const ownerId = student.parentId || student.parent_id;
      if (!ownerId || ownerId.toString() !== req.user.id) {
        return res.status(403).json({ message: 'You can only create schedules for your own children' });
      }
      parentId = req.user.id;
      // For parent-created schedules, teacherId might be null initially
      teacherId = null;
    } else {
      return res.status(403).json({ message: 'Only teachers and parents can create schedules' });
    }

    const schedule = new Schedule({
      studentId,
      teacherId,
      parentId,
      lessonId: payload.lessonId,
      title: payload.title,
      description: payload.description,
      sessionType: payload.sessionType,
      scheduledDate: payload.scheduledDate,
      duration: payload.duration,
      status: payload.status,
      notes: payload.notes,
    });

    await schedule.save();
    res.status(201).json({ message: 'Schedule created', schedule });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get schedules by student
export const getSchedulesByStudent =async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!(await assertParentOwnsStudent(req, studentId))) {
      return res.status(403).json({ message: 'You do not have permission to access this student schedule' });
    }

    const schedules = sortByScheduledDate(await Schedule.find({ studentId }));

    res.json(schedules);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get schedules for parent
export const getSchedulesByParent =async (req, res) => {
  try {
    const parentId = req.user.id;
    const schedules = sortByScheduledDate(await Schedule.find({ parentId }));

    res.json(schedules);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get schedules for teacher
export const getSchedulesByTeacher =async (req, res) => {
  try {
    const teacherId = req.user.id;
    const schedules = sortByScheduledDate(await Schedule.find({ teacherId }));

    res.json(schedules);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update schedule
export const updateSchedule =async (req, res) => {
  try {
    const { scheduledDate, duration, status, notes, title, description } = req.body;

    // First, find the schedule to check permissions
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    // Check permissions
    let hasPermission = false;
    if (req.user.role === 'teacher' && schedule.teacherId?.toString() === req.user.id) {
      hasPermission = true;
    } else if (req.user.role === 'parent' && schedule.parentId?.toString() === req.user.id) {
      hasPermission = true;
    }

    if (!hasPermission) {
      return res.status(403).json({ message: 'You do not have permission to update this schedule' });
    }

    const updatedSchedule = await Schedule.findByIdAndUpdate(
      req.params.id,
      {
        scheduledDate,
        duration,
        status,
        notes,
        title,
        description,
        updatedAt: Date.now()
      },
      { new: true }
    );

    res.json({ message: 'Schedule updated', schedule: updatedSchedule });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete schedule
export const deleteSchedule =async (req, res) => {
  try {
    // First, find the schedule to check permissions
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    // Check permissions
    let hasPermission = false;
    if (req.user.role === 'teacher' && schedule.teacherId?.toString() === req.user.id) {
      hasPermission = true;
    } else if (req.user.role === 'parent' && schedule.parentId?.toString() === req.user.id) {
      hasPermission = true;
    }

    if (!hasPermission) {
      return res.status(403).json({ message: 'You do not have permission to delete this schedule' });
    }

    await Schedule.findByIdAndDelete(req.params.id);
    res.json({ message: 'Schedule deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


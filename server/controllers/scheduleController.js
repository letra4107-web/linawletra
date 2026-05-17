const Schedule = require('../models/Schedule');
const Student = require('../models/Student');

async function assertParentOwnsStudent(req, studentId) {
  if (req.user?.role !== 'parent') return true;
  const student = await Student.findById(studentId).select('parentId');
  if (!student) return false;
  return student.parentId?.toString() === req.user.id;
}

// Create schedule
exports.createSchedule = async (req, res) => {
  try {
    const { studentId, lessonId, title, description, sessionType, scheduledDate, duration } = req.body;

    // Get student to verify parent relationship
    const Student = require('../models/Student');
    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check if user is teacher or parent of the student
    let teacherId = null;
    let parentId = null;

    if (req.user.role === 'teacher') {
      teacherId = req.user.id;
      parentId = student.parentId;
    } else if (req.user.role === 'parent') {
      // Verify the parent owns this student
      if (student.parentId.toString() !== req.user.id) {
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
      lessonId,
      title,
      description,
      sessionType,
      scheduledDate,
      duration,
    });

    await schedule.save();
    res.status(201).json({ message: 'Schedule created', schedule });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get schedules by student
exports.getSchedulesByStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!(await assertParentOwnsStudent(req, studentId))) {
      return res.status(403).json({ message: 'You do not have permission to access this student schedule' });
    }

    const schedules = await Schedule.find({ studentId })
      .populate('lessonId', 'title')
      .populate('teacherId', 'name email')
      .sort({ scheduledDate: 1 });

    res.json(schedules);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get schedules for parent
exports.getSchedulesByParent = async (req, res) => {
  try {
    const parentId = req.user.id;
    const schedules = await Schedule.find({ parentId })
      .populate('studentId', 'name')
      .populate('teacherId', 'name email')
      .sort({ scheduledDate: 1 });

    res.json(schedules);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get schedules for teacher
exports.getSchedulesByTeacher = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const schedules = await Schedule.find({ teacherId })
      .populate('studentId', 'name')
      .populate('parentId', 'name email')
      .sort({ scheduledDate: 1 });

    res.json(schedules);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update schedule
exports.updateSchedule = async (req, res) => {
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
exports.deleteSchedule = async (req, res) => {
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

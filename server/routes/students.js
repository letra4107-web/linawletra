import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { createStudent,
  getStudentsByParent,
  getStudent,
  updateStudent,
  deleteStudent, } from '../controllers/studentController.js';
import { supabase } from '../config/supabase.js';
import { canAccessStudent, getVisibleStudentIds } from '../utils/studentAccess.js';

const router = express.Router();

const attachUserProfiles = async (supabase, students = []) => {
  const safeStudents = Array.isArray(students) ? students : [];
  const userIds = [...new Set(safeStudents.map((student) => student.user_id).filter(Boolean))];

  if (!userIds.length) {
    return safeStudents.map((student) => ({ ...student, user: null }));
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .in('id', userIds);

  if (error) {
    console.warn('[Students Route] Could not attach user profiles:', error.message);
    return safeStudents.map((student) => ({ ...student, user: null }));
  }

  const usersById = new Map((users || []).map((user) => [user.id, user]));
  return safeStudents.map((student) => ({
    ...student,
    user: usersById.get(student.user_id) || null,
  }));
};

// Create student (Enroll child)
// Note: endpoint kept as POST /api/students to match existing frontend axios service.
router.post('/', authMiddleware, roleMiddleware('parent'), createStudent);
router.post('/enroll', authMiddleware, roleMiddleware('parent'), createStudent);


// Get all students for parent
router.get('/', authMiddleware, roleMiddleware('parent'), getStudentsByParent);

// Get all students (for teachers/admins)
router.get('/all', authMiddleware, roleMiddleware('teacher', 'admin'), async (req, res) => {
  try {
    const visibleStudentIds = await getVisibleStudentIds(req);
    let query = supabase.from('students').select('*');

    if (req.user.role !== 'admin') {
      if (!visibleStudentIds.length) {
        return res.json([]);
      }
      query = query.in('id', visibleStudentIds);
    }

    const { data: students, error } = await query;

    if (error) {
      console.error('[Get All Students] Error:', error);
      throw error;
    }

    res.json(await attachUserProfiles(supabase, students || []));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get student dashboard data
router.get('/:id/dashboard', authMiddleware, async (req, res) => {
  try {
    const studentId = req.params.id;

    // Get student and attach profile separately to avoid depending on FK cache names.
    const { data: student, error } = await supabase
      .from('students')
      .select('*')
      .or(`id.eq.${studentId},user_id.eq.${studentId}`)
      .single();

    if (error || !student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!canAccessStudent(req, student)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const [studentWithUser] = await attachUserProfiles(supabase, [student]);
    res.json({ student: studentWithUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single student
router.get('/:id', authMiddleware, getStudent);

// Update student
router.put('/:id', authMiddleware, updateStudent);

// Delete student
router.delete('/:id', authMiddleware, deleteStudent);

export default router;





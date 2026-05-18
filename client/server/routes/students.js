const express = require('express');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const {
  createStudent,
  getStudentsByParent,
  getStudent,
  updateStudent,
  deleteStudent,
} = require('../controllers/studentController');

const router = express.Router();

// Create student (Enroll child)
// Note: endpoint kept as POST /api/students to match existing frontend axios service.
router.post('/', authMiddleware, roleMiddleware('parent'), createStudent);
router.post('/enroll', authMiddleware, roleMiddleware('parent'), createStudent);


// Get all students for parent
router.get('/', authMiddleware, roleMiddleware('parent'), getStudentsByParent);

// Get single student
router.get('/:id', authMiddleware, getStudent);

// Update student
router.put('/:id', authMiddleware, updateStudent);

// Delete student
router.delete('/:id', authMiddleware, deleteStudent);

// Get all students (for teachers/admins)
router.get('/all', authMiddleware, roleMiddleware('teacher', 'admin'), async (req, res) => {
  try {
    const { supabase } = require('../config/supabase');

    const { data: students, error } = await supabase
      .from('students')
      .select(`
        *,
        users!students_user_id_fkey(*)
      `);

    if (error) {
      console.error('[Get All Students] Error:', error);
      throw error;
    }

    res.json(students || []);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get student dashboard data
router.get('/:id/dashboard', authMiddleware, async (req, res) => {
  try {
    const { supabase } = require('../config/supabase');
    const studentId = req.params.id;
    const userRole = req.user.role;
    const userId = req.user.id;

    // Get student with user data
    const { data: student, error } = await supabase
      .from('students')
      .select(`
        *,
        users(*)
      `)
      .eq('id', studentId)
      .single();

    if (error || !student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Parent or student isolation
    if (userRole === 'parent' && student.parent_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (userRole === 'student' && student.user_id !== userId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ student });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

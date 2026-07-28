import { supabase } from '../config/supabase.js';
import Student from '../models/Student.js';

const LEVEL_OPTIONS = ['beginner', 'intermediate', 'advanced'];
const DEFAULT_LEVEL = 'beginner';

const normalizeLevel = (value) => {
  if (!value || typeof value !== 'string') return DEFAULT_LEVEL;
  const normalized = value.trim().toLowerCase();
  return LEVEL_OPTIONS.includes(normalized) ? normalized : DEFAULT_LEVEL;
};

const fetchStudent = async (studentId) => {
  return Student.findById(studentId);
};

const isAuthorizedForStudent = async (req, student) => {
  if (!student) return false;

  if (req.user.role === 'parent') {
    return student.parentId === req.user.id || student.parent_id === req.user.id;
  }

  if (req.user.role === 'student') {
    // A student is linked to their own record via students.user_id, not the
    // other way around -- users has no student_id column, so the previous
    // check (user?.studentId === student.id) could never be true.
    return student.userId === req.user.id || student.user_id === req.user.id;
  }

  return false;
};

export const getPracticeLevel =async (req, res) => {
  try {
    const studentId = req.params.id;
    const student = await fetchStudent(studentId);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!(await isAuthorizedForStudent(req, student))) {
      return res.status(403).json({ message: 'You do not have permission to view this student practice level' });
    }

    const { data: settings, error: settingsError } = await supabase
      .from('practice_settings')
      .select('*')
      .eq('student_id', studentId)
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('Practice settings fetch error:', settingsError);
      return res.status(500).json({ message: 'Unable to retrieve practice level' });
    }

    const studentLevel = normalizeLevel(student.readingLevel || student.reading_level || DEFAULT_LEVEL);

    if (!settings) {
      return res.json({
        studentId,
        level: studentLevel,
        source: 'student',
      });
    }

    return res.json({
      studentId,
      level: normalizeLevel(settings.level || studentLevel),
      source: 'practice_settings',
      data: settings,
    });
  } catch (error) {
    console.error('Get practice level error:', error);
    res.status(500).json({ message: 'Unable to retrieve practice level' });
  }
};

export const setPracticeLevel =async (req, res) => {
  try {
    const studentId = req.params.id;
    const rawLevel = req.body.level;
    if (!rawLevel || typeof rawLevel !== 'string') {
      return res.status(422).json({ message: 'Invalid practice level specified' });
    }

    const level = rawLevel.trim().toLowerCase();
    if (!LEVEL_OPTIONS.includes(level)) {
      return res.status(422).json({ message: 'Invalid practice level specified' });
    }

    const student = await fetchStudent(studentId);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (req.user.role !== 'parent' || (student.parentId !== req.user.id && student.parent_id !== req.user.id)) {
      return res.status(403).json({ message: 'Parent access required to set this student level' });
    }

    const now = new Date().toISOString();
    const payload = {
      student_id: studentId,
      parent_id: student.parentId || student.parent_id,
      level,
      updated_at: now,
    };

    const { data: existingSettings, error: fetchError } = await supabase
      .from('practice_settings')
      .select('*')
      .eq('student_id', studentId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Fetch practice settings error:', fetchError);
      return res.status(500).json({ message: 'Unable to save practice level' });
    }

    if (existingSettings) {
      await supabase
        .from('practice_settings')
        .update(payload)
        .eq('student_id', studentId);
    } else {
      await supabase
        .from('practice_settings')
        .insert({ ...payload, created_at: now });
    }

    await supabase
      .from('students')
      .update({ reading_level: level, updated_at: now })
      .eq('id', studentId);

    const { data: updatedSettings } = await supabase
      .from('practice_settings')
      .select('*')
      .eq('student_id', studentId)
      .single();

    return res.json({
      studentId,
      level,
      source: 'practice_settings',
      data: updatedSettings || { studentId, level, parentId: payload.parent_id },
    });
  } catch (error) {
    console.error('Set practice level error:', error);
    res.status(500).json({ message: 'Unable to save practice level' });
  }
};

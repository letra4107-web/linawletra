import { supabase } from '../config/supabase.js';
import { authorizeStudent } from '../utils/studentAccess.js';

const LEVEL_OPTIONS = ['beginner', 'intermediate', 'advanced'];
const DEFAULT_LEVEL = 'beginner';

const normalizeLevel = (value) => {
  if (!value || typeof value !== 'string') return DEFAULT_LEVEL;
  const normalized = value.trim().toLowerCase();
  return LEVEL_OPTIONS.includes(normalized) ? normalized : DEFAULT_LEVEL;
};

export const getPracticeLevel = async (req, res) => {
  try {
    const requestedStudentId = req.params.id;
    const { student, allowed, status } = await authorizeStudent(req, requestedStudentId);

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (!allowed) {
      return res.status(403).json({ message: 'You do not have permission to view this student practice level' });
    }

    const studentId = student.id;
    const { data: settings, error: settingsError } = await supabase
      .from('practice_settings')
      .select('*')
      .eq('student_id', studentId)
      .maybeSingle();

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('Practice settings fetch error:', settingsError);
      return res.status(status >= 500 ? status : 500).json({ message: 'Unable to retrieve practice level' });
    }

    const studentLevel = normalizeLevel(student.reading_level || DEFAULT_LEVEL);

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
    return res.status(500).json({ message: 'Unable to retrieve practice level' });
  }
};

export const setPracticeLevel = async (req, res) => {
  try {
    const requestedStudentId = req.params.id;
    const rawLevel = req.body.level;
    if (!rawLevel || typeof rawLevel !== 'string') {
      return res.status(422).json({ message: 'Invalid practice level specified' });
    }

    const level = rawLevel.trim().toLowerCase();
    if (!LEVEL_OPTIONS.includes(level)) {
      return res.status(422).json({ message: 'Invalid practice level specified' });
    }

    const { student, allowed } = await authorizeStudent(req, requestedStudentId, { allowAdmin: false });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (req.user.role !== 'parent' || !allowed) {
      return res.status(403).json({ message: 'Parent access required to set this student level' });
    }

    const studentId = student.id;
    const now = new Date().toISOString();
    const payload = {
      student_id: studentId,
      parent_id: student.parent_id,
      level,
      updated_at: now,
    };

    const { data: existingSettings, error: fetchError } = await supabase
      .from('practice_settings')
      .select('*')
      .eq('student_id', studentId)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Fetch practice settings error:', fetchError);
      return res.status(500).json({ message: 'Unable to save practice level' });
    }

    if (existingSettings) {
      const { error: updateError } = await supabase
        .from('practice_settings')
        .update(payload)
        .eq('student_id', studentId);
      if (updateError) {
        console.error('Update practice settings error:', updateError);
        return res.status(500).json({ message: 'Unable to save practice level' });
      }
    } else {
      const { error: insertError } = await supabase
        .from('practice_settings')
        .insert({ ...payload, created_at: now });
      if (insertError) {
        console.error('Insert practice settings error:', insertError);
        return res.status(500).json({ message: 'Unable to save practice level' });
      }
    }

    const { error: studentUpdateError } = await supabase
      .from('students')
      .update({ reading_level: level, updated_at: now })
      .eq('id', studentId);
    if (studentUpdateError) {
      console.error('Update student reading level error:', studentUpdateError);
      return res.status(500).json({ message: 'Practice level saved, but student reading level could not be updated' });
    }

    const { data: updatedSettings } = await supabase
      .from('practice_settings')
      .select('*')
      .eq('student_id', studentId)
      .maybeSingle();

    return res.json({
      studentId,
      level,
      source: 'practice_settings',
      data: updatedSettings || { studentId, level, parentId: payload.parent_id },
    });
  } catch (error) {
    console.error('Set practice level error:', error);
    return res.status(500).json({ message: 'Unable to save practice level' });
  }
};

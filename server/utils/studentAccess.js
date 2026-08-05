import { supabase } from '../config/supabase.js';

const normalizeId = (value) => (value == null ? '' : String(value).trim());

export async function resolveStudent(studentIdOrUserId) {
  const id = normalizeId(studentIdOrUserId);
  if (!id) return null;

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .or(`id.eq.${id},user_id.eq.${id}`)
    .maybeSingle();

  if (error) {
    console.warn('[StudentAccess] Failed to resolve student:', error.message);
    return null;
  }

  return data || null;
}

export function canAccessStudent(req, student, options = {}) {
  if (!req?.user || !student) return false;
  const role = req.user.role;
  const userId = req.user.id;
  const allowAdmin = options.allowAdmin !== false;

  if (allowAdmin && role === 'admin') return true;
  if (student.user_id === userId) return true;
  if (role === 'parent' && student.parent_id === userId) return true;
  if (role === 'teacher' && student.teacher_id === userId) return true;
  return false;
}

export async function authorizeStudent(req, studentIdOrUserId, options = {}) {
  const student = await resolveStudent(studentIdOrUserId);
  if (!student) return { student: null, allowed: false, status: 404 };
  return {
    student,
    allowed: canAccessStudent(req, student, options),
    status: canAccessStudent(req, student, options) ? 200 : 403,
  };
}

export async function getVisibleStudentIds(req) {
  if (!req?.user) return [];

  if (req.user.role === 'admin') {
    const { data, error } = await supabase.from('students').select('id');
    if (error) throw error;
    return (data || []).map((student) => student.id);
  }

  if (req.user.role === 'teacher') {
    const { data, error } = await supabase
      .from('students')
      .select('id')
      .eq('teacher_id', req.user.id);
    if (error) throw error;
    return (data || []).map((student) => student.id);
  }

  if (req.user.role === 'parent') {
    const { data, error } = await supabase
      .from('students')
      .select('id')
      .eq('parent_id', req.user.id);
    if (error) throw error;
    return (data || []).map((student) => student.id);
  }

  if (req.user.role === 'student') {
    const student = await resolveStudent(req.user.id);
    return student?.id ? [student.id] : [];
  }

  return [];
}

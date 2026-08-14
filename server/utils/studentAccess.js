import { supabase } from '../config/supabase.js';

const normalizeId = (value) => (value == null ? '' : String(value).trim());

export async function resolveStudent(studentIdOrUserId) {
  const id = normalizeId(studentIdOrUserId);
  if (!id) return null;

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .or(`id.eq.${id},user_id.eq.${id},child_id.eq.${id}`)
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
  const studentUserId = student.user_id || student.userId;
  const studentParentId = student.parent_id || student.parentId;
  const studentTeacherId = student.teacher_id || student.teacherId;

  if (allowAdmin && role === 'admin') return true;
  if (studentUserId === userId) return true;
  if (role === 'parent' && studentParentId === userId) return true;
  if (role === 'teacher' && studentTeacherId === userId) return true;
  return false;
}

export async function canAccessStudentResolved(req, student, options = {}) {
  if (canAccessStudent(req, student, options)) return true;
  if (!req?.user || !student) return false;
  if (req.user.role === 'teacher') return false;

  if (req.user.role !== 'parent') return false;

  const studentId = student.id;
  const studentUserId = student.user_id || student.userId;
  const directChildId = student.child_id || student.childId;
  const candidateChildIds = new Set([directChildId].filter(Boolean));

  if (studentId) {
    const { data: mapRows, error: mapError } = await supabase
      .from('students_children_map')
      .select('child_id')
      .eq('student_id', studentId);
    if (!mapError) {
      (mapRows || []).forEach((row) => row.child_id && candidateChildIds.add(row.child_id));
    }
  }

  let childQuery = supabase.from('children').select('id,parent_id,student_id,auth_uid');
  const filters = [];
  if (candidateChildIds.size) filters.push(`id.in.(${[...candidateChildIds].join(',')})`);
  if (studentId) filters.push(`student_id.eq.${studentId}`);
  if (studentUserId) filters.push(`auth_uid.eq.${studentUserId}`);
  if (!filters.length) return false;

  const { data: childRows, error: childError } = await childQuery.or(filters.join(','));
  if (childError) {
    console.warn('[StudentAccess] Failed to resolve child ownership:', childError.message);
    return false;
  }

  return (childRows || []).some((child) => child.parent_id === req.user.id);
}

export async function authorizeStudent(req, studentIdOrUserId, options = {}) {
  const student = await resolveStudent(studentIdOrUserId);
  if (!student) return { student: null, allowed: false, status: 404 };
  const allowed = await canAccessStudentResolved(req, student, options);
  return {
    student,
    allowed,
    status: allowed ? 200 : 403,
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
    return (data || []).map((student) => student.id).filter(Boolean);
  }

  if (req.user.role === 'parent') {
    const { data, error } = await supabase
      .from('students')
      .select('id,user_id,child_id')
      .eq('parent_id', req.user.id);
    if (error) throw error;
    const ids = new Set((data || []).map((student) => student.id));

    const { data: childRows, error: childError } = await supabase
      .from('children')
      .select('id,student_id,auth_uid')
      .eq('parent_id', req.user.id);
    if (childError) throw childError;

    const childIds = (childRows || []).map((child) => child.id).filter(Boolean);
    const childStudentIds = (childRows || []).flatMap((child) => [child.student_id, child.auth_uid]).filter(Boolean);
    childStudentIds.forEach((id) => ids.add(id));

    if (childIds.length) {
      const { data: mapRows, error: mapError } = await supabase
        .from('students_children_map')
        .select('student_id')
        .in('child_id', childIds);
      if (mapError) throw mapError;
      (mapRows || []).forEach((row) => row.student_id && ids.add(row.student_id));
    }

    if (ids.size) {
      const { data: resolvedRows, error: resolvedError } = await supabase
        .from('students')
        .select('id')
        .or(`id.in.(${[...ids].join(',')}),user_id.in.(${[...ids].join(',')})`);
      if (resolvedError) throw resolvedError;
      return (resolvedRows || []).map((student) => student.id);
    }

    return [];
  }

  if (req.user.role === 'student') {
    const student = await resolveStudent(req.user.id);
    return student?.id ? [student.id] : [];
  }

  return [];
}

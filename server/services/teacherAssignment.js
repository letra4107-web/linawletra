import { supabase } from '../config/supabase.js';

const ACTIVE_TEACHER_STATUSES = new Set(['', 'active', 'approved']);

export const normalizeGradeLevel = (value) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  const compact = raw.replace(/[\s_-]+/g, '');
  const match = compact.match(/^grade([1-6])$/) || compact.match(/^([1-6])$/);
  return match ? match[1] : null;
};

export const normalizeTeacherGradeLevels = (teacher = {}) => {
  const metadata = teacher.metadata || {};
  const rawGrades = [
    teacher.grade_level,
    teacher.gradeLevel,
    teacher.handled_grade_levels,
    teacher.handledGradeLevels,
    metadata.gradeLevel,
    metadata.gradeLevels,
    metadata.handledGradeLevels,
    metadata.handled_grade_levels,
  ];

  const normalized = rawGrades
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map(normalizeGradeLevel)
    .filter(Boolean);

  return [...new Set(normalized)];
};

const isActiveTeacher = (teacher = {}) => {
  const status = String(teacher.account_status || teacher.status || '').toLowerCase();
  return teacher.role === 'teacher' && teacher.is_active !== false && ACTIVE_TEACHER_STATUSES.has(status);
};

const selectMatchingTeachers = async (gradeLevel) => {
  const normalizedGrade = normalizeGradeLevel(gradeLevel);
  if (!normalizedGrade) return [];

  const { data: teachers, error } = await supabase
    .from('users')
    .select('id,role,is_active,account_status,metadata,created_at')
    .eq('role', 'teacher')
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (teachers || []).filter((teacher) =>
    isActiveTeacher(teacher) && normalizeTeacherGradeLevels(teacher).includes(normalizedGrade)
  );
};

const countAssignedStudents = async (teacherIds = []) => {
  if (!teacherIds.length) return new Map();

  const { data, error } = await supabase
    .from('students')
    .select('teacher_id')
    .in('teacher_id', teacherIds);

  if (error) throw error;

  return (data || []).reduce((counts, row) => {
    if (row.teacher_id) counts.set(row.teacher_id, (counts.get(row.teacher_id) || 0) + 1);
    return counts;
  }, new Map());
};

const safeSelectRows = async (table, buildQuery) => {
  const result = await buildQuery(supabase.from(table));
  if (result.error) {
    if (['PGRST205', 'PGRST204', '42P01', '42703'].includes(result.error.code)) return [];
    throw result.error;
  }
  return result.data || [];
};

const safeUpdateStudent = async (studentId, updates = {}) => {
  if (!studentId || !Object.keys(updates).length) return null;
  const { data, error } = await supabase
    .from('students')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', studentId)
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST204' && Object.prototype.hasOwnProperty.call(updates, 'display_name')) {
      const { display_name, ...withoutDisplayName } = updates;
      if (!Object.keys(withoutDisplayName).length) return null;
      const retry = await supabase
        .from('students')
        .update({ ...withoutDisplayName, updated_at: new Date().toISOString() })
        .eq('id', studentId)
        .select('*')
        .single();
      if (retry.error) throw retry.error;
      return retry.data;
    }
    throw error;
  }

  return data;
};

const getUserDisplayName = (user = {}) => {
  const metadata = user.metadata || {};
  return user.name ||
    metadata.displayName ||
    [metadata.firstName, metadata.lastName].filter(Boolean).join(' ') ||
    user.email ||
    '';
};

const getUserGrade = (user = {}) => {
  const metadata = user.metadata || {};
  return normalizeGradeLevel(
    user.grade_level ||
    user.gradeLevel ||
    metadata.gradeLevel ||
    metadata.grade_level ||
    metadata.grade ||
    metadata.class ||
    metadata.className
  );
};

const getChildDisplayName = (child = {}) => {
  const metadata = child.metadata || {};
  return child.name || child.display_name || child.full_name || metadata.displayName || child.username || '';
};

const getChildGrade = (child = {}) => {
  const metadata = child.metadata || {};
  return normalizeGradeLevel(child.grade_level || child.gradeLevel || child.grade || metadata.gradeLevel || metadata.grade_level);
};

const loadChildrenForStudents = async ({ studentIds = [], userIds = [] } = {}) => {
  const children = [];
  const mapRows = studentIds.length
    ? await safeSelectRows('students_children_map', (query) =>
      query.select('student_id,child_id').in('student_id', studentIds)
    )
    : [];
  const mappedChildIds = [...new Set(mapRows.map((row) => row.child_id).filter(Boolean))];

  if (mappedChildIds.length) {
    children.push(...await safeSelectRows('children', (query) =>
      query.select('*').in('id', mappedChildIds)
    ));
  }
  if (studentIds.length) {
    children.push(...await safeSelectRows('children', (query) =>
      query.select('*').in('student_id', studentIds)
    ));
  }
  if (userIds.length) {
    children.push(...await safeSelectRows('children', (query) =>
      query.select('*').in('auth_uid', userIds)
    ));
  }

  const childIdByStudentId = new Map(mapRows.map((row) => [row.student_id, row.child_id]));
  const byId = new Map();
  const byStudentId = new Map();
  const byAuthUid = new Map();
  children.forEach((child) => {
    if (child.id) byId.set(child.id, child);
    if (child.student_id) byStudentId.set(child.student_id, child);
    if (child.auth_uid) byAuthUid.set(child.auth_uid, child);
  });

  return {
    findForStudent: (student = {}) => {
      const childId = student.child_id || childIdByStudentId.get(student.id);
      return (childId ? byId.get(childId) : null) || byStudentId.get(student.id) || byAuthUid.get(student.user_id) || null;
    },
    findForUserId: (userId) => byAuthUid.get(userId) || null,
  };
};

const getStudentAssignmentGrade = async (student = {}) => {
  const directGrade = normalizeGradeLevel(student.grade_level || student.gradeLevel || student.grade);
  if (directGrade) return directGrade;

  let user = null;
  if (student.user_id) {
    const result = await supabase
      .from('users')
      .select('id,name,email,parent_id,metadata')
      .eq('id', student.user_id)
      .maybeSingle();
    if (result.error) throw result.error;
    user = result.data || null;
    const userGrade = getUserGrade(user || {});
    if (userGrade) return userGrade;
  }

  const children = await loadChildrenForStudents({
    studentIds: [student.id].filter(Boolean),
    userIds: [student.user_id].filter(Boolean),
  });
  const childGrade = getChildGrade(children.findForStudent(student) || {});
  return childGrade || null;
};

const repairStudentRowFromProfileData = async (student = {}) => {
  const updates = {};
  const userResult = student.user_id
    ? await supabase.from('users').select('id,name,email,parent_id,metadata').eq('id', student.user_id).maybeSingle()
    : { data: null, error: null };
  if (userResult.error) throw userResult.error;

  const children = await loadChildrenForStudents({
    studentIds: [student.id].filter(Boolean),
    userIds: [student.user_id].filter(Boolean),
  });
  const child = children.findForStudent(student);
  const grade = normalizeGradeLevel(student.grade_level) || getUserGrade(userResult.data || {}) || getChildGrade(child || {});
  const name = await getStudentRosterName({ ...student, user: userResult.data, child });

  if (!student.grade_level && grade) updates.grade_level = grade;
  if (!student.parent_id && userResult.data?.parent_id) updates.parent_id = userResult.data.parent_id;
  if (name && !student.display_name) updates.display_name = name;
  if (child?.id && !student.child_id) updates.child_id = child.id;

  if (!Object.keys(updates).length) return student;
  return await safeUpdateStudent(student.id, updates) || { ...student, ...updates };
};

const ensureStudentRowsForAssignableUsers = async () => {
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id,email,name,role,parent_id,is_active,account_status,metadata')
    .eq('role', 'student');

  if (usersError) throw usersError;
  if (!users?.length) return { created: 0, repaired: 0 };

  const userIds = users.map((user) => user.id).filter(Boolean);
  const { data: existingStudents, error: studentsError } = await supabase
    .from('students')
    .select('*')
    .in('user_id', userIds);

  if (studentsError) throw studentsError;

  const studentsByUserId = new Map((existingStudents || []).map((student) => [student.user_id, student]));
  const children = await loadChildrenForStudents({ userIds });
  let created = 0;
  let repaired = 0;

  for (const user of users || []) {
    const existing = studentsByUserId.get(user.id);
    if (existing) {
      const repairedStudent = await repairStudentRowFromProfileData(existing);
      if (repairedStudent !== existing) repaired += 1;
      continue;
    }

    const child = children.findForUserId(user.id);
    const grade = getUserGrade(user) || getChildGrade(child || {});
    const displayName = getUserDisplayName(user) || getChildDisplayName(child || '');
    if (!grade || !displayName) continue;

    const payload = {
      user_id: user.id,
      parent_id: user.parent_id || user.metadata?.parentId || user.metadata?.parent_id || child?.parent_id || null,
      child_id: child?.id || null,
      grade_level: grade,
      reading_level: user.metadata?.readingLevel || user.metadata?.reading_level || 'beginner',
      enrollment_date: new Date().toISOString().slice(0, 10),
    };

    const { data: inserted, error: insertError } = await supabase
      .from('students')
      .insert(payload)
      .select('*')
      .single();

    if (insertError?.code === '23505') {
      continue;
    }
    if (insertError) throw insertError;

    await safeUpdateStudent(inserted.id, { display_name: displayName }).catch((error) => {
      console.warn('[TeacherAssignment] Could not persist students.display_name:', error.message);
    });
    created += 1;
  }

  return { created, repaired };
};

export const getStudentRosterName = async (student = {}) => {
  if (student.display_name) return String(student.display_name).trim();
  if (student.name) return String(student.name).trim();
  if (student.user) {
    const userName = getUserDisplayName(student.user);
    if (String(userName).trim()) return String(userName).trim();
  }
  if (student.child) {
    const childName = getChildDisplayName(student.child);
    if (String(childName).trim()) return String(childName).trim();
  }

  if (student.user_id) {
    const { data: user, error } = await supabase
      .from('users')
      .select('name,email,metadata')
      .eq('id', student.user_id)
      .maybeSingle();
    if (error) throw error;
    const userName = getUserDisplayName(user || {});
    if (String(userName).trim()) return String(userName).trim();
  }

  const children = [];
  if (student.child_id) {
    children.push(...await safeSelectRows('children', (query) =>
      query.select('name,display_name,full_name,metadata,username').eq('id', student.child_id)
    ));
  }
  if (student.id) {
    const mapRows = await safeSelectRows('students_children_map', (query) =>
      query.select('child_id').eq('student_id', student.id)
    );
    const childIds = mapRows.map((row) => row.child_id).filter(Boolean);
    if (childIds.length) {
      children.push(...await safeSelectRows('children', (query) =>
        query.select('name,display_name,full_name,metadata,username').in('id', childIds)
      ));
    }
    children.push(...await safeSelectRows('children', (query) =>
      query.select('name,display_name,full_name,metadata,username').eq('student_id', student.id)
    ));
  }
  if (student.user_id) {
    children.push(...await safeSelectRows('children', (query) =>
      query.select('name,display_name,full_name,metadata,username').eq('auth_uid', student.user_id)
    ));
  }

  for (const child of children) {
    const childName = getChildDisplayName(child || {});
    if (String(childName).trim()) return String(childName).trim();
  }

  return '';
};

const hasRosterName = async (student) => Boolean(await getStudentRosterName(student));

export const chooseTeacherForGrade = async (gradeLevel) => {
  const teachers = await selectMatchingTeachers(gradeLevel);
  if (!teachers.length) return null;

  const counts = await countAssignedStudents(teachers.map((teacher) => teacher.id));
  return [...teachers].sort((a, b) => {
    const byLoad = (counts.get(a.id) || 0) - (counts.get(b.id) || 0);
    if (byLoad !== 0) return byLoad;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  })[0];
};

export const teacherHandlesStudentGrade = (teacher, student) => {
  const studentGrade = normalizeGradeLevel(student?.grade_level || student?.gradeLevel || student?.grade);
  if (!studentGrade) return false;
  return normalizeTeacherGradeLevels(teacher).includes(studentGrade);
};

export const assignStudentToMatchingTeacher = async (studentId, options = {}) => {
  const { forceIfInvalid = true } = options;
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('*')
    .eq('id', studentId)
    .maybeSingle();

  if (studentError) throw studentError;
  if (!student) return { student: null, assignedTeacherId: null, changed: false, reason: 'student_not_found' };

  const normalizedGrade = await getStudentAssignmentGrade(student);
  if (!normalizedGrade) {
    return { student, assignedTeacherId: student.teacher_id || null, changed: false, reason: 'missing_grade' };
  }

  if (student.teacher_id) {
    const { data: currentTeacher, error: teacherError } = await supabase
      .from('users')
      .select('id,role,is_active,account_status,metadata,created_at')
      .eq('id', student.teacher_id)
      .maybeSingle();

    if (teacherError) throw teacherError;
    if (currentTeacher && isActiveTeacher(currentTeacher) && teacherHandlesStudentGrade(currentTeacher, student)) {
      return { student, assignedTeacherId: student.teacher_id, changed: false, reason: 'already_valid' };
    }

    if (!forceIfInvalid) {
      return { student, assignedTeacherId: student.teacher_id, changed: false, reason: 'already_assigned' };
    }
  }

  const teacher = await chooseTeacherForGrade(normalizedGrade);
  const nextTeacherId = teacher?.id || null;

  if (nextTeacherId && !(await hasRosterName(student))) {
    return { student, assignedTeacherId: null, changed: false, reason: 'missing_roster_name' };
  }

  if ((student.teacher_id || null) === nextTeacherId) {
    return { student, assignedTeacherId: nextTeacherId, changed: false, reason: 'unchanged' };
  }

  const { data: updatedStudent, error: updateError } = await supabase
    .from('students')
    .update({ teacher_id: nextTeacherId, updated_at: new Date().toISOString() })
    .eq('id', student.id)
    .select('*')
    .single();

  if (updateError) throw updateError;

  return {
    student: updatedStudent,
    assignedTeacherId: nextTeacherId,
    changed: true,
    reason: nextTeacherId ? 'assigned' : 'no_matching_teacher',
  };
};

export const assignExistingStudentsToTeacher = async (teacherId) => {
  const { data: teacher, error: teacherError } = await supabase
    .from('users')
    .select('id,role,is_active,account_status,metadata,created_at')
    .eq('id', teacherId)
    .maybeSingle();

  if (teacherError) throw teacherError;
  if (!teacher || !isActiveTeacher(teacher)) {
    return { teacherId, matchedGrades: [], assignedCount: 0, updatedStudentIds: [] };
  }

  const matchedGrades = normalizeTeacherGradeLevels(teacher);
  if (!matchedGrades.length) {
    return { teacherId, matchedGrades, assignedCount: 0, updatedStudentIds: [] };
  }

  const preparation = await ensureStudentRowsForAssignableUsers();

  const { data: students, error: studentsError } = await supabase
    .from('students')
    .select('*')
    .is('teacher_id', null);

  if (studentsError) throw studentsError;

  const eligibleStudents = [];
  for (const student of students || []) {
    const repairedStudent = await repairStudentRowFromProfileData(student);
    const grade = await getStudentAssignmentGrade(repairedStudent);
    if (matchedGrades.includes(grade) && await hasRosterName(repairedStudent)) {
      eligibleStudents.push(repairedStudent);
    }
  }
  const updatedStudentIds = [];

  for (const student of eligibleStudents) {
    const result = await assignStudentToMatchingTeacher(student.id, { forceIfInvalid: false });
    if (result.changed && result.assignedTeacherId === teacherId) {
      updatedStudentIds.push(student.id);
    }
  }

  return {
    teacherId,
    matchedGrades,
    assignedCount: updatedStudentIds.length,
    updatedStudentIds,
    preparedStudentRows: preparation,
  };
};

export const assignAllUnassignedStudentsByGrade = async () => {
  await ensureStudentRowsForAssignableUsers();
  const { data: students, error } = await supabase
    .from('students')
    .select('*')
    .is('teacher_id', null);

  if (error) throw error;

  const results = [];
  for (const student of students || []) {
    results.push(await assignStudentToMatchingTeacher(student.id, { forceIfInvalid: false }));
  }
  return results;
};

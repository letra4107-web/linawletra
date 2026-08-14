import '../config.js';
import { supabase } from '../config/supabase.js';
import {
  assignAllUnassignedStudentsByGrade,
  normalizeGradeLevel,
  normalizeTeacherGradeLevels,
} from '../services/teacherAssignment.js';

const dryRun = !process.argv.includes('--apply');

const { data: teachers, error: teacherError } = await supabase
  .from('users')
  .select('id,email,name,role,is_active,account_status,metadata,created_at')
  .eq('role', 'teacher')
  .order('created_at', { ascending: true });

if (teacherError) throw teacherError;

const { data: students, error: studentError } = await supabase
  .from('students')
  .select('id,user_id,teacher_id,grade_level')
  .is('teacher_id', null)
  .order('created_at', { ascending: true });

if (studentError) throw studentError;

const teacherSummaries = (teachers || []).map((teacher) => ({
  id: teacher.id,
  email: teacher.email,
  grades: normalizeTeacherGradeLevels(teacher),
}));

console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);
console.log(`Teachers with handled grades: ${teacherSummaries.filter((teacher) => teacher.grades.length).length}`);
console.log(`Unassigned students: ${(students || []).length}`);

const eligible = (students || []).filter((student) => {
  const grade = normalizeGradeLevel(student.grade_level);
  return grade && teacherSummaries.some((teacher) => teacher.grades.includes(grade));
});

console.log(`Eligible unassigned students by grade: ${eligible.length}`);

if (dryRun) {
  eligible.forEach((student) => {
    const grade = normalizeGradeLevel(student.grade_level);
    const matchingTeachers = teacherSummaries.filter((teacher) => teacher.grades.includes(grade));
    console.log(JSON.stringify({
      studentId: student.id,
      userId: student.user_id,
      grade: student.grade_level,
      normalizedGrade: grade,
      matchingTeacherIds: matchingTeachers.map((teacher) => teacher.id),
    }));
  });
  console.log('Dry-run complete. Re-run with --apply to update students.teacher_id.');
} else {
  const results = await assignAllUnassignedStudentsByGrade();
  const changed = results.filter((result) => result.changed);
  console.log(`Updated students: ${changed.length}`);
  changed.forEach((result) => {
    console.log(JSON.stringify({
      studentId: result.student.id,
      teacherId: result.assignedTeacherId,
      reason: result.reason,
    }));
  });
}

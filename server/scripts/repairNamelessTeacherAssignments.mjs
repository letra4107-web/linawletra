import '../config.js';
import { supabase } from '../config/supabase.js';
import { getStudentRosterName } from '../services/teacherAssignment.js';

const dryRun = !process.argv.includes('--apply');

const { data: assignedStudents, error } = await supabase
  .from('students')
  .select('*')
  .not('teacher_id', 'is', null)
  .order('teacher_id', { ascending: true });

if (error) throw error;

const nameless = [];
const named = [];

for (const student of assignedStudents || []) {
  const name = await getStudentRosterName(student);
  const row = {
    studentId: student.id,
    userId: student.user_id,
    teacherId: student.teacher_id,
    gradeLevel: student.grade_level,
    name: name || null,
  };
  if (name) named.push(row);
  else nameless.push(row);
}

console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);
console.log(`Assigned students: ${(assignedStudents || []).length}`);
console.log(`Assigned students with names: ${named.length}`);
console.log(`Assigned students missing names: ${nameless.length}`);

if (nameless.length) {
  console.log('Nameless assigned rows:');
  nameless.forEach((row) => console.log(JSON.stringify(row)));
}

if (dryRun) {
  console.log('Dry-run complete. Re-run with --apply to clear invalid nameless teacher assignments.');
} else if (nameless.length) {
  const { error: updateError } = await supabase
    .from('students')
    .update({ teacher_id: null, updated_at: new Date().toISOString() })
    .in('id', nameless.map((row) => row.studentId));

  if (updateError) throw updateError;
  console.log(`Cleared invalid teacher assignments: ${nameless.length}`);
}

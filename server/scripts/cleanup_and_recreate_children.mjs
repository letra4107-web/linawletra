import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
[path.resolve(__dirname, '../.env'), path.resolve(__dirname, '.env'), path.resolve(__dirname, '../.env.local'), path.resolve(__dirname, '.env.local')].forEach(p => dotenv.config({ path: p, override: false }));

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || process.env.SUPABASE_DATABASE_URL;
if (!databaseUrl) {
  console.error('Missing DATABASE_URL in environment.');
  process.exit(2);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

const brokenIds = [
  '67bccca1-2df6-463c-b735-4c60e27903e3',
  'dc0c149f-845e-4313-bad9-3e68df608bef',
  '967f7011-39b2-494a-af00-7762301dd77c',
  'a52392f0-4a3d-4a65-a88b-ae0a7502dcd6',
  'c3557878-fb2c-47cf-b61d-ab7eeb3eac9a',
  '4088ac21-a841-4fa2-8d3b-73001a10eb5e',
  'cd1bb99f-598a-4754-8895-d49bd95aae6c',
  'b1f62581-fada-47eb-9382-ad908fd8f565',
  '116972f4-d0d3-4519-8e80-e7ebbbef4e12',
  'f6f9839b-29b3-4631-8878-b7cb74b2cecb'
];

const preserveGoodId = 'bdd130f0-f79d-4906-8da9-58390e14c7ac';

async function run() {
  await client.connect();
  try {
    console.log('1) Inspecting children null-auth rows...');
    const { rows: nullAuth } = await client.query("SELECT id, auth_uid, name, created_at FROM public.children WHERE auth_uid IS NULL ORDER BY created_at DESC");
    console.log('Children with NULL auth_uid count:', nullAuth.length);

    // Show the specific broken ids presence
    const { rows: foundBroken } = await client.query('SELECT id, auth_uid, name, created_at FROM public.children WHERE id = ANY($1)', [brokenIds]);
    console.log('Found broken rows in DB:', foundBroken.length);

    // Delete the broken ids but ensure we don't delete the preserved id
    console.log('2) Deleting the 10 specified broken children...');
    await client.query('BEGIN');
    await client.query('DELETE FROM public.children WHERE id = ANY($1) AND id <> $2', [brokenIds, preserveGoodId]);
    await client.query('COMMIT');
    console.log('Deleted specified broken children (cascade will remove orphan mappings).');

    // Add unique index to prevent duplicated auth_uid
    console.log('3) Creating unique partial index on children(auth_uid) WHERE auth_uid IS NOT NULL');
    await client.query("CREATE UNIQUE INDEX IF NOT EXISTS children_auth_uid_unique_idx ON public.children (auth_uid) WHERE auth_uid IS NOT NULL");
    console.log('Index created.');

    // Find unmatched students (not mapped)
    console.log('4) Finding unmatched students...');
    const { rows: unmatched } = await client.query("SELECT s.id AS student_id, s.user_id FROM public.students s WHERE NOT EXISTS (SELECT 1 FROM public.students_children_map m WHERE m.student_id = s.id)");
    console.log('Unmatched students count:', unmatched.length);

    // Exclude the student already mapped to preserveGoodId
    const excludeStudentForGood = (await client.query("SELECT m.student_id FROM public.students_children_map m WHERE m.child_id = $1", [preserveGoodId])).rows.map(r => r.student_id);
    // Only create children when the corresponding auth.users entry exists to satisfy FK
    const studentsWithAuth = [];
    const skippedStudents = [];
    for (const s of unmatched) {
      if (excludeStudentForGood.includes(s.student_id)) continue;
      const { rows: inAuth } = await client.query('SELECT COUNT(*)::int AS cnt FROM auth.users WHERE id = $1', [s.user_id]).catch(() => [{ cnt: 0 }]);
      if (inAuth[0] && inAuth[0].cnt > 0) studentsWithAuth.push(s.student_id);
      else skippedStudents.push({ student_id: s.student_id, user_id: s.user_id });
    }
    console.log('Will create children for these student IDs count:', studentsWithAuth.length);
    if (skippedStudents.length) console.log('Skipping these students due to missing auth.users entries:', skippedStudents);

    if (studentsWithAuth.length > 0) {
      const insertSql = `
        INSERT INTO public.children (id, auth_uid, parent_id, name, grade_level, created_at)
        SELECT gen_random_uuid(), s.user_id::uuid,
          CASE WHEN EXISTS (SELECT 1 FROM public.users u WHERE u.id = s.parent_id) THEN s.parent_id::uuid ELSE NULL END,
          NULL,
          CASE WHEN (s.grade_level ~ '^[0-9]+$') THEN (s.grade_level::int) ELSE NULL END,
          now()
        FROM public.students s
        WHERE s.id = ANY($1)
        RETURNING id, auth_uid
      `;
      const { rows: newChildren } = await client.query(insertSql, [studentsWithAuth]);
      console.log('Inserted children rows count:', newChildren.length);

      // Insert mapping rows for those created children where mapping missing
      for (const nc of newChildren) {
        let studentId = null;
        if (nc.auth_uid) {
          const res = await client.query('SELECT id FROM public.students WHERE user_id::text = $1 LIMIT 1', [String(nc.auth_uid)]);
          if (res.rows[0]) studentId = res.rows[0].id;
        }
        if (!studentId) {
          const res2 = await client.query("SELECT s.id FROM public.students s WHERE s.id = ANY($1) AND NOT EXISTS (SELECT 1 FROM public.students_children_map m WHERE m.student_id = s.id) LIMIT 1", [studentsWithAuth]);
          if (res2.rows[0]) studentId = res2.rows[0].id;
        }
        if (studentId) {
          try {
            await client.query('INSERT INTO public.students_children_map (student_id, child_id) VALUES ($1, $2)', [studentId, nc.id]);
          } catch (err) {
            console.warn('Mapping insert warning:', err.message || err);
          }
        }
      }
    } else {
      console.log('No children created because no unmatched students had an auth.users entry.');
    }

    // Final counts
    const { rows: finalArchived } = await client.query('SELECT COUNT(*)::int AS cnt FROM public.students_legacy_progress_archive');
    const { rows: finalMap } = await client.query('SELECT COUNT(*)::int AS cnt FROM public.students_children_map');
    const { rows: finalChildrenMatch } = await client.query("SELECT COUNT(DISTINCT c.id)::int AS cnt FROM public.children c JOIN public.students s ON c.auth_uid::text = s.user_id::text");
    const { rows: finalTotalChildren } = await client.query('SELECT COUNT(*)::int AS cnt FROM public.children');

    console.log('Post-cleanup verification:');
    console.log('archived_rows:', finalArchived[0].cnt);
    console.log('students_children_map_rows:', finalMap[0].cnt);
    console.log('children_matching_students:', finalChildrenMatch[0].cnt);
    console.log('total_children:', finalTotalChildren[0].cnt);

  } catch (err) {
    console.error('Cleanup failed:', err.message || err);
    await client.query('ROLLBACK').catch(() => {});
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();

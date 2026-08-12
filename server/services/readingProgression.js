import { supabase } from '../config/supabase.js';

/**
 * Resolve a canonical `children.id` for a given legacy `students.id`.
 * Returns `null` when no mapping/child exists.
 */
async function resolveChildIdForStudent(studentId) {
  if (!studentId) return null;

  // 1) check students_children_map
  try {
    const { data: mapRows, error: mapErr } = await supabase
      .from('students_children_map')
      .select('child_id')
      .eq('student_id', studentId)
      .limit(1)
      .maybeSingle();
    if (mapErr) {
      console.warn('[ReadingProgression] mapping lookup failed:', mapErr.message || mapErr);
    }
    if (mapRows && mapRows.child_id) return mapRows.child_id;

    // 2) fallback: join via students.user_id -> children.auth_uid
    const { data: studentRows, error: sErr } = await supabase.from('students').select('user_id').eq('id', studentId).limit(1).maybeSingle();
    if (sErr) {
      console.warn('[ReadingProgression] student lookup failed:', sErr.message || sErr);
      return null;
    }
    if (!studentRows || !studentRows.user_id) return null;

    const { data: childRows, error: cErr } = await supabase
      .from('children')
      .select('id')
      .eq('auth_uid', String(studentRows.user_id))
      .limit(1)
      .maybeSingle();
    if (cErr) {
      console.warn('[ReadingProgression] children lookup failed:', cErr.message || cErr);
      return null;
    }
    return childRows ? childRows.id : null;
  } catch (err) {
    console.warn('[ReadingProgression] resolveChildId error:', err && err.message ? err.message : err);
    return null;
  }
}

/**
 * Thin wrapper around the database RPC that computes a student's full
 * reading progress and effective level. This delegates to the canonical
 * Postgres implementation so web and mobile share one source of truth.
 *
 * Returns the RPC response object or a safe fallback when unavailable.
 */
export async function getEffectiveReadingLevel(studentId) {
  const childId = await resolveChildIdForStudent(studentId);
  if (!childId) {
    return { status: 'no_child_mapping', effective_level: null };
  }

  try {
    const { data, error } = await supabase.rpc('get_student_reading_progress', { p_student_id: childId });
    if (error) {
      console.warn('[ReadingProgression] RPC get_student_reading_progress failed:', error.message || error);
      return { status: 'rpc_error', effective_level: null, detail: String(error) };
    }
    // Success: return status plus the RPC payload (which uses snake_case keys)
    return Object.assign({ status: 'ok' }, data || {});
  } catch (err) {
    console.warn('[ReadingProgression] RPC call failed:', err && err.message ? err.message : err);
    return { status: 'rpc_error', effective_level: null, detail: String(err) };
  }
}

export default {
  getEffectiveReadingLevel,
  resolveChildIdForStudent,
};

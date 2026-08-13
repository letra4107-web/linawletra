import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { getVisibleStudentIds } from '../utils/studentAccess.js';

const router = express.Router();

const normalizeNotification = (row = {}) => ({
  ...row,
  title: row.title || 'Notification',
  body: row.body || row.message || '',
  message: row.message || row.body || '',
  read: Boolean(row.read ?? row.is_read),
  is_read: Boolean(row.is_read ?? row.read),
  created_at: row.created_at || new Date().toISOString(),
});

const byNewest = (a, b) =>
  new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();

const uniqueRows = (...groups) => {
  const byId = new Map();
  groups.flat().filter(Boolean).forEach((row) => byId.set(String(row.id), row));
  return [...byId.values()].sort(byNewest);
};

const resolveStudentNotificationRefs = async (req) => {
  if (req.user.role === 'student') {
    const { data: student, error } = await supabase
      .from('students')
      .select('id,user_id,child_id')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (error) throw error;
    return {
      userIds: [req.user.id, student?.user_id].filter(Boolean),
      studentIds: [student?.id, student?.child_id].filter(Boolean),
    };
  }

  if (req.user.role === 'parent') {
    const visibleStudentIds = await getVisibleStudentIds(req);
    const { data: students, error } = visibleStudentIds.length
      ? await supabase.from('students').select('id,user_id,child_id').in('id', visibleStudentIds)
      : { data: [], error: null };
    if (error) throw error;
    return {
      userIds: [req.user.id, ...(students || []).map((student) => student.user_id)].filter(Boolean),
      studentIds: (students || []).flatMap((student) => [student.id, student.child_id]).filter(Boolean),
    };
  }

  return { userIds: [req.user.id].filter(Boolean), studentIds: [] };
};

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { userIds, studentIds } = await resolveStudentNotificationRefs(req);
    const queries = [];

    if (userIds.length) {
      queries.push(
        supabase.from('notifications').select('*').in('user_id', [...new Set(userIds)]).order('created_at', { ascending: false })
      );
    }
    if (studentIds.length) {
      queries.push(
        supabase.from('notifications').select('*').in('student_id', [...new Set(studentIds)]).order('created_at', { ascending: false })
      );
    }
    if (req.user.role === 'parent') {
      queries.push(
        supabase.from('notifications').select('*').eq('parent_id', req.user.id).order('created_at', { ascending: false })
      );
    }

    const results = queries.length ? await Promise.all(queries) : [];
    const error = results.find((result) => result.error)?.error;
    if (error) throw error;

    return res.json({
      success: true,
      notifications: uniqueRows(...results.map((result) => result.data || [])).map(normalizeNotification),
    });
  } catch (error) {
    console.error('[Notifications] fetch failed:', error.message || error);
    return res.status(500).json({ success: false, message: 'Unable to load notifications.' });
  }
});

router.patch('/:id/read', authMiddleware, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, message: 'notification id is required.' });

    const { userIds, studentIds } = await resolveStudentNotificationRefs(req);
    const { data: row, error: fetchError } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!row) return res.status(404).json({ success: false, message: 'Notification not found.' });

    const canUpdate =
      userIds.includes(row.user_id) ||
      studentIds.includes(row.student_id) ||
      (req.user.role === 'parent' && row.parent_id === req.user.id);

    if (!canUpdate) {
      return res.status(403).json({ success: false, message: 'You do not have permission to update this notification.' });
    }

    let { error } = await supabase
      .from('notifications')
      .update({ read: true, is_read: true })
      .eq('id', id);

    if (error && String(error.message || '').includes('is_read')) {
      const retry = await supabase.from('notifications').update({ read: true }).eq('id', id);
      error = retry.error;
    }
    if (error) throw error;

    return res.json({ success: true });
  } catch (error) {
    console.error('[Notifications] mark read failed:', error.message || error);
    return res.status(500).json({ success: false, message: 'Unable to update notification.' });
  }
});

export default router;

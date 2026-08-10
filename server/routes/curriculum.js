import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

const VALID_LEVELS = new Set(['beginner', 'intermediate', 'advanced']);
const VALID_TYPES = new Set(['word', 'phonetic', 'phrase', 'sentence', 'paragraph']);

const normalizeCsvFilter = (value, validSet) => {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => validSet.has(item));
};

router.get('/items', authMiddleware, async (req, res) => {
  try {
    const levels = normalizeCsvFilter(req.query.level, VALID_LEVELS);
    const types = normalizeCsvFilter(req.query.type, VALID_TYPES);
    const limit = Math.min(Number(req.query.limit) || 50, 250);
    const after = Number(req.query.after || 0);

    let query = supabase
      .from('curriculum_items')
      .select('*')
      .eq('is_active', true)
      .gt('sequence_no', Number.isFinite(after) ? after : 0)
      .order('sequence_no', { ascending: true })
      .limit(limit);

    if (levels.length === 1) query = query.eq('reading_level', levels[0]);
    if (levels.length > 1) query = query.in('reading_level', levels);
    if (types.length === 1) query = query.eq('item_type', types[0]);
    if (types.length > 1) query = query.in('item_type', types);

    const { data, error } = await query;
    if (error) throw error;

    return res.json({ success: true, items: data || [] });
  } catch (error) {
    console.error('[Curriculum] Failed to fetch items:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch curriculum items' });
  }
});

router.get('/requirements', authMiddleware, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('curriculum_level_requirements')
      .select('*')
      .order('reading_level', { ascending: true });

    if (error) throw error;
    return res.json({ success: true, requirements: data || [] });
  } catch (error) {
    console.error('[Curriculum] Failed to fetch requirements:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch curriculum requirements' });
  }
});

export default router;

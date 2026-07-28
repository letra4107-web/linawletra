import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// Get all practice words (used to build the offline JSON snapshot too)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('practice_words')
      .select('*')
      .order('difficulty', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;

    res.json({ success: true, words: data || [] });
  } catch (error) {
    console.error('[Practice Words] Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch practice words' });
  }
});

export default router;

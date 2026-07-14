import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { getPracticeLevel, setPracticeLevel } from '../controllers/practiceController.js';

const router = express.Router();

router.get('/:id/practice-level', authMiddleware, getPracticeLevel);
router.post('/:id/practice-level', authMiddleware, roleMiddleware('parent'), setPracticeLevel);

export default router;

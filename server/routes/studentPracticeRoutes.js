const express = require('express');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { getPracticeLevel, setPracticeLevel } = require('../controllers/practiceController');

const router = express.Router();

router.get('/:id/practice-level', authMiddleware, getPracticeLevel);
router.post('/:id/practice-level', authMiddleware, roleMiddleware('parent'), setPracticeLevel);

module.exports = router;

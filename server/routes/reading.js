import express from 'express';
import multer from 'multer';
import { createRequire } from 'module';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { compareReadingText } from '../services/readingAccuracy.js';
import { VALID_READING_LEVELS, normalizeReadingLevel, getReadingLevelRank } from '../services/readingLevels.js';

const router = express.Router();
const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const isPdf = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    if (!isPdf) return cb(new Error('Only PDF files are allowed.'));
    return cb(null, true);
  },
});

const parseAssignedStudents = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (error) {
    return String(value).split(',').map((item) => item.trim()).filter(Boolean);
  }
};

const normalizeId = (value) => (value == null ? '' : String(value).trim());

const uniqueIds = (values = []) => [...new Set(values.map(normalizeId).filter(Boolean))];

const getAssignedIds = (material = {}) => {
  const assigned = material.assigned_students || material.assignedStudents || [];
  if (Array.isArray(assigned)) return uniqueIds(assigned);
  try {
    const parsed = JSON.parse(assigned);
    return Array.isArray(parsed) ? uniqueIds(parsed) : uniqueIds([assigned]);
  } catch (error) {
    return uniqueIds(String(assigned).split(','));
  }
};

const resolveAssignedStudentIds = async (assignedStudents = []) => {
  const rawIds = uniqueIds(assignedStudents);
  if (!rawIds.length) return [];

  const { data: students, error } = await supabase
    .from('students')
    .select('id,user_id');

  if (error) {
    console.warn('[Reading] Could not expand assigned student ids:', error.message);
    return rawIds;
  }

  const expanded = [...rawIds];
  (students || []).forEach((student) => {
    const ids = uniqueIds([student.id, student.user_id]);
    if (ids.some((id) => rawIds.includes(id))) {
      expanded.push(...ids);
    }
  });

  return uniqueIds(expanded);
};

const safeFileName = (name = 'reading-material.pdf') =>
  name.replace(/[^\w.\-]+/g, '-').replace(/-+/g, '-').slice(0, 120);

const parsePdfBuffer = async (buffer) => {
  if (typeof pdfParseModule === 'function') {
    return pdfParseModule(buffer);
  }

  if (typeof pdfParseModule.default === 'function') {
    return pdfParseModule.default(buffer);
  }

  if (typeof pdfParseModule.PDFParse === 'function') {
    const parser = new pdfParseModule.PDFParse({ data: buffer });
    try {
      const textResult = await parser.getText();
      return {
        text: textResult?.text || '',
        numpages: textResult?.total || textResult?.pages?.length || 0,
      };
    } finally {
      await parser.destroy?.();
    }
  }

  throw new Error('PDF parser is not available on this server.');
};

const getCurrentStudentRecord = async (userId) => {
  const { data } = await supabase
    .from('students')
    .select('id,user_id,parent_id,teacher_id,reading_level')
    .eq('user_id', userId)
    .maybeSingle();
  return data || null;
};

const decorateMaterialForLevel = (material, studentLevel) => {
  const materialLevel = normalizeReadingLevel(material.difficulty_level || material.difficultyLevel);
  const learnerLevel = normalizeReadingLevel(studentLevel);
  return {
    ...material,
    difficulty_level: materialLevel,
    learner_reading_level: learnerLevel,
    matches_reading_level: materialLevel === learnerLevel,
    is_within_reading_level: getReadingLevelRank(materialLevel) <= getReadingLevelRank(learnerLevel),
  };
};

const userCanAccessMaterial = async (req, material) => {
  if (!material) return false;
  if (['admin', 'teacher'].includes(req.user.role)) {
    return req.user.role === 'admin' || material.uploaded_by === req.user.id || material.uploadedBy === req.user.id;
  }

  if (req.user.role === 'student') {
    const assigned = getAssignedIds(material);
    const student = await getCurrentStudentRecord(req.user.id);
    const ids = uniqueIds([req.user.id, student?.id, student?.user_id]);
    return assigned.some((id) => ids.includes(id));
  }

  if (req.user.role === 'parent') {
    const assigned = getAssignedIds(material);
    const { data: children } = await supabase
      .from('students')
      .select('id,user_id')
      .eq('parent_id', req.user.id);
    return (children || []).some((child) => uniqueIds([child.id, child.user_id]).some((id) => assigned.includes(id)));
  }

  return false;
};

router.post(
  '/preview',
  authMiddleware,
  roleMiddleware('teacher', 'admin'),
  upload.single('pdf'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'PDF file is required.' });

      const parsed = await parsePdfBuffer(req.file.buffer);
      const extractedText = (parsed.text || '').replace(/\s+\n/g, '\n').trim();
      return res.json({
        extractedText,
        pages: parsed.numpages || 0,
        needsManualText: !extractedText,
        message: extractedText
          ? 'Review the extracted text before assigning it.'
          : 'No selectable text was found. This PDF may be image-only, so paste or type the reading text.',
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  '/upload',
  authMiddleware,
  roleMiddleware('teacher', 'admin'),
  upload.single('pdf'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'PDF file is required.' });

      const { title, description = '', difficultyLevel = 'beginner', extractedText: editedText = '' } = req.body;
      const normalizedDifficulty = normalizeReadingLevel(difficultyLevel);
      if (!VALID_READING_LEVELS.includes(normalizedDifficulty)) {
        return res.status(400).json({ message: 'Difficulty must be beginner, intermediate, or advanced.' });
      }
      const assignedStudents = await resolveAssignedStudentIds(parseAssignedStudents(req.body.assignedStudents));
      const materialTitle = (title || req.file.originalname.replace(/\.pdf$/i, '')).trim();

      const parsed = await parsePdfBuffer(req.file.buffer);
      const extractedText = (editedText || parsed.text || '').replace(/\s+\n/g, '\n').trim();
      if (!extractedText) {
        return res.status(422).json({ message: 'No readable text was found. Paste or type the reading text before assigning this PDF.' });
      }

      const path = `${req.user.id}/${Date.now()}-${safeFileName(req.file.originalname)}`;
      const { error: uploadError } = await supabase.storage
        .from('reading-materials')
        .upload(path, req.file.buffer, {
          contentType: 'application/pdf',
          upsert: false,
        });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from('reading-materials').getPublicUrl(path);
      const pdfUrl = publicData?.publicUrl || path;

      const insertPayload = {
        title: materialTitle,
        description,
        pdf_url: pdfUrl,
        storage_path: path,
        extracted_text: extractedText,
        pages: parsed.numpages || 0,
        uploaded_by: req.user.id,
        assigned_students: assignedStudents,
        difficulty_level: normalizedDifficulty,
      };

      const { data, error } = await supabase
        .from('reading_materials')
        .insert(insertPayload)
        .select()
        .single();
      if (error) throw error;

      return res.status(201).json({ material: data });
    } catch (error) {
      return next(error);
    }
  }
);

router.get('/materials', authMiddleware, async (req, res, next) => {
  try {
    let query = supabase.from('reading_materials').select('*').order('created_at', { ascending: false });

    if (req.user.role === 'teacher') {
      query = query.eq('uploaded_by', req.user.id);
      const { data, error } = await query;
      if (error) throw error;
      return res.json({ materials: data || [] });
    }

    const { data, error } = await query;
    if (error) throw error;

    if (req.user.role === 'student') {
      const student = await getCurrentStudentRecord(req.user.id);
      const ids = uniqueIds([req.user.id, student?.id, student?.user_id]);
      const studentLevel = student?.reading_level || 'beginner';
      return res.json({
        studentReadingLevel: studentLevel,
        materials: (data || [])
          .filter((item) => getAssignedIds(item).some((id) => ids.includes(id)))
          .map((item) => decorateMaterialForLevel(item, studentLevel))
          .sort((a, b) => Number(b.matches_reading_level) - Number(a.matches_reading_level)),
      });
    }

    if (req.user.role === 'parent') {
      const { data: children } = await supabase.from('students').select('id,user_id').eq('parent_id', req.user.id);
      const ids = uniqueIds((children || []).flatMap((child) => [child.id, child.user_id]));
      return res.json({
        materials: (data || []).filter((item) => getAssignedIds(item).some((id) => ids.includes(id))),
      });
    }

    return res.json({ materials: req.user.role === 'admin' ? data || [] : [] });
  } catch (error) {
    return next(error);
  }
});

router.get('/materials/:id', authMiddleware, async (req, res, next) => {
  try {
    const { data: material, error } = await supabase
      .from('reading_materials')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !material) return res.status(404).json({ message: 'Reading material not found.' });

    const allowed = await userCanAccessMaterial(req, material);
    if (!allowed) return res.status(403).json({ message: 'You can only open assigned reading materials.' });

    if (req.user.role === 'student') {
      const student = await getCurrentStudentRecord(req.user.id);
      return res.json({ material: decorateMaterialForLevel(material, student?.reading_level || 'beginner') });
    }

    return res.json({ material });
  } catch (error) {
    return next(error);
  }
});

router.post('/attempts', authMiddleware, roleMiddleware('student'), async (req, res, next) => {
  try {
    const { materialId, sentence, expectedText, spokenText } = req.body;
    if (!materialId || !expectedText || !spokenText) {
      return res.status(400).json({ message: 'materialId, expectedText, and spokenText are required.' });
    }

    const { data: material, error: materialError } = await supabase
      .from('reading_materials')
      .select('*')
      .eq('id', materialId)
      .single();
    if (materialError || !material) return res.status(404).json({ message: 'Reading material not found.' });

    const allowed = await userCanAccessMaterial(req, material);
    if (!allowed) return res.status(403).json({ message: 'This material is not assigned to you.' });

    const student = await getCurrentStudentRecord(req.user.id);
    const result = compareReadingText(expectedText, spokenText);
    const payload = {
      student_id: student?.id || req.user.id,
      material_id: materialId,
      sentence: sentence || expectedText,
      expected_text: expectedText,
      spoken_text: spokenText,
      accuracy_score: result.accuracyScore,
      pronunciation_issues: result,
      completed_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('reading_attempts')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;

    return res.status(201).json({ attempt: data, result });
  } catch (error) {
    return next(error);
  }
});

router.get('/analytics', authMiddleware, roleMiddleware('teacher', 'admin', 'parent'), async (req, res, next) => {
  try {
    const { data: attempts, error } = await supabase
      .from('reading_attempts')
      .select('*, reading_materials(title, uploaded_by)')
      .order('completed_at', { ascending: false })
      .limit(500);
    if (error) throw error;

    const visible = (attempts || []).filter((attempt) => {
      if (req.user.role === 'admin') return true;
      if (req.user.role === 'teacher') return attempt.reading_materials?.uploaded_by === req.user.id;
      return true;
    });

    const averageAccuracy = visible.length
      ? Math.round(visible.reduce((sum, item) => sum + Number(item.accuracy_score || 0), 0) / visible.length)
      : 0;
    const difficultWords = visible
      .flatMap((item) => item.pronunciation_issues?.missingWords || [])
      .reduce((acc, word) => {
        acc[word] = (acc[word] || 0) + 1;
        return acc;
      }, {});

    return res.json({
      averageAccuracy,
      completedAttempts: visible.length,
      difficultWords: Object.entries(difficultWords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([word, count]) => ({ word, count })),
      attempts: visible,
    });
  } catch (error) {
    return next(error);
  }
});

export default router;



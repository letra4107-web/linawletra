const Lesson = require('../models/Lesson');

// Create lesson
exports.createLesson = async (req, res) => {
  try {
    const { title, description, level, category, content, tagalogText, difficulty } = req.body;

    const lesson = new Lesson({
      title,
      description,
      level,
      category,
      content,
      tagalogText,
      difficulty,
    });

    await lesson.save();
    res.status(201).json({ message: 'Lesson created', lesson });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get lessons by level and category
exports.getLessonsByLevelAndCategory = async (req, res) => {
  try {
    const { level, category } = req.query;

    const filter = {};
    if (level) filter.level = level;
    if (category) filter.category = category;

    const lessons = await Lesson.find(filter);
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single lesson
exports.getLesson = async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    res.json(lesson);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update lesson
exports.updateLesson = async (req, res) => {
  try {
    const lesson = await Lesson.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true }
    );

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    res.json({ message: 'Lesson updated', lesson });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete lesson
exports.deleteLesson = async (req, res) => {
  try {
    const lesson = await Lesson.findByIdAndDelete(req.params.id);

    if (!lesson) {
      return res.status(404).json({ message: 'Lesson not found' });
    }

    res.json({ message: 'Lesson deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

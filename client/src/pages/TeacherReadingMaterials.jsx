import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, FileText, Loader2, UploadCloud, Users } from 'lucide-react';
import PageLayout from '../components/layout/PageLayout';
import { authService, readingService } from '../services/api';
import { READING_LEVELS, READING_LEVEL_LABELS, normalizeReadingLevel } from '../constants/readingLevels';
import '../styles/TeacherDashboard.css';
import './ReadingAssistant.css';

const normalizeStudents = (value) => {
  const list = value?.data?.data?.students || value?.data?.students || value?.data || value || [];
  if (!Array.isArray(list)) return [];

  return list.map((student) => {
    const profile = student.user || student.users || {};
    const metadata = profile.metadata || student.metadata || {};
    const displayName =
      student.name ||
      student.full_name ||
      student.fullName ||
      student.display_name ||
      student.displayName ||
      profile.name ||
      profile.full_name ||
      profile.fullName ||
      profile.display_name ||
      profile.displayName ||
      metadata.displayName ||
      metadata.display_name ||
      [metadata.firstName, metadata.lastName].filter(Boolean).join(' ') ||
      [metadata.first_name, metadata.last_name].filter(Boolean).join(' ') ||
      student.email ||
      profile.email ||
      'Student';

    return {
      ...student,
      displayName,
    };
  });
};

export default function TeacherReadingMaterials() {
  const [students, setStudents] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [matchLevelOnly, setMatchLevelOnly] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    difficultyLevel: 'beginner',
    assignedStudents: [],
  });
  const [file, setFile] = useState(null);
  const [extractedText, setExtractedText] = useState('');
  const [previewInfo, setPreviewInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [message, setMessage] = useState('');

  const selectedStudentNames = useMemo(() => {
    if (!form.assignedStudents.length) return 'No students selected';
    return students
      .filter((student) => form.assignedStudents.includes(student.id) || form.assignedStudents.includes(student.user_id))
      .map((student) => student.displayName)
      .join(', ');
  }, [form.assignedStudents, students]);

  const visibleStudents = useMemo(() => {
    if (!matchLevelOnly) return students;
    return students.filter((student) => {
      const level = normalizeReadingLevel(student.reading_level || student.readingLevel || student.metadata?.readingLevel);
      return level === form.difficultyLevel;
    });
  }, [form.difficultyLevel, matchLevelOnly, students]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [studentResponse, materialsResponse, analyticsResponse] = await Promise.all([
        authService.getAssignedStudents().catch(() => ({ data: [] })),
        readingService.getMaterials().catch(() => ({ data: { materials: [] } })),
        readingService.getAnalytics().catch(() => ({ data: null })),
      ]);
      setStudents(normalizeStudents(studentResponse));
      setMaterials(materialsResponse?.data?.materials || []);
      setAnalytics(analyticsResponse?.data || null);
    } catch (error) {
      setMessage(error.message || 'Unable to load reading materials.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleStudent = (student) => {
    const id = student.id || student.user_id;
    setForm((current) => ({
      ...current,
      assignedStudents: current.assignedStudents.includes(id)
        ? current.assignedStudents.filter((item) => item !== id)
        : [...current.assignedStudents, id],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file) {
      setMessage('Please choose a PDF file first.');
      return;
    }

    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('title', form.title);
    formData.append('description', form.description);
    formData.append('difficultyLevel', form.difficultyLevel);
    formData.append('extractedText', extractedText);
    formData.append('assignedStudents', JSON.stringify(form.assignedStudents));

    setUploading(true);
    setMessage('');
    try {
      await readingService.uploadMaterial(formData);
      setForm({ title: '', description: '', difficultyLevel: 'beginner', assignedStudents: [] });
      setFile(null);
      setExtractedText('');
      setPreviewInfo(null);
      setMessage('Reading material uploaded and assigned.');
      await loadData();
    } catch (error) {
      setMessage(error.message || 'Upload failed. Please check the PDF and try again.');
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = async () => {
    if (!file) {
      setMessage('Please choose a PDF file first.');
      return;
    }

    const formData = new FormData();
    formData.append('pdf', file);

    setPreviewing(true);
    setMessage('');
    try {
      const response = await readingService.previewMaterial(formData);
      setExtractedText(response?.data?.extractedText || '');
      setPreviewInfo(response?.data || null);
      setMessage(response?.data?.message || 'Review the extracted text before assigning.');
    } catch (error) {
      setMessage(error.message || 'Could not preview this PDF. Paste the reading text manually.');
      setPreviewInfo({ needsManualText: true });
    } finally {
      setPreviewing(false);
    }
  };

  const handleFileChange = (event) => {
    setFile(event.target.files?.[0] || null);
    setExtractedText('');
    setPreviewInfo(null);
    setMessage('');
  };

  return (
    <PageLayout title="PDF Reading Assistant" subtitle="Upload Tagalog reading materials and monitor fluency" showSearch={false}>
      <div className="page-main reading-shell">
        <section className="headline-section reading-hero">
          <div>
            <h1>AI-guided PDF reading practice</h1>
            <p>Assign readable PDF stories, let learners listen sentence by sentence, and collect pronunciation accuracy for progress reports.</p>
          </div>
          <div className="reading-hero-actions">
            <span className="status-pill-large"><BookOpen size={18} /> {materials.length} materials</span>
            <span className="tier-pill-large"><Users size={18} /> {students.length} students</span>
          </div>
        </section>

        <div className="stats-row">
          <article className="stat-card">
            <p className="stat-title">Average accuracy</p>
            <p className="stat-value">{analytics ? `${analytics.averageAccuracy}%` : '...'}</p>
            <p className="stat-label">From saved reading attempts</p>
          </article>
          <article className="stat-card">
            <p className="stat-title">Completed reads</p>
            <p className="stat-value">{analytics?.completedAttempts || 0}</p>
            <p className="stat-label">Sentence attempts submitted</p>
          </article>
          <article className="stat-card">
            <p className="stat-title">Difficult words</p>
            <p className="stat-value">{analytics?.difficultWords?.length || 0}</p>
            <p className="stat-label">Words needing practice</p>
          </article>
          <article className="stat-card">
            <p className="stat-title">Assigned students</p>
            <p className="stat-value">{students.length}</p>
            <p className="stat-label">Available for assignments</p>
          </article>
        </div>

        <div className="reading-teacher-grid">
          <form className="reading-upload-panel" onSubmit={handleSubmit}>
            <div className="panel-header">
              <div>
                <h2>Upload PDF</h2>
                <p>PDF only, up to 12 MB. Text is extracted for sentence practice.</p>
              </div>
              <UploadCloud size={28} />
            </div>

            <label className="reading-field">
              Title
              <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Halimbawa: Ang Masayang Bata" />
            </label>
            <label className="reading-field">
              Description
              <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Short note for students" />
            </label>
            <label className="reading-field">
              Difficulty
              <select value={form.difficultyLevel} onChange={(event) => setForm((current) => ({ ...current, difficultyLevel: event.target.value }))}>
                {READING_LEVELS.map((level) => (
                  <option key={level.value} value={level.value}>{level.label}</option>
                ))}
              </select>
              <small>{READING_LEVELS.find((level) => level.value === form.difficultyLevel)?.description}</small>
            </label>
            <label className="reading-dropzone">
              <FileText size={32} />
              <span>{file ? file.name : 'Choose a PDF file'}</span>
              <input type="file" accept="application/pdf,.pdf" onChange={handleFileChange} />
            </label>
            <button type="button" className="reading-secondary-action" onClick={handlePreview} disabled={!file || previewing || uploading}>
              {previewing ? <Loader2 className="spin" size={18} /> : <FileText size={18} />}
              {previewing ? 'Extracting text...' : 'Preview extracted text'}
            </button>
            <label className="reading-field">
              Reading text for students
              <textarea
                className="reading-text-preview"
                value={extractedText}
                onChange={(event) => setExtractedText(event.target.value)}
                placeholder="Preview the PDF text here, or paste the reading text if the PDF is image-only."
              />
              <small>
                Students practice this text. Check line breaks, numbering, and syllables before assigning.
                {previewInfo?.needsManualText ? ' Image-only PDFs need manual text or OCR.' : ''}
              </small>
            </label>

            <div className="reading-field">
              <span>Assign to students</span>
              <label className="student-check level-filter-check">
                <input
                  type="checkbox"
                  checked={matchLevelOnly}
                  onChange={(event) => setMatchLevelOnly(event.target.checked)}
                />
                <span>Show only {READING_LEVEL_LABELS[form.difficultyLevel]} learners</span>
              </label>
              <div className="student-picker">
                {visibleStudents.length === 0 ? (
                  <p className="muted-copy">No students available yet.</p>
                ) : (
                  visibleStudents.map((student) => {
                    const id = student.id || student.user_id;
                    const name = student.displayName;
                    const level = normalizeReadingLevel(student.reading_level || student.readingLevel || student.user?.metadata?.readingLevel || student.users?.metadata?.readingLevel);
                    return (
                      <label key={id} className="student-check">
                        <input type="checkbox" checked={form.assignedStudents.includes(id)} onChange={() => toggleStudent(student)} />
                        <span>{name}</span>
                        <em>{READING_LEVEL_LABELS[level]}</em>
                      </label>
                    );
                  })
                )}
              </div>
              <small>{selectedStudentNames}</small>
            </div>

            {message && <div className="reading-message">{message}</div>}
            <button type="submit" className="detail-action reading-submit" disabled={uploading}>
              {uploading ? <Loader2 className="spin" size={18} /> : <UploadCloud size={18} />}
              {uploading ? 'Uploading PDF...' : 'Upload and assign'}
            </button>
          </form>

          <section className="detail-panel">
            <div className="panel-header">
              <div>
                <h2>Materials</h2>
                <p>Uploaded resources for reading practice.</p>
              </div>
            </div>
            {loading ? (
              <div className="skeleton-card" />
            ) : materials.length === 0 ? (
              <div className="empty-state">No PDF reading materials yet.</div>
            ) : (
              <div className="reading-material-list">
                {materials.map((material) => (
                  <article key={material.id} className="reading-material-card">
                    <div>
                      <h3>{material.title}</h3>
                      <p>{material.description || 'No description'}</p>
                      <span>{material.pages || 0} pages · {material.difficulty_level || 'beginner'}</span>
                    </div>
                    <a className="filter-pill active" href={material.pdf_url} target="_blank" rel="noreferrer">Open PDF</a>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </PageLayout>
  );
}

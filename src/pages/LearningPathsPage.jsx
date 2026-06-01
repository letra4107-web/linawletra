import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { readingService, studentService } from '../services/api';
import FileUploadSection from '../components/ui/FileUploadSection';
import PageLayout from '../components/layout/PageLayout';
import '../styles/TeacherDashboard.css';

const normalizeStudent = (student = {}) => {
  const user = student.user || student.users || {};
  const metadata = user.metadata || student.metadata || {};
  const id = student.id || student.student_id || student._id;
  const userId = student.user_id || user.id || id;
  const name =
    student.name ||
    user.name ||
    metadata.displayName ||
    [metadata.firstName, metadata.lastName].filter(Boolean).join(' ') ||
    student.email ||
    user.email ||
    'Student';

  return {
    ...student,
    id,
    userId,
    name,
    readingLevel: student.reading_level || student.readingLevel || metadata.readingLevel || 'beginner',
  };
};

const buildLearningPaths = (students = [], materials = []) => {
  const safeMaterials = Array.isArray(materials) ? materials : [];
  return (Array.isArray(students) ? students : []).map((student) => {
    const assignedMaterials = safeMaterials.filter((material) => {
      const assigned = material.assigned_students || material.assignedStudents || [];
      return assigned.includes(student.id) || assigned.includes(student.userId);
    });

    return {
      id: student.id,
      userId: student.userId,
      studentName: student.name,
      title: `${student.readingLevel.charAt(0).toUpperCase()}${student.readingLevel.slice(1)} Reading Path`,
      lessonCount: assignedMaterials.length,
      completedLessons: 0,
      tier: student.readingLevel || 'beginner',
      materials: assignedMaterials,
    };
  });
};

export default function LearningPathsPage() {
  const [learningPaths, setLearningPaths] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const navigate = useNavigate();
  const { pathId } = useParams();

  useEffect(() => {
    const loadPaths = async () => {
      setLoading(true);
      setError(false);
      try {
        const [studentsResponse, materialsResponse] = await Promise.all([
          studentService.getAllStudents(),
          readingService.getMaterials().catch(() => ({ data: { materials: [] } })),
        ]);
        const students = (studentsResponse?.data || []).map(normalizeStudent);
        const materials = materialsResponse?.data?.materials || materialsResponse?.data || [];
        setLearningPaths(buildLearningPaths(students, materials));
      } catch (err) {
        console.error('LearningPaths error:', err);
        setLearningPaths([]);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    loadPaths();
  }, []);

  const visiblePaths = useMemo(() => {
    return learningPaths.filter((path) => {
      if (filter === 'All') return true;
      if (filter === 'Active') return (path.completedLessons || 0) < (path.lessonCount || 0);
      return (path.completedLessons || 0) >= (path.lessonCount || 0);
    });
  }, [learningPaths, filter]);

  const selectedPath = useMemo(() => {
    if (!pathId) return null;
    return learningPaths.find((path) => String(path.id) === pathId || String(path.userId) === pathId);
  }, [learningPaths, pathId]);

  const renderPathDetail = () => {
    if (loading) {
      return <div className="skeleton-card" />;
    }

    if (!selectedPath) {
      return (
        <div className="empty-state">
          <div className="empty-title">Learning path not found</div>
          <p className="empty-copy">Go back to the list and choose one of your assigned students.</p>
          <button type="button" className="detail-action" onClick={() => navigate('/teacher/learning-paths')}>
            Back to paths
          </button>
        </div>
      );
    }

    const progress = Math.round(((selectedPath.completedLessons || 0) / Math.max(selectedPath.lessonCount || 1, 1)) * 100);
    const pathIdValue = selectedPath.id || selectedPath.userId;

    return (
      <section className="detail-panel">
        <div className="detail-header">
          <div>
            <h2>{selectedPath.title}</h2>
            <p>{selectedPath.studentName}'s personalized reading path</p>
          </div>
          <button type="button" className="detail-action" onClick={() => navigate('/teacher/learning-paths')}>
            Back to paths
          </button>
        </div>

        <div className="detail-top-row">
          <div className="detail-avatar-large">{(selectedPath.studentName || 'S').charAt(0)}</div>
          <div className="detail-info-block">
            <div className="detail-name">{selectedPath.studentName || 'Student'}</div>
            <div className="detail-meta-row">{selectedPath.lessonCount || 0} assigned reading materials</div>
          </div>
          <span className="tier-pill">{selectedPath.tier || 'beginner'}</span>
        </div>

        <div className="detail-block">
          <div className="detail-block-title">Progress</div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="detail-meta-row">{progress}% complete</div>
        </div>

        <div className="detail-block">
          <div className="detail-block-title">Assigned materials</div>
          {selectedPath.materials?.length ? (
            selectedPath.materials.map((material) => (
              <p key={material.id || material._id || material.title} className="learning-path-text">
                {material.title || material.name || material.file_name || 'Reading material'}
              </p>
            ))
          ) : (
            <p className="learning-path-text">No reading materials have been assigned to this path yet.</p>
          )}
        </div>

        <FileUploadSection
          pageSource="learning-paths"
          linkedId={pathIdValue}
          category="reference"
          title="Reference Materials"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
          emptyText="Upload reading materials or reference guides for this path."
        />
      </section>
    );
  };

  return (
    <PageLayout
      title="Learning Paths"
      subtitle="Personalized paths assigned to your students"
      showSearch={false}
    >
      <div className="page-main">
        <section className="headline-section">
          <div>
            <h1>Learning Paths</h1>
            <p>Personalized paths assigned to your students</p>
          </div>
          {!pathId && <div className="filter-tabs">
            {['All', 'Active', 'Completed'].map((option) => (
              <button
                key={option}
                type="button"
                className={`filter-pill${filter === option ? ' active' : ''}`}
                onClick={() => setFilter(option)}
              >
                {option}
              </button>
            ))}
          </div>}
        </section>

        <section className="categories-row">
          {pathId ? (
            renderPathDetail()
          ) : error ? (
            <div className="empty-state">
              <div className="empty-title">Unable to load learning paths</div>
              <p className="empty-copy">Please refresh the page or try again later.</p>
            </div>
          ) : loading ? (
            Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton-card" />)
          ) : visiblePaths.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No learning paths found</div>
              <p className="empty-copy">Create a new path or assign one to your students.</p>
            </div>
          ) : (
            visiblePaths.map((path) => {
              const progress = Math.round(((path.completedLessons || 0) / Math.max(path.lessonCount || 1, 1)) * 100);
              const pathId = path.id || path._id;
              return (
                <div key={pathId} className="detail-block">
                  <div className="detail-top-row">
                    <div className="detail-avatar-large">{(path.studentName || 'S').charAt(0)}</div>
                    <div className="detail-info-block">
                      <div className="detail-name">{path.studentName || 'Student'}</div>
                      <div className="detail-meta-row">{path.title || 'Learning path'} · {path.lessonCount || 0} lessons</div>
                    </div>
                    <span className="tier-pill">{path.tier || 'Tier 1'}</span>
                  </div>
                  <div>
                    <div className="detail-block-title">{path.title || 'Path title'}</div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="detail-meta-row">{progress}% complete</div>
                    <button
                      type="button"
                      className="detail-action"
                      onClick={() => navigate(`/teacher/learning-paths/${pathId}`)}
                    >
                      Open path
                    </button>
                  </div>
                  <FileUploadSection
                    pageSource="learning-paths"
                    linkedId={pathId}
                    category="reference"
                    title="Reference Materials"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    emptyText="Upload reading materials or reference guides for this path."
                  />
                </div>
              );
            })
          )}
        </section>
      </div>
    </PageLayout>
  );
}

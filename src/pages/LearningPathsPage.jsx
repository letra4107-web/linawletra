import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// Learning paths API to be implemented
import FileUploadSection from '../components/ui/FileUploadSection';
import PageLayout from '../components/layout/PageLayout';
import '../styles/TeacherDashboard.css';

export default function LearningPathsPage() {
  const [learningPaths, setLearningPaths] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) navigate('/login');
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const loadPaths = async () => {
      setLoading(true);
      setError(false);
      try {
        const data = await getLearningPaths();
        setLearningPaths(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('LearningPaths error:', err.code, err.message);
        setLearningPaths([]);
        setError(false);
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
          <div className="filter-tabs">
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
          </div>
        </section>

        <section className="categories-row">
          {loading ? (
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
                      onClick={() => navigate(`/learning-paths/${pathId}`)}
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

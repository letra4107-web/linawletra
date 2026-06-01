import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { lessonService } from '../services/api';
import FileUploadSection from '../components/ui/FileUploadSection';
import PageLayout from '../components/layout/PageLayout';
import '../styles/TeacherDashboard.css';

const TIERS = ['All', 'Tier 1', 'Tier 2', 'Tier 3'];

export default function TeacherLessonsPage() {
  const [lessons, setLessons] = useState([]);
  const [filter, setFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedLesson, setExpandedLesson] = useState(null);
  const [lessonFileCounts, setLessonFileCounts] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    const loadLessons = async () => {
      setLoading(true);
      setError(false);
      try {
        const response = await lessonService.getLessons();
        const data = response?.data?.lessons || response?.data?.data?.lessons || response?.data || [];
        setLessons(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
        setLessons([]);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    loadLessons();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadCounts = async () => {
      const counts = {};
      lessons.forEach((lesson) => {
        const lessonId = lesson.id || lesson._id;
        if (lessonId) counts[lessonId] = lesson.fileCount || lesson.files?.length || 0;
      });
      if (isMounted) setLessonFileCounts(counts);
    };

    if (!loading && lessons.length) {
      loadCounts();
    }

    return () => {
      isMounted = false;
    };
  }, [lessons, loading]);

  const visibleLessons = useMemo(() => {
    return lessons.filter((lesson) => {
      const tier = lesson.tier || lesson.level || lesson.difficulty || 'Tier 1';
      return filter === 'All' || tier === filter;
    });
  }, [lessons, filter]);

  return (
    <PageLayout
      title="Lessons"
      subtitle="Create, review, and assign lessons to students"
      showSearch={false}
    >
      <div className="page-main">
        <section className="headline-section">
          <div>
            <h1>Lessons</h1>
            <p>Create, review, and assign lessons to students</p>
          </div>
          <div className="filter-tabs">
            {TIERS.map((tier) => (
              <button
                key={tier}
                type="button"
                className={`filter-pill${filter === tier ? ' active' : ''}`}
                onClick={() => setFilter(tier)}
              >
                {tier}
              </button>
            ))}
          </div>
        </section>

        <section className="student-cards">
          {loading ? (
            Array.from({ length: 6 }).map((_, index) => <div key={index} className="skeleton-card" />)
          ) : error ? (
            <div className="empty-state">
              <div className="empty-title">Unable to load lessons</div>
              <p className="empty-copy">Please try again later.</p>
            </div>
          ) : visibleLessons.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No lessons available</div>
              <p className="empty-copy">Create a new lesson to assign to your learners.</p>
            </div>
          ) : (
            visibleLessons.map((lesson) => {
              const lessonId = lesson.id || lesson._id;
              return (
                <div key={lessonId}>
                  <div className={`student-card ${expandedLesson === lessonId ? 'selected' : ''}`}>
                    <div className="student-card-left">
                      <div className="student-avatar">{(lesson.title || 'L').charAt(0)}</div>
                      <div>
                        <div className="student-name">{lesson.title || 'Untitled lesson'}</div>
                        <div className="student-meta">{lesson.description || 'No description available'}</div>
                      </div>
                    </div>
                    <div className="student-card-right">
                      <span className="filter-pill">📎 {lessonFileCounts[lessonId] ?? 0} files</span>
                      <button
                        type="button"
                        className="filter-pill"
                        onClick={() => setExpandedLesson((prev) => (prev === lessonId ? null : lessonId))}
                      >
                        {expandedLesson === lessonId ? '▲ Hide Files' : '📎 Manage Files'}
                      </button>
                      <button
                        type="button"
                        className="detail-action"
                        onClick={() => navigate(`/lessons/${lessonId}`)}
                      >
                        View
                      </button>
                    </div>
                  </div>
                  {expandedLesson === lessonId && (
                    <FileUploadSection
                      pageSource="lessons"
                      linkedId={lessonId}
                      category="lesson"
                      title="Lesson Plan Files"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.pptx"
                      emptyText="No lesson files uploaded yet. Add lesson plans, worksheets, or materials."
                    />
                  )}
                </div>
              );
            })
          )}
        </section>
      </div>
    </PageLayout>
  );
}

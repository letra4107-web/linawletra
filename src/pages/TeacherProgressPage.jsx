import React, { useEffect, useMemo, useState } from 'react';
import { progressService, readingService } from '../services/api';
import PageLayout from '../components/layout/PageLayout';
import '../styles/TeacherDashboard.css';

const TREND_LABELS = {
  up: 'Improving',
  down: 'Needs support',
  stable: 'Steady',
};

const parseFirestoreDate = (value) => {
  if (!value) return new Date(0);
  if (value?.toDate) return value.toDate();
  return new Date(value);
};

export default function TeacherProgressPage() {
  const [reports, setReports] = useState([]);
  const [filter, setFilter] = useState('All Time');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [phonemicById, setPhonemicById] = useState({});

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true);
      setError(false);
      try {
        const response = await progressService.getProgressReports();
        const data = response?.data?.reports || response?.data || [];
        setReports(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Progress error:', err);
        setReports([]);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    loadReports();
  }, []);

  const visibleReports = useMemo(() => {
    if (filter === 'All Time') return reports;
    const days = filter === 'This Month' ? 30 : 7;
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
    return reports.filter((report) => parseFirestoreDate(report.date).getTime() >= threshold);
  }, [reports, filter]);

  const toggleExpand = async (report) => {
    const id = report.id;
    const studentId = report.studentId || report.student_id;
    setExpandedId((prev) => (prev === id ? null : id));
    if (!studentId || phonemicById[studentId]) return;
    try {
      const [masteryRes, confusionRes] = await Promise.all([
        readingService.getWordMastery(studentId).catch(() => null),
        readingService.getConfusionPatterns(studentId).catch(() => null),
      ]);
      const counts = masteryRes?.data?.counts || masteryRes?.counts || null;
      const patterns = confusionRes?.data?.patterns || confusionRes?.patterns || [];
      setPhonemicById((prev) => ({ ...prev, [studentId]: { counts, patterns } }));
    } catch (err) {
      console.warn('Failed to load phonemic data for student:', studentId, err.message);
    }
  };

  const groupedReports = useMemo(() => {
    return visibleReports.reduce((result, report) => {
      const dateKey = parseFirestoreDate(report.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      if (!result[dateKey]) result[dateKey] = [];
      result[dateKey].push(report);
      return result;
    }, {});
  }, [visibleReports]);

  return (
    <PageLayout
      title="Progress Reports"
      subtitle="Track student growth and identify learning gaps"
      showSearch={false}
    >
      <div className="page-main">
        <section className="headline-section">
          <div>
            <h1>Progress Reports</h1>
            <p>Track student growth and identify learning gaps</p>
          </div>
          <div className="filter-tabs">
            {['This Week', 'This Month', 'All Time'].map((option) => (
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

        {loading ? (
          <section className="student-cards">
            {Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton-card" />)}
          </section>
        ) : error ? (
          <div className="empty-state">
            <div className="empty-title">Unable to load progress reports</div>
            <p className="empty-copy">Please refresh the page or try again later.</p>
          </div>
        ) : visibleReports.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No progress reports found</div>
            <p className="empty-copy">Reports appear once students complete assessments.</p>
          </div>
        ) : (
          <div className="sessions-section">
            {Object.entries(groupedReports).map(([date, reportsByDate]) => (
              <div key={date}>
                <div className="detail-block-title">{date}</div>
                {reportsByDate.map((report) => {
                  const trend = (report.trend || 'stable').toLowerCase();
                  const studentId = report.studentId || report.student_id;
                  const phonemic = phonemicById[studentId];
                  return (
                    <div
                      key={report.id || report._id}
                      className="session-row"
                      onClick={() => toggleExpand(report)}
                    >
                      <div>
                        <div className="detail-name">{report.studentName || 'Student'}</div>
                        <div className="detail-meta-row">Grade {report.grade || '1'}</div>
                      </div>
                      <div className="detail-badges">
                        <span className="tier-pill">{TREND_LABELS[trend] || 'Stable'}</span>
                        <span className="student-score">{report.overallScore != null ? `${report.overallScore}%` : '—'}</span>
                      </div>
                      {expandedId === report.id && (
                        <div className="categories-row">
                          {Object.entries(report.categories || {}).map(([category, score]) => {
                            const scoreValue = Number(score) || 0;
                            return (
                              <div key={category} className="category-card">
                                <div className="category-header">
                                  <div className="category-icon" />
                                  <div>
                                    <div className="category-label">{category}</div>
                                    <div className="category-status">{scoreValue >= 80 ? 'Secure' : scoreValue >= 60 ? 'Developing' : 'Emerging'}</div>
                                  </div>
                                </div>
                                <div className="category-score">{scoreValue}%</div>
                                <div className="category-track">
                                  <div className="category-fill" style={{ width: `${scoreValue}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {expandedId === report.id && (
                        <div className="phonemic-row">
                          <div className="detail-block-title">Word mastery &amp; sound patterns</div>
                          {phonemic ? (
                            <>
                              <div className="phonemic-counts">
                                <span className="mastery-chip mastery-chip--mastered">Mastered: {phonemic.counts?.mastered ?? 0}</span>
                                <span className="mastery-chip mastery-chip--practice">Needs practice: {phonemic.counts?.needsPractice ?? 0}</span>
                                <span className="mastery-chip mastery-chip--difficult">Difficult: {phonemic.counts?.difficult ?? 0}</span>
                              </div>
                              {phonemic.patterns?.length > 0 ? (
                                <div className="phonemic-confusions">
                                  {phonemic.patterns.slice(0, 5).map((pattern) => (
                                    <span key={pattern.pattern_type} className="tier-pill">
                                      {String(pattern.pattern_type || '').replace(/_/g, ' ')} · {pattern.occurrence_count}x
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="empty-copy">No recurring sound confusions detected yet.</p>
                              )}
                            </>
                          ) : (
                            <p className="empty-copy">Loading phonemic data…</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

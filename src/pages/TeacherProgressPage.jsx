import React, { useEffect, useMemo, useState } from 'react';
import { progressService } from '../services/api';
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
                  return (
                    <div
                      key={report.id || report._id}
                      className="session-row"
                      onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
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

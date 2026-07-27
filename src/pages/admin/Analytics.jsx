import React, { useEffect, useMemo, useState } from 'react';
import { adminService, studentService } from '../../services/api';
import { ACHIEVEMENTS } from '../../services/achievementService';
import AchievementBadge from '../../components/AchievementBadge';

const formatNumber = (value) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '0';
  return Number(value).toLocaleString();
};

export default function Analytics() {
  const [analytics, setAnalytics] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [badgeStats, setBadgeStats] = useState(null);
  const [badgeStatsLoading, setBadgeStatsLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await adminService.getAnalytics();
        setAnalytics(response.data || response || {});
      } catch (err) {
        setError('Unable to load analytics data.');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  useEffect(() => {
    const fetchBadgeStats = async () => {
      setBadgeStatsLoading(true);
      try {
        const response = await studentService.getAllStudents();
        const students = Array.isArray(response.data) ? response.data : [];
        const counts = {};
        ACHIEVEMENTS.forEach((achievement) => { counts[achievement.id] = 0; });
        let totalUnlocked = 0;
        students.forEach((student) => {
          const unlockedIds = student.user?.metadata?.unlockedAchievementIds || [];
          unlockedIds.forEach((id) => {
            if (counts[id] !== undefined) {
              counts[id] += 1;
              totalUnlocked += 1;
            }
          });
        });
        setBadgeStats({
          studentCount: students.length,
          totalUnlocked,
          counts,
        });
      } catch (err) {
        setBadgeStats(null);
      } finally {
        setBadgeStatsLoading(false);
      }
    };

    fetchBadgeStats();
  }, []);

  const trend = useMemo(() => {
    return analytics?.enrollmentTrends || [12, 18, 22, 30, 27, 34, 42];
  }, [analytics]);

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <h2>Analytics</h2>
          <p>Visualize course performance, enrollment patterns, and usage statistics.</p>
        </div>
        <span className="pill">Insights</span>
      </div>

      {error && <div className="dashboard-banner dashboard-banner-error">{error}</div>}

      <div className="summary-grid">
        <article className="summary-card">
          <p className="summary-card-label">Monthly active users</p>
          <strong className="summary-card-value">{formatNumber(analytics?.activeUsers)}</strong>
        </article>
        <article className="summary-card">
          <p className="summary-card-label">Average score</p>
          <strong className="summary-card-value">{formatNumber(analytics?.averageProgressScore)}</strong>
        </article>
        <article className="summary-card">
          <p className="summary-card-label">Completion rate</p>
          <strong className="summary-card-value">{formatNumber(analytics?.completionRate)}%</strong>
        </article>
        <article className="summary-card">
          <p className="summary-card-label">Reading engagement</p>
          <strong className="summary-card-value">{formatNumber(analytics?.readingEngagement)}%</strong>
        </article>
      </div>

      <div className="dashboard-grid-two">
        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>Enrollment trends</h3>
              <p>Recent weekly sign-ups and engagement movement.</p>
            </div>
          </div>
          <div className="line-chart">
            {loading ? (
              <div className="chart-skeleton" />
            ) : (
              trend.map((value, index) => (
                <div key={index} className="chart-bar" style={{ height: `${Math.round((value / Math.max(...trend, 1)) * 100)}%` }}>
                  <span>{value}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>Progress metrics</h3>
              <p>Assess student performance and system usage in a single view.</p>
            </div>
          </div>
          <div className="performance-list">
            <div className="performance-item">
              <p>Average progress</p>
              <strong>{formatNumber(analytics?.averageProgressScore)}%</strong>
            </div>
            <div className="performance-item">
              <p>Lesson completion</p>
              <strong>{formatNumber(analytics?.completionRate)}%</strong>
            </div>
            <div className="performance-item">
              <p>Session duration</p>
              <strong>{formatNumber(analytics?.averageSessionMinutes)} min</strong>
            </div>
          </div>
          <div className="performance-chart">
            {(analytics?.readingAnalytics || []).length ? (
              analytics.readingAnalytics.map((item) => (
                <div key={item.label} className="performance-step">
                  <span>{item.label}</span>
                  <strong>{item.value}%</strong>
                </div>
              ))
            ) : (
              <p className="empty-state-text">No reading analytics available.</p>
            )}
          </div>
        </div>
      </div>

      <div className="card-panel">
        <div className="section-heading">
          <div>
            <h3>Badge unlocks</h3>
            <p>How many students across the platform have earned each achievement badge.</p>
          </div>
          {badgeStats && (
            <span className="pill">{formatNumber(badgeStats.totalUnlocked)} total unlocks · {formatNumber(badgeStats.studentCount)} students</span>
          )}
        </div>
        {badgeStatsLoading ? (
          <div className="chart-skeleton" />
        ) : !badgeStats ? (
          <p className="empty-state-text">Unable to load badge statistics.</p>
        ) : (
          <div className="achievement-badge-grid">
            {[...ACHIEVEMENTS]
              .sort((a, b) => (badgeStats.counts[b.id] || 0) - (badgeStats.counts[a.id] || 0))
              .map((achievement) => (
                <div key={achievement.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <AchievementBadge achievement={achievement} unlocked={(badgeStats.counts[achievement.id] || 0) > 0} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4F46E5' }}>
                    {formatNumber(badgeStats.counts[achievement.id] || 0)} students
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

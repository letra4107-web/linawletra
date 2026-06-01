import React, { useEffect, useState } from 'react';
import { adminService } from '../../services/api';

const formatNumber = (value) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '0';
  return Number(value).toLocaleString();
};

const normalizeDate = (value) => {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function Overview() {
  const [overview, setOverview] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchOverview = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await adminService.getOverview();
        setOverview(response.data || response || {});
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Unable to load overview data.');
      } finally {
        setLoading(false);
      }
    };

    fetchOverview();
  }, []);

  const overviewCards = [
    { label: 'Total users', value: overview?.totalUsers },
    { label: 'Total students', value: overview?.totalStudents },
    { label: 'Total teachers', value: overview?.totalTeachers },
    { label: 'Total parents', value: overview?.totalParents },
    { label: 'Active users', value: overview?.activeUsers },
    { label: 'Pending approvals', value: overview?.pendingApprovals },
  ];

  const recentActivities = overview?.recentActivities || overview?.activities || [];

  return (
    <section className="dashboard-section overview-section">
      <div className="section-heading">
        <div>
          <h2>Overview</h2>
          <p>Core metrics for your platform, measured in real time.</p>
        </div>
      </div>

      {error && <div className="dashboard-banner dashboard-banner-error">{error}</div>}

      <div className="summary-grid">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => <div key={index} className="summary-card summary-card-skeleton" />)
          : overviewCards.map((card) => (
              <article key={card.label} className="summary-card">
                <p className="summary-card-label">{card.label}</p>
                <strong className="summary-card-value">{formatNumber(card.value)}</strong>
              </article>
            ))}
      </div>

      <div className="dashboard-grid-two">
        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>Platform statistics</h3>
              <p>Live counts, completion metrics, and operational health.</p>
            </div>
            <span className="pill small">Stats</span>
          </div>
          <div className="status-grid dashboard-status-grid">
            <div>
              <span>Course completion</span>
              <strong>{formatNumber(overview?.completionRate)}%</strong>
            </div>
            <div>
              <span>Total progress records</span>
              <strong>{formatNumber(overview?.totalProgress)}</strong>
            </div>
            <div>
              <span>Average score</span>
              <strong>{formatNumber(overview?.averageScore)}</strong>
            </div>
            <div>
              <span>System health</span>
              <strong>{overview?.systemHealth || 'Healthy'}</strong>
            </div>
          </div>
        </div>

        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>Quick activity summary</h3>
              <p>Recent admin events and platform activity at a glance.</p>
            </div>
            <span className="pill small">Activity</span>
          </div>
          <ul className="alert-list">
            {loading
              ? Array.from({ length: 4 }).map((_, index) => (
                  <li key={index} className="empty-state-card">Loading activity...</li>
                ))
              : recentActivities.length
              ? recentActivities.slice(0, 6).map((item, index) => (
                  <li key={item.id || index}>
                    <div>
                      <strong>{item.title || item.action || 'Activity event'}</strong>
                      <small>{item.subtitle || item.description || normalizeDate(item.createdAt)}</small>
                    </div>
                    <span>{normalizeDate(item.createdAt)}</span>
                  </li>
                ))
              : (
                <li className="empty-state-card">No recent activity available.</li>
              )}
          </ul>
        </div>
      </div>
    </section>
  );
}

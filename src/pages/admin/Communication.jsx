import React, { useEffect, useState } from 'react';
import { adminService } from '../../services/api';

const formatDate = (value) => {
  if (!value) return 'No data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No data';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const typeLabels = {
  practice: 'Practice result',
  xp: 'XP update',
  achievement: 'Achievement unlocked',
  lesson: 'Lesson activity',
  general: 'General',
};

export default function Communication() {
  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadNotifications = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await adminService.getNotifications({ type: typeFilter, page: 1, limit: 50 });
        const payload = response.data || response;
        setNotifications(Array.isArray(payload?.notifications) ? payload.notifications : []);
        setPagination(payload?.pagination || { page: 1, limit: 50, total: 0, pages: 1 });
      } catch (err) {
        setNotifications([]);
        setError(err?.response?.data?.message || err?.message || 'Could not load notification history.');
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();
  }, [typeFilter]);

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <h2>Communication</h2>
          <p>Read-only history of user-facing notifications: lesson activity, practice results, XP, and achievement unlocks.</p>
        </div>
        <span className="pill">Activity History</span>
      </div>

      {error && <div className="dashboard-banner dashboard-banner-error">{error}</div>}

      <div className="panel-grid panel-grid-single">
        <div className="card-panel">
          <div className="field-grid">
            <label>
              Notification type
              <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="all">All types</option>
                <option value="practice">Practice result</option>
                <option value="xp">XP update</option>
                <option value="achievement">Achievement unlocked</option>
                <option value="lesson">Lesson activity</option>
                <option value="general">General</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="card-panel">
        <div className="section-heading">
          <div>
            <h3>Notification history</h3>
            <p>Most recent user activity and system notifications.</p>
          </div>
          <span className="pill small">{pagination.total ?? notifications.length} notifications</span>
        </div>
        <div className="table-scroll">
          {loading ? (
            <div className="list-skeleton">Loading notifications...</div>
          ) : (
            <table className="simple-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Notification</th>
                  <th>Type</th>
                  <th>Date / time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {notifications.length === 0 ? (
                  <tr>
                    <td colSpan="5">No notification history found.</td>
                  </tr>
                ) : notifications.map((item) => (
                  <tr key={item.id}>
                    <td>{item.userName}{item.userEmail ? ` (${item.userEmail})` : ''}</td>
                    <td>
                      <strong>{item.title || 'Notification'}</strong>
                      <div style={{ opacity: 0.75, fontSize: '0.85em' }}>{item.message}</div>
                    </td>
                    <td>{typeLabels[item.type] || item.type}</td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td>{item.isRead ? 'Read' : 'Unread'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

import React, { useEffect, useState } from 'react';
import { adminService } from '../../services/api';

const announcementsSample = [
  { id: 1, title: 'New lesson release', date: '2026-05-14', summary: 'Reading module 4 is now available.' },
  { id: 2, title: 'Maintenance window', date: '2026-05-10', summary: 'Scheduled update at 11PM.' },
];

export default function Communication() {
  const [notifications, setNotifications] = useState(announcementsSample);
  const [messages] = useState([
    { id: 1, from: 'Parent', subject: 'Student progress question', received: 'May 15' },
    { id: 2, from: 'Teacher', subject: 'Lesson content update', received: 'May 14' },
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadNotifications = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await adminService.getNotifications();
        const payload = response.data || response;
        if (Array.isArray(payload) && payload.length) {
          setNotifications(payload);
        }
      } catch (err) {
        setError('Notification service is unavailable.');
      } finally {
        setLoading(false);
      }
    };

    loadNotifications();
  }, []);

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <h2>Communication</h2>
          <p>Manage announcements, messages, and parent-teacher communication streams.</p>
        </div>
        <span className="pill">Community</span>
      </div>

      {error && <div className="dashboard-banner dashboard-banner-error">{error}</div>}

      <div className="panel-grid">
        <div className="card-panel communication-card">
          <h3>Announcements</h3>
          {loading ? (
            <div className="list-skeleton">Loading announcements…</div>
          ) : (
            <ul>
              {notifications.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.summary}</small>
                  </div>
                  <span>{item.date}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card-panel communication-card">
          <h3>Messages</h3>
          <ul>
            {messages.map((message) => (
              <li key={message.id}>
                <div>
                  <strong>{message.subject}</strong>
                  <small>{message.from}</small>
                </div>
                <span>{message.received}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

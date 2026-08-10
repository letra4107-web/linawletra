import React, { useEffect, useState } from 'react';
import { adminService } from '../../services/api';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await adminService.getReports();
        const payload = response.data || response;
        const list = Array.isArray(payload?.reports)
          ? payload.reports
          : Array.isArray(payload?.reportData)
            ? payload.reportData
            : Array.isArray(payload)
              ? payload
              : [];
        setReports(list);
      } catch (err) {
        setReports([]);
        setError(err?.response?.data?.message || err?.message || 'Reports service is unavailable.');
      } finally {
        setLoading(false);
      }
    };

    loadReports();
  }, []);

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <h2>Reports</h2>
          <p>Download performance insights, progress summaries, and export data sets.</p>
        </div>
        <span className="pill">Reporting</span>
      </div>

      {error && <div className="dashboard-banner dashboard-banner-error">{error}</div>}

      <div className="status-grid dashboard-status-grid">
        <div>
          <span>Export ready</span>
          <strong>{reports.length}</strong>
        </div>
        <div>
          <span>Source</span>
          <strong>Lesson Progress</strong>
        </div>
        <div>
          <span>Completed</span>
          <strong>{reports.filter((report) => String(report.status || '').toLowerCase() === 'completed').length}</strong>
        </div>
        <div>
          <span>Average score</span>
          <strong>
            {(() => {
              const scores = reports.map((report) => Number(report.score)).filter((score) => Number.isFinite(score));
              if (!scores.length) return '0';
              return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
            })()}
          </strong>
        </div>
      </div>

      <div className="card-panel">
        <div className="section-heading">
          <div>
          <h3>Lesson progress reports</h3>
          <p>Real records from student lesson progress.</p>
          </div>
        </div>
        <ul className="alert-list">
          {loading ? (
            <li className="empty-state-card">Loading reports...</li>
          ) : reports.length ? (
            reports.map((report) => (
              <li key={report.id}>
                <div>
                  <strong>{report.student || 'Student'} - {report.lesson || 'Lesson'}</strong>
                  <small>
                    {report.status || 'No status'} | Score: {report.score ?? 'No data'} | Updated: {report.lastUpdated || 'No date'}
                  </small>
                </div>
                <span className="pill small">{report.percentageComplete ?? '0'}%</span>
              </li>
            ))
          ) : (
            <li className="empty-state-card">No lesson progress reports found.</li>
          )}
        </ul>
      </div>
    </section>
  );
}

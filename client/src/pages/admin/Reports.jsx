import React, { useEffect, useState } from 'react';
import { adminService } from '../../services/api';

const placeholderReports = [
  { id: 1, label: 'Monthly performance', type: 'PDF' },
  { id: 2, label: 'Student progress export', type: 'CSV' },
  { id: 3, label: 'Teacher activity summary', type: 'PDF' },
];

export default function Reports() {
  const [reports, setReports] = useState(placeholderReports);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await adminService.getReports();
        const payload = response.data || response;
        if (Array.isArray(payload) && payload.length) {
          setReports(payload);
        }
      } catch (err) {
        setError('Reports service is unavailable. Showing default exports.');
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
          <span>Available formats</span>
          <strong>CSV, PDF</strong>
        </div>
        <div>
          <span>Last generated</span>
          <strong>Today</strong>
        </div>
        <div>
          <span>Report quality</span>
          <strong>Premium</strong>
        </div>
      </div>

      <div className="card-panel">
        <div className="section-heading">
          <div>
            <h3>Downloadable reports</h3>
            <p>Export student progress, system summaries, and admin performance outputs.</p>
          </div>
        </div>
        <ul className="alert-list">
          {(loading ? placeholderReports : reports).map((report) => (
            <li key={report.id}>
              <div>
                <strong>{report.label}</strong>
                <small>{report.type} file</small>
              </div>
              <button type="button" className="btn-secondary">Download</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

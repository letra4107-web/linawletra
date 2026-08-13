import React, { useEffect, useState } from 'react';
import { adminService } from '../../services/api';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState({});
  const [typeFilter, setTypeFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await adminService.getReports({ type: typeFilter, limit: 100 });
        const payload = response.data || response;
        const list = Array.isArray(payload?.reports)
          ? payload.reports
          : Array.isArray(payload?.reportData)
            ? payload.reportData
            : Array.isArray(payload)
              ? payload
              : [];
        setReports(list);
        setSummary(payload?.summary || {});
      } catch (err) {
        setReports([]);
        setSummary({});
        setError(err?.response?.data?.message || err?.message || 'Reports service is unavailable.');
      } finally {
        setLoading(false);
      }
    };

    loadReports();
  }, [typeFilter]);

  const handleDownloadStudentPdf = async (report) => {
    if (!report?.studentId) return;

    try {
      const response = await adminService.downloadStudentReportPdf(report.studentId);
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `student-report-${report.studentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to download the student PDF report.');
    }
  };

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

      <div className="panel-grid panel-grid-single">
        <div className="card-panel">
          <div className="field-grid">
            <label>
              Report type
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">All reports</option>
                <option value="student">Student report</option>
                <option value="teacher">Teacher report</option>
                <option value="curriculum">Curriculum report</option>
                <option value="progress">Progress report</option>
                <option value="assessment">Assessment report</option>
                <option value="account">Account/user report</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="status-grid dashboard-status-grid">
        <div>
          <span>Export ready</span>
          <strong>{summary.total ?? reports.length}</strong>
        </div>
        <div>
          <span>Source</span>
          <strong>Supabase</strong>
        </div>
        <div>
          <span>Progress records</span>
          <strong>{summary.progressRecords ?? 0}</strong>
        </div>
        <div>
          <span>Assessments</span>
          <strong>{summary.assessments ?? 0}</strong>
        </div>
      </div>

      <div className="card-panel">
        <div className="section-heading">
          <div>
            <h3>Supabase reports</h3>
            <p>Real records from users, students, curriculum, progress, and assessments.</p>
          </div>
          <span className="pill small">{reports.length} reports</span>
        </div>
        <div className="table-scroll">
          {loading ? (
            <div className="list-skeleton">Loading reports...</div>
          ) : (
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Subject / Lesson</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Progress</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan="8">No lesson progress reports found.</td>
                  </tr>
                ) : reports.map((report) => (
                  <tr key={report.id}>
                    <td>{report.student || 'No data'}</td>
                    <td>{report.subject || report.lesson || 'Report record'}</td>
                    <td>{report.type || 'Report'}</td>
                    <td>{report.status || 'No status'}</td>
                    <td>{report.score ?? 'No data'}</td>
                    <td>{report.percentageComplete ?? '0'}%</td>
                    <td>{report.lastUpdated || 'No date'}</td>
                    <td>
                      {report.studentId && (
                        <button type="button" className="btn-secondary" onClick={() => handleDownloadStudentPdf(report)}>
                          PDF
                        </button>
                      )}
                    </td>
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

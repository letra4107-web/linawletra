import React, { useEffect, useState } from 'react';
import { adminService } from '../../services/api';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 });
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sortBy, setSortBy] = useState('lastUpdated');
  const [sortDir, setSortDir] = useState('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setPage(1);
  }, [typeFilter, search, limit]);

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await adminService.getReports({
          type: typeFilter,
          page,
          limit,
          sortBy,
          sortDir,
          ...(search.trim() ? { search: search.trim() } : {}),
        });
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
        setPagination(payload?.pagination || { page, limit, total: list.length, pages: 1 });
      } catch (err) {
        setReports([]);
        setSummary({});
        setError(err?.response?.data?.message || err?.message || 'Reports service is unavailable.');
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(loadReports, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [typeFilter, search, page, limit, sortBy, sortDir]);

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

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const sortIndicator = (field) => (sortBy === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
  const totalPages = Math.max(1, pagination.pages || 1);

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <h2>Reports</h2>
          <p>Search, filter, and export performance and progress reports.</p>
        </div>
        <span className="pill">Reporting</span>
      </div>

      {error && <div className="dashboard-banner dashboard-banner-error">{error}</div>}

      <div className="panel-grid panel-grid-single">
        <div className="card-panel">
          <div className="field-grid">
            <label>
              Search
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by student, subject, or status" />
            </label>
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
            <label>
              Rows per page
              <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="status-grid dashboard-status-grid">
        <div>
          <span>Total records</span>
          <strong>{summary.total ?? pagination.total ?? 0}</strong>
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
          <span className="pill small">{pagination.total ?? reports.length} reports</span>
        </div>
        <div className="table-scroll">
          {loading ? (
            <div className="list-skeleton">Loading reports...</div>
          ) : (
            <table className="simple-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('student')} style={{ cursor: 'pointer' }}>Student{sortIndicator('student')}</th>
                  <th onClick={() => toggleSort('subject')} style={{ cursor: 'pointer' }}>Subject / Lesson{sortIndicator('subject')}</th>
                  <th onClick={() => toggleSort('type')} style={{ cursor: 'pointer' }}>Type{sortIndicator('type')}</th>
                  <th onClick={() => toggleSort('status')} style={{ cursor: 'pointer' }}>Status{sortIndicator('status')}</th>
                  <th onClick={() => toggleSort('score')} style={{ cursor: 'pointer' }}>Score{sortIndicator('score')}</th>
                  <th onClick={() => toggleSort('percentageComplete')} style={{ cursor: 'pointer' }}>Progress{sortIndicator('percentageComplete')}</th>
                  <th onClick={() => toggleSort('lastUpdated')} style={{ cursor: 'pointer' }}>Updated{sortIndicator('lastUpdated')}</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan="8">No reports found.</td>
                  </tr>
                ) : reports.map((report) => (
                  <tr key={report.id}>
                    <td>{report.student || 'No data'}</td>
                    <td>{report.subject || report.lesson || 'Report record'}</td>
                    <td>{report.type || 'Report'}</td>
                    <td>{report.status || 'No status'}</td>
                    <td>{report.score ?? 'No data'}</td>
                    <td>{report.percentageComplete ?? '0'}%</td>
                    <td>{report.lastUpdated ? new Date(report.lastUpdated).toLocaleDateString() : 'No date'}</td>
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

        {!loading && reports.length > 0 && (
          <div className="pagination-row" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 2)
              .reduce((acc, n, idx, arr) => {
                if (idx > 0 && n - arr[idx - 1] > 1) acc.push('...');
                acc.push(n);
                return acc;
              }, [])
              .map((n, idx) => (
                n === '...' ? (
                  <span key={`ellipsis-${idx}`}>...</span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    className={`btn-secondary ${n === page ? 'is-active' : ''}`}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                )
              ))}
            <button type="button" className="btn-secondary" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              Next
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

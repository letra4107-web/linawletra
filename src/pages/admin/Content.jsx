import React, { useEffect, useState } from 'react';
import { adminService } from '../../services/api';

const formatNumber = (value) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '0';
  return Number(value).toLocaleString();
};

export default function Content() {
  const [modules, setModules] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await adminService.getContent();
        const payload = response.data || response;
        setModules(Array.isArray(payload?.modules) ? payload.modules : []);
        setSummary(payload?.summary || null);
      } catch (err) {
        setModules([]);
        setSummary(null);
        setError(err?.response?.data?.message || err?.message || 'Could not load curriculum content.');
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, []);

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <h2>Content</h2>
          <p>Read-only view of the real curriculum library (modules and items) stored in Supabase.</p>
        </div>
        <span className="pill">Curriculum Library</span>
      </div>

      {error && <div className="dashboard-banner dashboard-banner-error">{error}</div>}

      <div className="status-grid dashboard-status-grid">
        <div>
          <span>Total modules</span>
          <strong>{formatNumber(summary?.totalModules)}</strong>
        </div>
        <div>
          <span>Active modules</span>
          <strong>{formatNumber(summary?.activeModules)}</strong>
        </div>
        <div>
          <span>Total items</span>
          <strong>{formatNumber(summary?.totalItems)}</strong>
        </div>
        <div>
          <span>Active items</span>
          <strong>{formatNumber(summary?.activeItems)}</strong>
        </div>
      </div>

      {summary?.itemsByLevel && Object.keys(summary.itemsByLevel).length > 0 && (
        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>Items by reading level</h3>
              <p>Distribution of curriculum items across reading levels.</p>
            </div>
          </div>
          <div className="status-grid dashboard-status-grid">
            {Object.entries(summary.itemsByLevel).map(([level, count]) => (
              <div key={level}>
                <span>{level}</span>
                <strong>{formatNumber(count)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card-panel">
        <div className="section-heading">
          <div>
            <h3>Curriculum modules</h3>
            <p>Modules currently defined in the curriculum, ordered by sequence.</p>
          </div>
          <span className="pill small">{formatNumber(modules.length)} modules</span>
        </div>
        <div className="table-scroll">
          {loading ? (
            <div className="list-skeleton">Loading content...</div>
          ) : (
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Module #</th>
                  <th>Title</th>
                  <th>Reading level</th>
                  <th>Status</th>
                  <th>Items at this level</th>
                </tr>
              </thead>
              <tbody>
                {modules.length === 0 ? (
                  <tr>
                    <td colSpan="5">No curriculum modules found.</td>
                  </tr>
                ) : modules.map((module) => (
                  <tr key={module.id}>
                    <td>{module.module_number ?? 'No data'}</td>
                    <td>{module.title || 'Untitled module'}</td>
                    <td>{module.reading_level || 'No data'}</td>
                    <td>{module.is_active === false ? 'Inactive' : 'Active'}</td>
                    <td>{formatNumber(module.itemCount)}</td>
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

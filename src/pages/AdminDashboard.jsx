import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiRefreshCcw } from 'react-icons/fi';
import Sidebar from '../components/Sidebar';
import { adminService } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import './AdminDashboard.css';

const DEFAULT_SECTIONS = [
  'overview',
  'users',
  'teachers',
  'content',
  'analytics',
  'reports',
  'communication',
  'ai-settings',
  'system-settings',
];

const gradeOptions = ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'];

const formatNumber = (value) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '0';
  return Number(Number(value)).toLocaleString();
};

const normalizeDate = (value) => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const createRandomPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
  return Array.from({ length: 10 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
};

export default function AdminDashboard() {
  const { user, loading: authLoading } = useContext(AuthContext);
  const { section } = useParams();
  const navigate = useNavigate();

  const [overview, setOverview] = useState({});
  const [analytics, setAnalytics] = useState({});
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const activeSection = DEFAULT_SECTIONS.includes(section) ? section : 'overview';

  const refreshDashboard = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');

    try {
      const [overviewRes, analyticsRes, logsRes] = await Promise.all([
        adminService.getOverview(),
        adminService.getAnalytics(),
        adminService.getLogs({ limit: 6 }),
      ]);

      setOverview(overviewRes.data || overviewRes || {});
      setAnalytics(analyticsRes.data || analyticsRes || {});

      const logsPayload = logsRes.data || logsRes;
      setLogs(logsPayload.logs || logsPayload.data || []);
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || 'Unable to load admin data. Please try again.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'admin')) {
      navigate('/login', { replace: true });
      return;
    }
    refreshDashboard();
  }, [authLoading, user, navigate, refreshDashboard]);

  useEffect(() => {
    if (!loading && section && DEFAULT_SECTIONS.includes(section)) {
      const target = document.getElementById(section);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [section, loading]);

  const usageTrend = analytics?.enrollmentTrends || analytics?.usageTrend || analytics?.weeklyUsage || [];
  const performanceTrend = analytics?.performanceTrend || analytics?.studentPerformance || [];
  const completionRate = analytics?.completionRate ?? overview?.lessonCompletion ?? 0;

  const chartBars = useMemo(() => {
    const source = Array.isArray(usageTrend) && usageTrend.length ? usageTrend : [8, 15, 24, 18, 20, 14, 22];
    const maxValue = Math.max(...source, 1);
    return source.map((value, index) => ({ value, height: Math.round((value / maxValue) * 100), label: `Day ${index + 1}` }));
  }, [usageTrend]);

  const recentActivities = useMemo(() => {
    if (Array.isArray(overview?.recentActivities) && overview.recentActivities.length) {
      return overview.recentActivities;
    }
    return logs.map((entry) => ({
      type: entry.resourceType || entry.type || 'event',
      who: entry.userName || entry.user_id || entry.userId || 'System',
      when: entry.createdAt || entry.created_at || entry.date || null,
      description: entry.action || entry.description || entry.details?.message || 'Activity recorded',
    }));
  }, [overview, logs]);

  const healthStatus = overview?.systemHealth || overview?.healthStatus || 'Healthy';

  const summaryCards = [
    { label: 'Total students', value: overview?.totalStudents ?? overview?.studentCount ?? 0, highlight: true },
    { label: 'Total parents', value: overview?.totalParents ?? 0 },
    { label: 'Total teachers', value: overview?.totalTeachers ?? 0 },
    { label: 'Active users', value: overview?.activeUsers ?? 0 },
    { label: 'Lesson completion', value: `${completionRate}%` },
    { label: 'System health', value: healthStatus, variant: 'status' },
  ];

  return (
    <div className="admin-dashboard-shell">
      <Sidebar />
      <div className="admin-dashboard-main">
        <header className="admin-dashboard-header">
          <div>
            <p className="dashboard-eyebrow">Admin Command Center</p>
            <h1>LinawLetra Admin Dashboard</h1>
            <p className="dashboard-description">Manage users, teachers, content, analytics, and system health in one modern control panel.</p>
          </div>
          <div className="dashboard-header-actions">
            <button type="button" className="btn-secondary" onClick={refreshDashboard} disabled={loading}>
              <FiRefreshCcw /> Refresh
            </button>
          </div>
        </header>

        {errorMessage && <div className="dashboard-banner dashboard-banner-error">{errorMessage}</div>}
        {actionMessage && <div className="dashboard-banner dashboard-banner-success">{actionMessage}</div>}

        <main className="admin-dashboard-content">
          <section id="overview" className="dashboard-section">
            <div className="section-heading">
              <div>
                <h2>System Summary</h2>
                <p>Live operational metrics for the LinawLetra platform.</p>
              </div>
              <div className="pill">Overview</div>
            </div>

            <div className="summary-grid">
              {loading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="summary-card summary-card-skeleton" />
                ))
              ) : (
                summaryCards.map((card) => (
                  <article key={card.label} className={`summary-card ${card.variant === 'status' ? 'summary-card-status' : ''}`}>
                    <p className="summary-card-label">{card.label}</p>
                    <strong className="summary-card-value">{card.variant === 'status' ? card.value || 'Unknown' : formatNumber(card.value)}</strong>
                  </article>
                ))
              )}
            </div>
          </section>

          <section id="analytics" className="dashboard-section dashboard-grid-two">
            <div className="card-panel">
              <div className="section-heading">
                <div>
                  <h3>Platform Usage Trends</h3>
                  <p>Weekly active sessions and system adoption across the platform.</p>
                </div>
                <span className="pill small">Data-driven</span>
              </div>
              <div className="line-chart">
                {loading ? (
                  <div className="chart-skeleton" />
                ) : chartBars.length ? (
                  chartBars.map((point, index) => (
                    <div key={index} className="chart-bar" style={{ height: `${point.height}%` }}>
                      <span>{point.value}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state-card">No usage trend data available.</div>
                )}
              </div>
            </div>

            <div className="card-panel">
              <div className="section-heading">
                <div>
                  <h3>Performance Overview</h3>
                  <p>Student progress, lesson completion, and teacher activity in context.</p>
                </div>
                <span className="pill small">Insights</span>
              </div>
              <div className="performance-list">
                <div className="performance-item">
                  <p>Lesson completion rate</p>
                  <strong>{formatNumber(completionRate)}%</strong>
                </div>
                <div className="performance-item">
                  <p>Average class engagement</p>
                  <strong>{analytics?.averageEngagement ?? '—'}%</strong>
                </div>
                <div className="performance-item">
                  <p>Teacher response rate</p>
                  <strong>{analytics?.teacherResponseRate ?? '—'}%</strong>
                </div>
              </div>
              <div className="performance-chart">
                {performanceTrend.length ? performanceTrend.map((point, index) => (
                  <div key={index} className="performance-step">
                    <span>{point.label || `Q${index + 1}`}</span>
                    <strong>{point.value ?? point.score ?? '-'}</strong>
                  </div>
                )) : <p className="empty-state-text">No performance metrics available.</p>}
              </div>
            </div>
          </section>

          <section id="users" className="dashboard-section">
            <div className="section-heading">
              <div>
                <h2>Operational Health</h2>
                <p>Fast access to student, parent and teacher counts with live activity feed.</p>
              </div>
              <div className="pill">Users</div>
            </div>

            <div className="summary-grid">
              <article className="summary-card">
                <p className="summary-card-label">Total students</p>
                <strong className="summary-card-value">{formatNumber(overview?.totalStudents)}</strong>
              </article>
              <article className="summary-card">
                <p className="summary-card-label">Total parents</p>
                <strong className="summary-card-value">{formatNumber(overview?.totalParents)}</strong>
              </article>
              <article className="summary-card">
                <p className="summary-card-label">Total teachers</p>
                <strong className="summary-card-value">{formatNumber(overview?.totalTeachers)}</strong>
              </article>
              <article className="summary-card summary-card-small">
                <p className="summary-card-label">Pending approvals</p>
                <strong className="summary-card-value">{formatNumber(overview?.pendingApprovals)}</strong>
              </article>
            </div>

            <div className="panel-grid">
              <div className="card-panel">
                <h3>Recent activity</h3>
                {loading ? (
                  <div className="list-skeleton" />
                ) : recentActivities.length ? (
                  <ul className="alert-list">
                    {recentActivities.slice(0, 6).map((item, index) => (
                      <li key={item.id || index}>
                        <span>{item.type || 'Event'}</span>
                        <div>
                          <strong>{item.description || 'No details available'}</strong>
                          <small>{normalizeDate(item.when)}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty-state-card">No recent admin activities found.</div>
                )}
              </div>

              <div className="card-panel">
                <h3>Platform snapshot</h3>
                <div className="status-grid dashboard-status-grid">
                  <div>
                    <span>Active users</span>
                    <strong>{formatNumber(overview?.activeUsers)}</strong>
                  </div>
                  <div>
                    <span>Total users</span>
                    <strong>{formatNumber(overview?.totalUsers)}</strong>
                  </div>
                  <div>
                    <span>Completed progress</span>
                    <strong>{formatNumber(overview?.completedProgress)}</strong>
                  </div>
                  <div>
                    <span>Total progress entries</span>
                    <strong>{formatNumber(overview?.totalProgress)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="content" className="dashboard-section dashboard-grid-two">
            <div className="card-panel">
              <div className="section-heading">
                <div>
                  <h3>Content performance</h3>
                  <p>Lesson and assessment engagement detail powered by analytics.</p>
                </div>
                <span className="pill small">Content</span>
              </div>

              <div className="status-grid dashboard-status-grid">
                <div>
                  <span>Lesson completion</span>
                  <strong>{formatNumber(completionRate)}%</strong>
                </div>
                <div>
                  <span>Average score</span>
                  <strong>{formatNumber(analytics?.averageProgressScore)}</strong>
                </div>
                <div>
                  <span>Weekly enrollments</span>
                  <strong>{formatNumber(analytics?.weeklyEnrollments ?? analytics?.enrollmentTrends?.reduce((sum, value) => sum + Number(value || 0), 0) ?? 0)}</strong>
                </div>
                <div>
                  <span>Total progress records</span>
                  <strong>{formatNumber(analytics?.totalProgressRecords)}</strong>
                </div>
              </div>
            </div>

            <div className="card-panel">
              <div className="section-heading">
                <div>
                  <h3>Recent activity trend</h3>
                  <p>Enrollment and progress trends over the last 7 days.</p>
                </div>
                <span className="pill small">Trend</span>
              </div>
              <div className="line-chart">
                {loading ? (
                  <div className="chart-skeleton" />
                ) : chartBars.length ? (
                  chartBars.map((point, index) => (
                    <div key={index} className="chart-bar" style={{ height: `${point.height}%` }}>
                      <span>{point.value}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-state-card">No trend data available.</div>
                )}
              </div>
            </div>
          </section>

          <section id="reports" className="dashboard-section dashboard-grid-two">
            <div className="card-panel">
              <div className="section-heading">
                <div>
                  <h3>System Alerts & Monitoring</h3>
                  <p>Failed requests, login attempts, health checks, and error logs.</p>
                </div>
                <span className="pill small">Monitoring</span>
              </div>
              {loading ? (
                <div className="list-skeleton" />
              ) : logs.length ? (
                <ul className="alert-list">
                  {logs.slice(0, 6).map((entry, index) => (
                    <li key={`${entry.id || index}`}>
                      <span>{entry.type || entry.level || 'Event'}</span>
                      <div>
                        <strong>{entry.message || entry.description || 'No details'}</strong>
                        <small>{normalizeDate(entry.timestamp || entry.createdAt || entry.date)}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty-state-card">No recent system alerts.</div>
              )}
            </div>

            <div className="card-panel status-panel">
              <div className="section-heading">
                <div>
                  <h3>Live monitoring</h3>
                  <p>Real-time status values pulled from the backend.</p>
                </div>
                <span className="pill small">Live</span>
              </div>
              <div className="status-grid dashboard-status-grid">
                <div>
                  <span>Uptime</span>
                  <strong>{overview?.uptime || 'N/A'}</strong>
                </div>
                <div>
                  <span>Current errors</span>
                  <strong>{overview?.activeErrors ?? overview?.errorCount ?? '0'}</strong>
                </div>
                <div>
                  <span>Failed requests</span>
                  <strong>{overview?.failedRequests ?? '0'}</strong>
                </div>
                <div>
                  <span>Login attempts</span>
                  <strong>{overview?.recentLoginAttempts ?? '0'}</strong>
                </div>
              </div>
            </div>
          </section>

          <section id="communication" className="dashboard-section">
            <div className="section-heading">
              <div>
                <h2>Insights & Alerts</h2>
                <p>Visualize trend signals, support workload, and system health in one place.</p>
              </div>
              <div className="pill">Insights</div>
            </div>
            <div className="panel-grid">
              <div className="card-panel communication-card">
                <h3>Alerts summary</h3>
                {loading ? (
                  <div className="list-skeleton" />
                ) : logs.length ? (
                  <ul className="alert-list">
                    {logs.slice(0, 5).map((entry, index) => (
                      <li key={entry.id || index}>
                        <span>{entry.type || entry.action || 'Alert'}</span>
                        <div>
                          <strong>{entry.description || entry.action || 'No details'}</strong>
                          <small>{normalizeDate(entry.createdAt || entry.created_at || entry.timestamp)}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="empty-state-card">No alerts have been generated yet.</div>
                )}
              </div>

              <div className="card-panel communication-card">
                <h3>Analytics quick picks</h3>
                <div className="status-grid dashboard-status-grid">
                  <div>
                    <span>Avg. progress score</span>
                    <strong>{formatNumber(analytics?.averageProgressScore)}</strong>
                  </div>
                  <div>
                    <span>Completion rate</span>
                    <strong>{formatNumber(analytics?.completionRate)}%</strong>
                  </div>
                  <div>
                    <span>Weekly enrollments</span>
                    <strong>{formatNumber(analytics?.weeklyEnrollments ?? analytics?.enrollmentTrends?.reduce((sum, value) => sum + Number(value || 0), 0) ?? 0)}</strong>
                  </div>
                  <div>
                    <span>Recent logs</span>
                    <strong>{formatNumber(logs.length)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

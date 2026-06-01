import React, { useContext, useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { FileText, Users, BookOpen, CalendarCheck2, PlusCircle, LogOut, LayoutDashboard, MessageSquare } from 'lucide-react';
import '../styles/TeacherDashboard.css';
import { assessmentService, progressService, studentService } from '../services/api';

const sidebarSections = [
  {
    label: 'Overview',
    items: [
      { path: '/teacher-dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/teacher/assessments', label: 'Assessments', icon: FileText },
    ],
  },
  {
    label: 'Classroom',
    items: [
      { path: '/teacher/modules', label: 'Modules', icon: BookOpen },
      { path: '/teacher/class-roster', label: 'Class Roster', icon: Users },
      { path: '/teacher/assignments', label: 'Assignments', icon: CalendarCheck2 },
    ],
  },
  {
    label: 'Communication',
    items: [
      { path: '/teacher/messages', label: 'Messages', icon: MessageSquare },
    ],
  },
];

export default function TeacherDashboard() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalStudents: 0,
    assessments: 0,
    avgProgressScore: 0,
    loading: true,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [studentsResponse, assessmentsResponse, progressResponse] = await Promise.all([
          studentService.getAllStudents().catch(() => ({ data: [] })),
          assessmentService.getAssessments().catch(() => ({ data: [] })),
          progressService.getProgressReports().catch(() => ({ data: { reports: [] } })),
        ]);
        const students = Array.isArray(studentsResponse?.data) ? studentsResponse.data : [];
        const assessments = assessmentsResponse?.data?.assessments || assessmentsResponse?.data || [];
        const reports = progressResponse?.data?.reports || progressResponse?.data || [];
        const averageProgress = reports.length
          ? reports.reduce((sum, report) => sum + Number(report.overallScore || 0), 0) / reports.length
          : 0;

        setStats({
          totalStudents: students.length,
          assessments: Array.isArray(assessments) ? assessments.length : 0,
          avgProgressScore: averageProgress,
          loading: false,
        });
      } catch (err) {
        console.error('Stats fetch error:', err);
        setStats((prev) => ({ ...prev, loading: false }));
      }
    };

    fetchStats();
  }, []);

  const quickMetrics = useMemo(
    () => [
      {
        label: 'Students',
        value: stats.loading ? '...' : stats.totalStudents,
        description: 'Active learners this week',
      },
      {
        label: 'Modules',
        value: 'PDF',
        description: 'Reading material workspace',
      },
      {
        label: 'Assessments',
        value: stats.loading ? '...' : stats.assessments,
        description: 'In progress or completed',
      },
      {
        label: 'Progress score',
        value: stats.loading ? '...' : `${Math.round(stats.avgProgressScore)}%`,
        description: 'Average class growth',
      },
    ],
    [stats]
  );

  const firstName = useMemo(() => {
    const name = user?.firstName || user?.displayName || user?.fullName || user?.name || '';
    return name.split(' ')[0] || 'Teacher';
  }, [user]);

  return (
    <div className="teacher-dashboard-page">
      <aside className="teacher-sidebar">
        <div className="sidebar-top">
          <div>
            <div className="sidebar-logo">LinawLetra</div>
            <div className="sidebar-role">Teacher dashboard</div>
          </div>

          <div className="sidebar-menu">
            {sidebarSections.map((section) => (
              <div key={section.label} className="sidebar-section">
                <div className="sidebar-section-title">{section.label}</div>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
                    >
                      <span className="sidebar-item-icon">
                        <Icon size={18} />
                      </span>
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{firstName.charAt(0)}</div>
            <div>
              <div className="sidebar-user-name">{firstName}</div>
              <div className="sidebar-user-role">Teacher</div>
            </div>
          </div>
          <button type="button" className="sidebar-logout" onClick={logout}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </aside>

      <main className="teacher-content">
        <div className="top-nav">
          <div>
            <p className="top-bar-subtitle">Teacher Dashboard</p>
            <h1 className="top-bar-title">Dashboard</h1>
          </div>
          <div className="top-right">
            <button
              type="button"
              className="detail-action"
              onClick={() => navigate('/teacher/assignments')}
            >
              <PlusCircle size={18} /> Create schedule
            </button>
            <div className="top-user-card">
              <div className="top-user-avatar">{firstName.charAt(0)}</div>
              <div>
                <div className="top-user-name">{firstName}</div>
                <div className="top-user-role">Teacher</div>
              </div>
            </div>
          </div>
        </div>

        <div className="page-main">
          <section className="dashboard-hero">
            <div className="dashboard-hero-copy">
              <p className="dashboard-kicker">Welcome back</p>
              <h1>Teaching made simple and professional</h1>
              <p>Track student performance, coordinate assignments, and keep your classroom running smoothly with a clean, modern workspace.</p>
            </div>
            <div className="dashboard-hero-summary">
              <div className="dashboard-hero-card">
                <p className="stat-title">Next session</p>
                <p className="stat-value">{stats.loading ? '...' : `${stats.totalStudents} students`}</p>
                <p className="stat-label">Prepare assignments and reading materials before class.</p>
              </div>
              <div className="dashboard-hero-card">
                <p className="stat-title">Workflow health</p>
                <p className="stat-value">{stats.loading ? '...' : `${Math.round(stats.avgProgressScore)}%`}</p>
                <p className="stat-label">Classroom progress average.</p>
              </div>
            </div>
          </section>

          <div className="stats-row">
            {quickMetrics.map((metric) => (
              <article key={metric.label} className="stat-card">
                <p className="stat-title">{metric.label}</p>
                <p className="stat-value">{metric.value}</p>
                <p className="stat-label">{metric.description}</p>
              </article>
            ))}
          </div>

          <div className="body-grid body-grid-single">
            <section className="detail-panel">
              <div className="detail-header">
                <div>
                  <h2>Classroom focus</h2>
                  <p>Prepare the week, coordinate assignments, and review student growth details.</p>
                </div>
                <button
                  type="button"
                  className="detail-action"
                  onClick={() => navigate('/teacher/modules')}
                >
                  Open modules
                </button>
              </div>

              <div className="detail-top-row">
                <div className="detail-avatar-large">{firstName.charAt(0)}</div>
                <div className="detail-info-block">
                  <div className="detail-name">{firstName}'s teaching dashboard</div>
                  <div className="detail-meta-row">
                    Active modules · classroom roster · {stats.loading ? '...' : stats.totalStudents} students
                  </div>
                </div>
                <div className="detail-badges">
                  <span className="status-pill-large">On track</span>
                  <span className="tier-pill-large">Classroom ready</span>
                </div>
              </div>

              <div className="detail-block">
                <div className="detail-block-title">Key focus for today</div>
                <p className="learning-path-text">Review phonics progress, assign guided reading groups, and follow up with interventions for students who need extra decoding support.</p>
              </div>

              <div className="detail-tabs">
                <button type="button" className="tab-button active">Summary</button>
                <button type="button" className="tab-button">Attendance</button>
                <button type="button" className="tab-button">Resources</button>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

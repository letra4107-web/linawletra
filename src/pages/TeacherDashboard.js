import React, { useContext, useEffect, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { FileText, Users, BookOpen, CalendarCheck2, Activity, Settings, PlusCircle, Search, LogOut, LayoutDashboard } from 'lucide-react';
import '../styles/TeacherDashboard.css';
import { assessmentService, lessonService, progressService, studentService } from '../services/api';

const sidebarSections = [
  {
    label: 'Overview',
    items: [
      { path: '/teacher-dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/teacher/assessments', label: 'Assessments', icon: FileText },
    ],
  },
  {
    label: 'Students',
    items: [
      { path: '/teacher/students', label: 'My Students', icon: Users },
      { path: '/teacher/learning-paths', label: 'Learning paths', icon: BookOpen },
      { path: '/teacher/lessons', label: 'Lessons', icon: BookOpen },
      { path: '/teacher/reading', label: 'PDF reading', icon: FileText },
      { path: '/teacher/schedules', label: 'Schedules', icon: CalendarCheck2 },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { path: '/teacher/progress', label: 'Progress reports', icon: Activity },
      { path: '/teacher/activities', label: 'Activities', icon: Activity },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/teacher/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function TeacherDashboard() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    totalStudents: 0,
    lessons: 0,
    assessments: 0,
    avgProgressScore: 0,
    loading: true,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [studentsResponse, lessonsResponse, assessmentsResponse, progressResponse] = await Promise.all([
          studentService.getAllStudents().catch(() => ({ data: [] })),
          lessonService.getLessons().catch(() => ({ data: [] })),
          assessmentService.getAssessments().catch(() => ({ data: [] })),
          progressService.getProgressReports().catch(() => ({ data: { reports: [] } })),
        ]);
        const students = Array.isArray(studentsResponse?.data) ? studentsResponse.data : [];
        const lessons = Array.isArray(lessonsResponse?.data) ? lessonsResponse.data : [];
        const assessments = assessmentsResponse?.data?.assessments || assessmentsResponse?.data || [];
        const reports = progressResponse?.data?.reports || progressResponse?.data || [];
        const averageProgress = reports.length
          ? reports.reduce((sum, report) => sum + Number(report.overallScore || 0), 0) / reports.length
          : 0;

        setStats({
          totalStudents: students.length,
          lessons: lessons.length,
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
        label: 'Lessons',
        value: stats.loading ? '...' : stats.lessons,
        description: 'Open lesson plans',
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

  const filteredLinks = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return sidebarSections.flatMap((section) => section.items);
    return sidebarSections
      .flatMap((section) => section.items)
      .filter((item) => item.label.toLowerCase().includes(query));
  }, [searchTerm]);

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
          <div className="top-search">
            <Search size={18} className="field-icon" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search teacher tools"
            />
          </div>
          <div className="top-right">
            <button
              type="button"
              className="detail-action"
              onClick={() => navigate('/teacher/schedules')}
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
              <p>Track student performance, manage lessons, and keep your classroom running smoothly with a clean, modern workspace.</p>
            </div>
            <div className="dashboard-hero-summary">
              <div className="dashboard-hero-card">
                <p className="stat-title">Next session</p>
                <p className="stat-value">{stats.loading ? '...' : `${stats.totalStudents} students`}</p>
                <p className="stat-label">Pack your lessons and resources before class.</p>
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

          <div className="body-grid">
            <section className="list-panel">
              <div className="panel-header">
                <div>
                  <h2>Teacher tools</h2>
                  <p>Find the section you need and go there quickly.</p>
                </div>
              </div>
              <div className="list-controls">
                <div className="list-search">
                  <Search size={18} className="field-icon" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search tools"
                  />
                </div>
                <div className="filter-tabs">
                  <button type="button" className="filter-pill active">Overview</button>
                  <button type="button" className="filter-pill">Students</button>
                  <button type="button" className="filter-pill">Analytics</button>
                </div>
              </div>
              <div className="student-cards">
                {filteredLinks.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-illustration">🔍</div>
                    <div className="empty-title">No matching tool</div>
                    <p className="empty-copy">Try a different search term to find the right page.</p>
                  </div>
                ) : (
                  filteredLinks.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.path}
                        type="button"
                        onClick={() => navigate(item.path)}
                        className="student-card"
                      >
                        <div className="student-card-left">
                          <div className="student-avatar">
                            <Icon size={20} />
                          </div>
                          <div>
                            <div className="student-name">{item.label}</div>
                            <div className="student-meta">Open this section</div>
                          </div>
                        </div>
                        <div className="student-card-right">
                          <span className="student-score">Go</span>
                          <span className="tier-pill">Quick access</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="student-footer">{filteredLinks.length} of {sidebarSections.flatMap((section) => section.items).length} available teacher tools</div>
            </section>

            <section className="detail-panel">
              <div className="detail-header">
                <div>
                  <h2>Lesson planning</h2>
                  <p>Prepare the week, update plans, and review student growth details.</p>
                </div>
                <button
                  type="button"
                  className="detail-action"
                  onClick={() => navigate('/teacher/lessons')}
                >
                  Adjust lesson
                </button>
              </div>

              <div className="detail-top-row">
                <div className="detail-avatar-large">{firstName.charAt(0)}</div>
                <div className="detail-info-block">
                  <div className="detail-name">{firstName}'s teaching dashboard</div>
                  <div className="detail-meta-row">
                    Active lesson plans · 3 groups · {stats.loading ? '...' : stats.totalStudents} students
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

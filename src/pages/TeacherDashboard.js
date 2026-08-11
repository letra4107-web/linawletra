import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { PlusCircle } from 'lucide-react';
import '../styles/TeacherDashboard.css';
import { assessmentService, lessonService, studentService } from '../services/api';

export default function TeacherDashboard() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
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
        const [studentsResponse, lessonsResponse, assessmentsResponse] = await Promise.all([
          studentService.getAllStudents().catch(() => ({ data: [] })),
          lessonService.getLessons().catch(() => ({ data: [] })),
          assessmentService.getAssessments().catch(() => ({ data: [] })),
        ]);
        const students = Array.isArray(studentsResponse?.data) ? studentsResponse.data : [];
        const lessons = Array.isArray(lessonsResponse?.data) ? lessonsResponse.data : [];
        const assessments = assessmentsResponse?.data?.assessments || assessmentsResponse?.data || [];
        const statsRows = students.map((student) => student.stats).filter(Boolean);
        const averageProgress = statsRows.length
          ? statsRows.reduce((sum, stats) => sum + Number(stats.progress?.percentage || 0), 0) / statsRows.length
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

  return (
    <main className="teacher-content" id="main-content">
        <div className="top-nav">
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

          <div className="body-grid body-grid--single">
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
                    Active lesson plans · {stats.loading ? '...' : stats.totalStudents} students
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
  );
}

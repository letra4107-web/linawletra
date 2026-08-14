import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentService } from '../services/api';
import { ACHIEVEMENTS } from '../services/achievementService';
import PageLayout from '../components/layout/PageLayout';
import '../styles/TeacherDashboard.css';

const STATUS_OPTIONS = ['all', 'active', 'pending', 'in progress', 'completed'];

export default function MyStudentsPage() {
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const navigate = useNavigate();

  const normalizeStudent = (student = {}) => {
    const user = student.user || student.users || {};
    const stats = student.stats || {};
    const metadata = user.metadata || student.metadata || {};
    const badges = student.unlockedAchievementIds || student.unlocked_achievement_ids || stats.unlockedAchievementIds || stats.unlocked_achievement_ids || [];
    return {
      ...student,
      id: student.id || student.student_id || student._id,
      name:
        student.name ||
        stats.name ||
        user.name ||
        metadata.displayName ||
        [metadata.firstName, metadata.lastName].filter(Boolean).join(' ') ||
        user.email ||
        'Unknown student',
      grade: student.grade || student.gradeLevel || student.grade_level || '',
      status: student.status || 'active',
      score: student.score ?? stats.progress?.percentage ?? student.progress_in_level ?? student.accuracy ?? stats.accuracy ?? metadata.accuracy ?? null,
      tier: student.tier || student.readingLevel || student.reading_level || stats.level || metadata.readingLevel || 'beginner',
      badgeCount: student.badgeCount ?? (Array.isArray(badges) ? badges.length : 0),
    };
  };

  useEffect(() => {
    const loadStudents = async () => {
      setLoading(true);
      setError(false);
      try {
        const response = await studentService.getAllStudents();
        const data = response?.data || [];
        setStudents(Array.isArray(data) ? data.map(normalizeStudent) : []);
      } catch (err) {
        console.error(err);
        setStudents([]);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    loadStudents();
  }, []);

  const filteredStudents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return students.filter((student) => {
      const name = (student.name || '').toLowerCase();
      const grade = (student.grade || '').toLowerCase();
      const status = (student.status || '').toLowerCase();
      const matchesSearch = query === '' || name.includes(query) || grade.includes(query);
      const matchesFilter = filter === 'all' || status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [students, searchTerm, filter]);

  return (
    <PageLayout
      title="My Students"
      subtitle="Manage and track your enrolled learners"
      showSearch
      searchValue={searchTerm}
      onSearch={setSearchTerm}
      searchPlaceholder="Search students"
    >
      <div className="page-main">
        <section className="headline-section">
          <div>
            <h1>My Students</h1>
            <p>Manage and track your enrolled learners</p>
          </div>
          <div className="filter-tabs">
            {['All', 'Active', 'Pending', 'In Progress', 'Completed'].map((state) => (
              <button
                key={state}
                type="button"
                className={`filter-pill${filter === state.toLowerCase() ? ' active' : ''}`}
                onClick={() => setFilter(state.toLowerCase())}
              >
                {state}
              </button>
            ))}
          </div>
        </section>

        <section className="student-cards">
          {loading ? (
            Array.from({ length: 6 }).map((_, index) => <div key={index} className="skeleton-card" />)
          ) : error ? (
            <div className="empty-state">
              <div className="empty-title">Unable to load students</div>
              <p className="empty-copy">Please refresh or try again later.</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="empty-state">
              <div className="empty-title">No students found</div>
              <p className="empty-copy">Change your filters or add new learners.</p>
            </div>
          ) : (
            filteredStudents.map((student) => (
              <button
                key={student.id || student._id}
                type="button"
                className="student-card"
                onClick={() => navigate(`/teacher/students/${student.id || student._id}`)}
              >
                <div className="student-card-left">
                  <div className="student-avatar">{(student.name || 'S').charAt(0)}</div>
                  <div>
                    <div className="student-name">{student.name || 'Unknown student'}</div>
                    <div className="student-meta">Grade {student.grade || '—'} · {student.status || 'Active'}</div>
                  </div>
                </div>
                <div className="student-card-right">
                  <div className="student-score">{student.score != null ? `${student.score}%` : '—'}</div>
                  <span className="tier-pill">{student.tier || 'Tier 1'}</span>
                  <span className="tier-pill" title="Mga nakuhang badge">🏅 {student.badgeCount}/{ACHIEVEMENTS.length}</span>
                </div>
              </button>
            ))
          )}
        </section>
      </div>
    </PageLayout>
  );
}

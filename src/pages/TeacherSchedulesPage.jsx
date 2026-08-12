import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { studentService, scheduleService } from '../services/api';
import PageLayout from '../components/layout/PageLayout';
import { PlusCircle, Trash2, Users } from 'lucide-react';

const formatDate = (value) => {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

const getStatusLabel = (status) => {
  if (!status) return 'Pending';
  return status.replace(/\b\w/g, (char) => char.toUpperCase());
};

const parseDateValue = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  return new Date(value);
};

const formatDateLabel = (value) => {
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return 'No date';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

const formatDateBadge = (value) => {
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  return {
    day: date.getDate(),
    month: date.toLocaleString('default', { month: 'short' }),
  };
};

const statusClasses = {
  completed: 'bg-emerald-100 text-emerald-800',
  upcoming: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-rose-100 text-rose-800',
  pending: 'bg-slate-100 text-slate-700',
};

const unwrapArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.schedules)) return value.data.schedules;
  if (Array.isArray(value?.data?.students)) return value.data.students;
  return [];
};

const normalizeStudent = (student = {}) => {
  const user = student.user || student.users || {};
  const metadata = user.metadata || student.metadata || {};
  const id = student.id || student.student_id || student._id;
  return {
    ...student,
    id,
    userId: student.user_id || user.id || id,
    name:
      student.name ||
      user.name ||
      metadata.displayName ||
      [metadata.firstName, metadata.lastName].filter(Boolean).join(' ') ||
      user.email ||
      'Student',
  };
};

const normalizeSchedule = (schedule = {}) => {
  const scheduledDate = schedule.scheduledDate || schedule.scheduled_date || schedule.date;
  const dateOnly = scheduledDate ? String(scheduledDate).slice(0, 10) : schedule.date;
  const timeFromDate = scheduledDate && String(scheduledDate).includes('T')
    ? new Date(scheduledDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return {
    ...schedule,
    id: schedule.id || schedule._id,
    studentId: schedule.studentId || schedule.student_id,
    studentName: schedule.studentName || schedule.student_name || schedule.student?.name || schedule.studentId || 'Student',
    date: dateOnly,
    time: schedule.time || timeFromDate,
    status: schedule.status || 'upcoming',
  };
};

export default function TeacherSchedulesPage() {
  const [schedules, setSchedules] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [newSchedule, setNewSchedule] = useState({
    studentId: '',
    studentName: '',
    title: '',
    room: '',
    date: '',
    time: '',
    duration: 60,
    status: 'upcoming',
    notes: '',
  });
  const { user } = useContext(AuthContext);
  const currentTeacherId = user?.uid;

  const loadSchedules = async () => {
    setLoading(true);
    const uid = currentTeacherId || user?.uid;
    if (!uid) {
      setSchedules([]);
      setLoading(false);
      return;
    }

    try {
      const response = await scheduleService.getSchedulesByTeacher(uid).catch(() => ({ data: [] }));
      const data = unwrapArray(response).map(normalizeSchedule);
      data.sort((a, b) => {
        const aDate = parseDateValue(a.date);
        const bDate = parseDateValue(b.date);
        return (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
      });
      setSchedules(data);
      setError('');
    } catch (err) {
      console.error('Schedules error:', err);
      setSchedules([]);
      setError('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const response = await studentService.getAllStudents();
        const studentRecords = unwrapArray(response).map(normalizeStudent);
        setStudents(studentRecords);
        await loadSchedules();
      } catch (err) {
        console.error('Schedule loadData error:', err);
        setError('Unable to load schedules.');
        setSchedules([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [currentTeacherId]);

  const filteredSchedules = useMemo(
    () =>
      filterStatus === 'all'
        ? schedules
        : schedules.filter((schedule) => schedule.status === filterStatus),
    [filterStatus, schedules]
  );

  const scheduleStats = useMemo(
    () => ({
      upcoming: schedules.filter((item) => item.status !== 'completed').length,
      completed: schedules.filter((item) => item.status === 'completed').length,
      students: new Set(schedules.map((item) => item.studentName || item.studentId)).size,
    }),
    [schedules]
  );

  const handleNewScheduleChange = (event) => {
    const { name, value } = event.target;
    const selected = name === 'studentId' ? students.find((student) => student.id === value || student.userId === value) : null;
    setNewSchedule((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'studentId' ? { studentName: selected?.name || '' } : {}),
    }));
  };

  const handleAddSchedule = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const uid = currentTeacherId;
      if (!uid) {
        setError('Teacher must be signed in.');
        return;
      }
      if (!newSchedule.studentId || !newSchedule.date || !newSchedule.time || !newSchedule.room) {
        setError('Please select a student, subject, room, date, and time.');
        return;
      }

      const scheduleData = {
        studentId: newSchedule.studentId,
        studentName: newSchedule.studentName,
        title: newSchedule.title || 'Lesson session',
        scheduledDate: `${newSchedule.date}T${newSchedule.time || '00:00'}`,
        time: newSchedule.time,
        duration: Number(newSchedule.duration),
        status: newSchedule.status,
        notes: newSchedule.notes,
        createdAt: new Date(),
      };

      const result = await scheduleService.createSchedule(scheduleData);
      const created = result?.data?.schedule || result?.data || {};
      const scheduleId = created.id || newSchedule.studentId + Date.now();

      setSchedules((prev) => [
        normalizeSchedule({
          id: scheduleId,
          ...newSchedule,
          ...created,
        }),
        ...prev,
      ]);
      setShowAddModal(false);
      setNewSchedule({
        studentId: '',
        studentName: '',
        title: '',
        date: '',
        time: '',
        duration: 60,
        status: 'upcoming',
        notes: '',
      });
    } catch (err) {
      console.error(err);
      setError('Unable to save schedule.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    try {
      await scheduleService.deleteSchedule(scheduleId);
      setSchedules((prev) => prev.filter((item) => item.id !== scheduleId));
    } catch (err) {
      console.error(err);
      setError('Unable to delete schedule.');
    }
  };

  return (
    <PageLayout
      title="Schedules"
      subtitle="Plan and monitor your upcoming student sessions"
      showSearch={false}
      actions={(
        <button type="button" className="detail-action" onClick={() => setShowAddModal(true)}>
          <PlusCircle size={16} /> Add schedule
        </button>
      )}
    >
      <div className="stats-row" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-title">📅 Upcoming Sessions</div>
          <div className="stat-value">{schedules.filter((s) => s.status === 'upcoming').length}</div>
          <div className="stat-label">Sessions waiting on delivery</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">✅ Completed Sessions</div>
          <div className="stat-value">{schedules.filter((s) => s.status === 'completed').length}</div>
          <div className="stat-label">Lessons already delivered</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">👥 Students Scheduled</div>
          <div className="stat-value">{new Set(schedules.map((s) => String(s.studentId || ''))).size}</div>
          <div className="stat-label">Unique learners with sessions</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">❌ Cancelled</div>
          <div className="stat-value">{schedules.filter((s) => s.status === 'cancelled').length}</div>
          <div className="stat-label">Sessions not completed</div>
        </div>
      </div>

      <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-semibold text-slate-900">Session timeline</p>
            <p className="mt-1 text-sm text-slate-500">Review session details and manage today's schedule.</p>
          </div>
          <div className="filter-tabs">
            {['all', 'upcoming', 'completed', 'cancelled'].map((status) => (
              <button
                key={status}
                type="button"
                className={`filter-pill${filterStatus === status ? ' active' : ''}`}
                onClick={() => setFilterStatus(status)}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="student-cards">
          {loading ? (
            <>
              <div className="skeleton" style={{ height: 88 }} />
              <div className="skeleton" style={{ height: 88 }} />
              <div className="skeleton" style={{ height: 88 }} />
            </>
          ) : filteredSchedules.length === 0 ? (
            <div className="empty-state">
              <div className="empty-illustration">📅</div>
              <div className="empty-title">No schedules yet</div>
              <div className="empty-copy">Click "Add schedule" to create your first session</div>
            </div>
          ) : (
            filteredSchedules.map((schedule) => {
              const badgeDate = formatDateBadge(schedule.date);
              return (
                <div key={schedule.id} className="student-card">
                  <div className="student-card-left">
                    <div className="student-avatar" style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      flexDirection: 'column',
                      lineHeight: 1.3,
                      fontSize: '0.75rem',
                      background: '#4F46E5',
                    }}>
                      <span style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                        {badgeDate.day}
                      </span>
                      <span>{badgeDate.month}</span>
                    </div>

                    <div>
                      <div className="student-name">{schedule.studentName || schedule.studentId || 'Student'}</div>
                      <div className="student-meta">
                        🕐 {schedule.time || 'TBD'} · ⏱ {schedule.duration || 0} mins · {schedule.room ? `Room ${schedule.room}` : 'Room TBD'}
                      </div>
                      <div className="student-meta">📘 {schedule.title || 'Session'}</div>
                      {schedule.notes && (
                        <div className="student-meta" style={{ marginTop: 4 }}>
                          📝 {schedule.notes}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="student-card-right">
                    <span className={`status-pill ${
                      schedule.status === 'upcoming'
                        ? 'status-upcoming'
                        : schedule.status === 'completed'
                        ? 'status-completed'
                        : 'status-cancelled'
                    }`}>
                      {schedule.status === 'upcoming' ? '⏳' : schedule.status === 'completed' ? '✅' : '❌'} {getStatusLabel(schedule.status)}
                    </span>
                    <button
                      type="button"
                      className="filter-pill"
                      onClick={() => handleDeleteSchedule(schedule.id)}
                      style={{ color: '#DC2626', marginTop: 6 }}
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {showAddModal && (
        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-base font-semibold text-slate-900">Create new schedule</p>
              <p className="mt-1 text-sm text-slate-500">Add a session for a student and save it to Firestore.</p>
            </div>
            <button type="button" className="detail-action" onClick={() => setShowAddModal(false)}>
              Cancel
            </button>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleAddSchedule}>
            <label>
              <div className="student-meta">Student</div>
              <select
                name="studentId"
                value={newSchedule.studentId}
                onChange={handleNewScheduleChange}
                className="list-search"
              >
                <option value="">Select a student</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div className="student-meta">Subject</div>
              <input
                name="title"
                value={newSchedule.title}
                onChange={handleNewScheduleChange}
                placeholder="e.g. Phonics coaching"
                className="list-search"
              />
            </label>

            <label>
              <div className="student-meta">Room</div>
              <input
                name="room"
                value={newSchedule.room}
                onChange={handleNewScheduleChange}
                placeholder="e.g. Room 204"
                className="list-search"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-3">
              <label>
                <div className="student-meta">Date</div>
                <input name="date" type="date" value={newSchedule.date} onChange={handleNewScheduleChange} className="list-search" />
              </label>
              <label>
                <div className="student-meta">Time</div>
                <input name="time" type="time" value={newSchedule.time} onChange={handleNewScheduleChange} className="list-search" />
              </label>
              <label>
                <div className="student-meta">Duration (mins)</div>
                <input name="duration" type="number" min="15" value={newSchedule.duration} onChange={handleNewScheduleChange} className="list-search" />
              </label>
            </div>

            <label>
              <div className="student-meta">Status</div>
              <select name="status" value={newSchedule.status} onChange={handleNewScheduleChange} className="list-search">
                <option value="upcoming">Upcoming</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>

            <label>
              <div className="student-meta">Notes</div>
              <textarea
                name="notes"
                value={newSchedule.notes}
                onChange={handleNewScheduleChange}
                rows={4}
                className="list-search"
              />
            </label>

            <button type="submit" className="detail-action" disabled={saving}>
              {saving ? 'Saving...' : 'Save schedule'}
            </button>
          </form>
        </section>
      )}
    </PageLayout>
  );
}

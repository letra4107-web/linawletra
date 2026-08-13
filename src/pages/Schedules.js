import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiAlertCircle,
  FiBarChart2,
  FiBell,
  FiCalendar,
  FiCheck,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiEdit2,
  FiPlus,
  FiSettings,
  FiTrash2,
  FiUser,
  FiX,
} from 'react-icons/fi';
import { AuthContext } from '../context/AuthContext';
import ParentSidebar from '../components/ParentSidebar';
import { scheduleService, studentService } from '../services/api';
import './ParentDashboard.css';

const activityOptions = [
  { value: 'reminder', label: 'Reminder' },
  { value: 'reading_lesson', label: 'Reading Lesson' },
  { value: 'practice', label: 'Practice' },
  { value: 'appointment', label: 'Appointment' },
];

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const unwrapStudents = (payload) => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.students)) return data.students;
  if (Array.isArray(data?.data?.students)) return data.data.students;
  return [];
};

const toDateKey = (value) => {
  if (!value) return '';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const formatDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatMonthLabel = (date) =>
  date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

const formatLongDate = (dateKey) => {
  if (!dateKey) return '';
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const normalizeChild = (child = {}) => {
  const user = child.user || child.users || {};
  const metadata = user.metadata || child.metadata || {};
  const id = child.id || child._id || child.studentId || child.student_id;
  const name =
    child.name ||
    user.name ||
    metadata.displayName ||
    [metadata.firstName, metadata.lastName].filter(Boolean).join(' ') ||
    user.email ||
    child.email ||
    'Child';
  return {
    ...child,
    id,
    _id: id,
    name,
  };
};

const defaultForm = {
  studentId: '',
  activityType: 'reminder',
  scheduledDate: '',
  scheduledTime: '',
  title: '',
  notes: '',
};

export default function Schedules() {
  const { user } = useContext(AuthContext);
  const [monthDate, setMonthDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));
  const [calendarData, setCalendarData] = useState(null);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [formData, setFormData] = useState(defaultForm);
  const [formErrors, setFormErrors] = useState({});

  const range = useMemo(() => {
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    return { start: formatDateKey(start), end: formatDateKey(end) };
  }, [monthDate]);

  const calendarDays = useMemo(() => {
    const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const last = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const days = [];
    const cursor = new Date(first);
    cursor.setDate(cursor.getDate() - cursor.getDay());

    while (days.length < 42) {
      days.push({
        key: formatDateKey(cursor),
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === monthDate.getMonth(),
        isToday: formatDateKey(cursor) === formatDateKey(new Date()),
      });
      cursor.setDate(cursor.getDate() + 1);
      if (cursor > last && cursor.getDay() === 0 && days.length >= 35) break;
    }
    return days;
  }, [monthDate]);

  const scheduledActivities = calendarData?.scheduledActivities || [];
  const learningEvents = calendarData?.learningEvents || [];
  const upcomingReminders = calendarData?.upcomingReminders || [];
  const summary = calendarData?.summary || {};
  const dataQuality = calendarData?.dataQuality || {};

  const metricsByDay = useMemo(() => {
    const map = new Map();
    (calendarData?.dayMetrics || []).forEach((day) => map.set(day.date, day));
    return map;
  }, [calendarData]);

  const selectedItems = useMemo(() => {
    const schedules = scheduledActivities
      .filter((item) => item.date === selectedDate)
      .map((item) => ({ ...item, displayType: item.activityType === 'reminder' ? 'Reminder' : 'Scheduled' }));
    const learning = learningEvents
      .filter((item) => item.date === selectedDate)
      .map((item) => ({ ...item, displayType: item.kind === 'completed_lesson' ? 'Completed' : 'Practice' }));
    return [...schedules, ...learning].sort((a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99')));
  }, [learningEvents, scheduledActivities, selectedDate]);

  const insight = useMemo(() => {
    if ((dataQuality.unlinkedStudents || []).length > 0) {
      return 'Some child profiles need schedule linking before reminders can be created for every learner.';
    }
    if (!scheduledActivities.length && !learningEvents.length) {
      return 'No real calendar activity was found for this month yet.';
    }
    if (upcomingReminders.length > 0) {
      return `${upcomingReminders.length} reminder${upcomingReminders.length === 1 ? '' : 's'} coming up this month.`;
    }
    if ((summary.activeDays || 0) > 0) {
      return `${summary.activeDays} active learning day${summary.activeDays === 1 ? '' : 's'} found from real practice and completion records.`;
    }
    return 'Calendar data is connected and waiting for new schedule or practice activity.';
  }, [dataQuality.unlinkedStudents, learningEvents.length, scheduledActivities.length, summary.activeDays, upcomingReminders.length]);

  useEffect(() => {
    if (!user || user.role !== 'parent') return;
    fetchCalendarData();
  }, [user, range.start, range.end]);

  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess('');
        setError('');
      }, 6000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [success, error]);

  const fetchCalendarData = async () => {
    try {
      setLoading(true);
      setError('');
      const [childrenResponse, calendarResponse] = await Promise.all([
        studentService.getStudents(),
        scheduleService.getParentCalendar(range),
      ]);
      setChildren(unwrapStudents(childrenResponse).map(normalizeChild));
      setCalendarData(calendarResponse.data?.data || calendarResponse.data || null);
    } catch (err) {
      console.error('Parent calendar fetch error:', err);
      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        setError('Unable to connect to the server. Please check if the backend is running and try again.');
      } else if (err.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (err.response?.status === 403) {
        setError('Access denied. You do not have permission to view this calendar.');
      } else {
        setError(err.response?.data?.message || 'Failed to load calendar data. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const setField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => ({ ...current, [field]: '' }));
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.studentId) errors.studentId = 'Please select a child.';
    if (!formData.activityType) errors.activityType = 'Please choose a type.';
    if (!formData.scheduledDate) errors.scheduledDate = 'Date is required.';
    if (!formData.scheduledTime) errors.scheduledTime = 'Time is required.';
    if (!formData.title.trim()) errors.title = 'Title is required.';

    if (!editingSchedule && formData.scheduledDate) {
      const selected = new Date(`${formData.scheduledDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selected < today) errors.scheduledDate = 'Date cannot be in the past.';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const resetForm = () => {
    setFormData(defaultForm);
    setFormErrors({});
    setEditingSchedule(null);
    setShowForm(false);
  };

  const openNewReminder = (dateKey = selectedDate) => {
    setEditingSchedule(null);
    setFormData({
      ...defaultForm,
      scheduledDate: dateKey || formatDateKey(new Date()),
      activityType: 'reminder',
    });
    setFormErrors({});
    setShowForm(true);
  };

  const handleEditSchedule = (schedule) => {
    setEditingSchedule(schedule);
    setFormData({
      studentId: schedule.studentId || schedule.studentRecordId || '',
      activityType: schedule.activityType || 'reminder',
      scheduledDate: schedule.date || '',
      scheduledTime: schedule.time || '',
      title: schedule.title || '',
      notes: schedule.description || schedule.notes || '',
    });
    setFormErrors({});
    setShowForm(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateForm()) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        studentId: formData.studentId,
        activityType: formData.activityType,
        sessionType: formData.activityType,
        title: formData.title.trim(),
        description: formData.notes.trim(),
        notes: formData.notes.trim(),
        scheduledDate: `${formData.scheduledDate}T${formData.scheduledTime}`,
        scheduledTime: formData.scheduledTime,
        status: 'scheduled',
      };

      if (editingSchedule) {
        await scheduleService.updateSchedule(editingSchedule.id, payload);
        setSuccess('Calendar item updated.');
      } else {
        await scheduleService.createSchedule(payload);
        setSuccess(formData.activityType === 'reminder' ? 'Reminder added.' : 'Calendar item added.');
      }

      resetForm();
      await fetchCalendarData();
    } catch (err) {
      console.error('Calendar item save error:', err);
      if (err.response?.status === 409) {
        setError(err.response?.data?.message || 'This child needs a linked child record before scheduling.');
      } else if (err.response?.status === 400) {
        setError(err.response?.data?.message || 'Please check the calendar item details.');
      } else {
        setError(err.response?.data?.message || 'Failed to save this calendar item.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSchedule = async (schedule) => {
    if (!window.confirm('Remove this calendar item?')) return;

    try {
      await scheduleService.deleteSchedule(schedule.id);
      setSuccess('Calendar item removed.');
      await fetchCalendarData();
    } catch (err) {
      console.error('Calendar item delete error:', err);
      setError(err.response?.data?.message || 'Failed to remove this calendar item.');
    }
  };

  const moveMonth = (direction) => {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  };

  if (!user || user.role !== 'parent') {
    return <div className="container" style={{ marginTop: '2rem' }}>Access denied. Parent role required.</div>;
  }

  return (
    <div className="parent-dashboard-page">
      <ParentSidebar />
      <main className="parent-main parent-calendar-page">
        <div className="parent-calendar-header">
          <div>
            <h1>Calendar</h1>
            <p className="dashboard-subtitle">Schedules, reminders, and learning activity for your children.</p>
          </div>
          <div className="parent-calendar-actions">
            <Link className="btn-secondary calendar-settings-link" to="/parent/settings">
              <FiSettings /> Notification Settings
            </Link>
            <button type="button" className="btn-primary" onClick={() => openNewReminder()}>
              <FiPlus /> Add Reminder
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-error">
            <FiAlertCircle /> {error}
          </div>
        )}
        {success && (
          <div className="alert alert-success">
            <FiCheck /> {success}
          </div>
        )}

        <section className="calendar-summary-grid" aria-label="Calendar summary">
          <div className="calendar-summary-card">
            <span><FiCalendar /> Active Days</span>
            <strong>{summary.activeDays ?? 0}</strong>
          </div>
          <div className="calendar-summary-card">
            <span><FiClock /> {summary.minutesLabel || 'Tracked Practice Minutes'}</span>
            <strong>{summary.learningTimeAvailable ? summary.trackedPracticeMinutes : 'Not available'}</strong>
            {!summary.learningTimeAvailable && <small>Learning time tracking is not available yet.</small>}
          </div>
          <div className="calendar-summary-card">
            <span><FiCheck /> Completed Lessons</span>
            <strong>{summary.completedLessons ?? 0}</strong>
          </div>
          <div className="calendar-summary-card">
            <span><FiBarChart2 /> Practice Records</span>
            <strong>{summary.completedPractice ?? 0}</strong>
          </div>
          <div className="calendar-summary-card">
            <span><FiBell /> Upcoming Reminders</span>
            <strong>{summary.upcomingReminders ?? 0}</strong>
          </div>
        </section>

        <section className="parent-insight-band">
          <div>
            <span className="parent-insight-label">Parent Insight</span>
            <p>{insight}</p>
          </div>
          {dataQuality.minutesArePartial && (
            <small>{dataQuality.minutesNote || 'Minutes include only records with tracked duration.'}</small>
          )}
        </section>

        {showForm && (
          <section className="calendar-form-panel">
            <div className="calendar-form-heading">
              <h2>{editingSchedule ? 'Edit Calendar Item' : 'Add Reminder'}</h2>
              <button type="button" className="btn-icon" onClick={resetForm} aria-label="Close form">
                <FiX />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="studentId">Child *</label>
                  <select
                    id="studentId"
                    value={formData.studentId}
                    onChange={(event) => setField('studentId', event.target.value)}
                    className={formErrors.studentId ? 'error' : ''}
                  >
                    <option value="">Select a child</option>
                    {children.map((child) => (
                      <option key={child.id} value={child.id}>{child.name}</option>
                    ))}
                  </select>
                  {formErrors.studentId && <span className="error-text">{formErrors.studentId}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="activityType">Type *</label>
                  <select
                    id="activityType"
                    value={formData.activityType}
                    onChange={(event) => setField('activityType', event.target.value)}
                    className={formErrors.activityType ? 'error' : ''}
                  >
                    {activityOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  {formErrors.activityType && <span className="error-text">{formErrors.activityType}</span>}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="scheduledDate">Date *</label>
                  <input
                    type="date"
                    id="scheduledDate"
                    value={formData.scheduledDate}
                    onChange={(event) => setField('scheduledDate', event.target.value)}
                    className={formErrors.scheduledDate ? 'error' : ''}
                    min={editingSchedule ? undefined : formatDateKey(new Date())}
                  />
                  {formErrors.scheduledDate && <span className="error-text">{formErrors.scheduledDate}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="scheduledTime">Time *</label>
                  <input
                    type="time"
                    id="scheduledTime"
                    value={formData.scheduledTime}
                    onChange={(event) => setField('scheduledTime', event.target.value)}
                    className={formErrors.scheduledTime ? 'error' : ''}
                  />
                  {formErrors.scheduledTime && <span className="error-text">{formErrors.scheduledTime}</span>}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="title">Title *</label>
                <input
                  type="text"
                  id="title"
                  value={formData.title}
                  onChange={(event) => setField('title', event.target.value)}
                  className={formErrors.title ? 'error' : ''}
                  placeholder="Reading reminder"
                />
                {formErrors.title && <span className="error-text">{formErrors.title}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="notes">Notes</label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(event) => setField('notes', event.target.value)}
                  rows="3"
                  placeholder="Optional reminder details"
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : editingSchedule ? 'Update Item' : 'Save Reminder'}
                </button>
                <button type="button" className="btn-secondary" onClick={resetForm}>
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="calendar-workspace">
          <div className="calendar-panel">
            <div className="calendar-toolbar">
              <button type="button" className="btn-icon" onClick={() => moveMonth(-1)} aria-label="Previous month">
                <FiChevronLeft />
              </button>
              <h2>{formatMonthLabel(monthDate)}</h2>
              <button type="button" className="btn-icon" onClick={() => moveMonth(1)} aria-label="Next month">
                <FiChevronRight />
              </button>
            </div>

            <div className="calendar-grid calendar-weekdays">
              {dayNames.map((day) => <div key={day}>{day}</div>)}
            </div>
            <div className="calendar-grid calendar-days" aria-busy={loading}>
              {calendarDays.map((day) => {
                const metrics = metricsByDay.get(day.key);
                const isSelected = selectedDate === day.key;
                return (
                  <button
                    key={day.key}
                    type="button"
                    className={`calendar-day ${day.inMonth ? '' : 'calendar-day--muted'} ${day.isToday ? 'calendar-day--today' : ''} ${isSelected ? 'calendar-day--selected' : ''}`}
                    onClick={() => setSelectedDate(day.key)}
                  >
                    <span className="calendar-day-number">{day.day}</span>
                    {metrics?.hasActivity && (
                      <span className="calendar-day-markers">
                        {metrics.reminderCount > 0 && <i className="calendar-dot calendar-dot--reminder" title="Reminder" />}
                        {metrics.scheduledCount > 0 && <i className="calendar-dot calendar-dot--scheduled" title="Scheduled activity" />}
                        {metrics.learningActivityCount > 0 && <i className="calendar-dot calendar-dot--learning" title="Learning activity" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="calendar-detail-panel">
            <div className="calendar-detail-heading">
              <div>
                <h2>{formatLongDate(selectedDate)}</h2>
                <p>{selectedItems.length} item{selectedItems.length === 1 ? '' : 's'}</p>
              </div>
              <button type="button" className="btn-secondary" onClick={() => openNewReminder(selectedDate)}>
                <FiPlus /> Reminder
              </button>
            </div>

            {loading ? (
              <div className="calendar-empty">Loading calendar data...</div>
            ) : selectedItems.length === 0 ? (
              <div className="calendar-empty">No schedules, reminders, or learning activity found for this day.</div>
            ) : (
              <div className="calendar-event-list">
                {selectedItems.map((item) => {
                  const editable = item.source === 'scheduled_activities';
                  return (
                    <article key={`${item.source}-${item.id}`} className={`calendar-event calendar-event--${item.activityType || item.kind}`}>
                      <div className="calendar-event-main">
                        <span className="calendar-event-type">{item.displayType}</span>
                        <h3>{item.title}</h3>
                        <p><FiUser /> {item.studentName || 'Student'}</p>
                        {item.time && <p><FiClock /> {item.time}</p>}
                        {item.description && <p className="calendar-event-note">{item.description}</p>}
                        {item.durationSeconds > 0 && <p>{Math.round(item.durationSeconds / 60)} tracked minutes</p>}
                        {item.score !== null && item.score !== undefined && <p>Score: {Math.round(Number(item.score))}%</p>}
                      </div>
                      {editable && (
                        <div className="calendar-event-actions">
                          <button type="button" className="btn-icon" onClick={() => handleEditSchedule(item)} aria-label="Edit calendar item">
                            <FiEdit2 />
                          </button>
                          <button type="button" className="btn-icon btn-danger" onClick={() => handleDeleteSchedule(item)} aria-label="Remove calendar item">
                            <FiTrash2 />
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </aside>
        </section>

        <section className="upcoming-reminders-panel">
          <div className="calendar-section-heading">
            <h2>Upcoming Reminders</h2>
            <span>{upcomingReminders.length}</span>
          </div>
          {upcomingReminders.length === 0 ? (
            <div className="calendar-empty">No upcoming reminders.</div>
          ) : (
            <div className="upcoming-reminder-list">
              {upcomingReminders.map((reminder) => (
                <article key={reminder.id} className="upcoming-reminder">
                  <strong>{reminder.title}</strong>
                  <span>{formatLongDate(reminder.date)} {reminder.time ? `at ${reminder.time}` : ''}</span>
                  <small>{reminder.studentName}</small>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

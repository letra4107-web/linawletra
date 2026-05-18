import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import DashboardSidebar from '../components/DashboardSidebar';
import { studentService, scheduleService } from '../services/api';
import { FiCalendar, FiPlus, FiEdit2, FiTrash2, FiClock, FiUser, FiAlertCircle, FiCheck, FiX } from 'react-icons/fi';

export default function Schedules() {
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [children, setChildren] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [formData, setFormData] = useState({
    studentId: '',
    scheduledDate: '',
    scheduledTime: '',
    subject: '',
    notes: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [formLoading, setFormLoading] = useState(false);

  // Fetch schedules and children data
  useEffect(() => {
    if (!user || user.role !== 'parent') return;
    fetchSchedulesData();
  }, [user]);

  const fetchSchedulesData = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch children first
      const childrenResponse = await studentService.getStudents();
      const childrenData = childrenResponse.data || [];
      setChildren(childrenData);

      // Fetch schedules
      const schedulesResponse = await scheduleService.getSchedulesByParent();
      const schedulesData = schedulesResponse.data || [];

      // Enrich schedule data with child and teacher info
      const enrichedSchedules = schedulesData.map(schedule => ({
        ...schedule,
        child: schedule.studentId?.name || 'Unknown Child',
        teacher: schedule.teacherId?.name || 'Unassigned',
        date: new Date(schedule.scheduledDate).toISOString().split('T')[0],
        time: new Date(schedule.scheduledDate).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }),
        subject: schedule.title || 'Session',
        status: getScheduleStatus(schedule),
      }));

      setSchedules(enrichedSchedules);
    } catch (err) {
      console.error('Schedules data fetch error:', err);

      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        setError('Unable to connect to the server. Please check if the backend is running and try again.');
      } else if (err.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (err.response?.status === 403) {
        setError('Access denied. You do not have permission to view this data.');
      } else {
        setError(err.response?.data?.message || 'Failed to load schedules. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getScheduleStatus = (schedule) => {
    const now = new Date();
    const scheduleDateTime = new Date(`${schedule.scheduledDate.split('T')[0]}T${schedule.scheduledTime}`);

    if (scheduleDateTime < now) {
      return 'completed';
    } else if (scheduleDateTime.toDateString() === now.toDateString()) {
      return 'today';
    } else {
      return 'upcoming';
    }
  };

  // Form validation
  const validateForm = () => {
    const errors = {};

    if (!formData.studentId) {
      errors.studentId = 'Please select a child';
    }

    if (!formData.scheduledDate) {
      errors.scheduledDate = 'Date is required';
    } else {
      const selectedDate = new Date(formData.scheduledDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate < today) {
        errors.scheduledDate = 'Date cannot be in the past';
      }
    }

    if (!formData.scheduledTime) {
      errors.scheduledTime = 'Time is required';
    }

    if (!formData.subject.trim()) {
      errors.subject = 'Subject is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    setFormLoading(true);
    setError('');
    setSuccess('');

    try {
      const scheduleData = {
        studentId: formData.studentId,
        title: formData.subject.trim(),
        description: formData.notes.trim(),
        sessionType: 'lesson', // Default to lesson, can be expanded later
        scheduledDate: new Date(`${formData.scheduledDate}T${formData.scheduledTime}`),
        duration: 30, // Default 30 minutes, can be made configurable
      };

      if (editingSchedule) {
        // Update existing schedule
        await scheduleService.updateSchedule(editingSchedule._id, scheduleData);
        setSuccess('Schedule updated successfully!');
      } else {
        // Create new schedule - Note: Currently only teachers can create schedules
        // This might need backend changes to allow parents to create schedules
        await scheduleService.createSchedule(scheduleData);
        setSuccess('Schedule created successfully!');
      }

      // Reset form and refresh data
      setFormData({
        studentId: '',
        scheduledDate: '',
        scheduledTime: '',
        subject: '',
        notes: '',
      });
      setShowForm(false);
      setEditingSchedule(null);
      fetchSchedulesData();

    } catch (err) {
      console.error('Schedule save error:', err);

      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        setError('Unable to connect to the server. Please check your connection and try again.');
      } else if (err.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (err.response?.status === 400) {
        setError('Invalid data provided. Please check your input and try again.');
      } else {
        setError(err.response?.data?.message || 'Failed to save schedule. Please try again.');
      }
    } finally {
      setFormLoading(false);
    }
  };

  // Handle schedule deletion
  const handleDeleteSchedule = async (scheduleId) => {
    if (!window.confirm('Are you sure you want to cancel this session? This action cannot be undone.')) return;

    try {
      await scheduleService.deleteSchedule(scheduleId);
      setSuccess('Schedule cancelled successfully!');
      fetchSchedulesData();
    } catch (err) {
      console.error('Schedule delete error:', err);

      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        setError('Unable to connect to the server. Please check your connection and try again.');
      } else if (err.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (err.response?.status === 404) {
        setError('Schedule not found. It may have already been cancelled.');
      } else {
        setError('Failed to cancel schedule. Please try again.');
      }
    }
  };

  // Handle schedule editing
  const handleEditSchedule = (schedule) => {
    setFormData({
      studentId: schedule.studentId?._id || schedule.studentId || '',
      scheduledDate: schedule.date,
      scheduledTime: schedule.time,
      subject: schedule.title || schedule.subject || '',
      notes: schedule.description || schedule.notes || '',
    });
    setEditingSchedule(schedule);
    setShowForm(true);
  };

  // Clear messages after timeout
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess('');
        setError('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  if (!user || user.role !== 'parent') {
    return <div className="container" style={{ marginTop: '2rem' }}>Access denied. Parent role required.</div>;
  }

  if (loading) {
    return (
      <div className="dashboard-layout">
        <DashboardSidebar />
        <div className="dashboard-content">
          <div style={{ marginTop: '2rem' }}>Loading schedules...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <DashboardSidebar />
      <div className="dashboard-content">
        <h1>Session Schedules</h1>
        <p className="dashboard-subtitle">Manage your children's learning session schedules</p>

        {/* Status Messages */}
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

        {/* Add Schedule Button */}
        <div className="card">
          <button
            className="btn-primary"
            onClick={() => {
              setShowForm(!showForm);
              setEditingSchedule(null);
              setFormData({
                studentId: '',
                scheduledDate: '',
                scheduledTime: '',
                subject: '',
                notes: '',
              });
              setFormErrors({});
            }}
          >
            <FiPlus /> {showForm ? 'Cancel' : 'Schedule New Session'}
          </button>
        </div>

        {/* Add/Edit Schedule Form */}
        {showForm && (
          <div className="card">
            <h3>{editingSchedule ? 'Edit Session' : 'Schedule New Session'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="studentId">Child *</label>
                <select
                  id="studentId"
                  value={formData.studentId}
                  onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                  className={formErrors.studentId ? 'error' : ''}
                >
                  <option value="">Select a child</option>
                  {children.map((child) => (
                    <option key={child._id} value={child._id}>
                      {child.name}
                    </option>
                  ))}
                </select>
                {formErrors.studentId && <span className="error-text">{formErrors.studentId}</span>}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="scheduledDate">Date *</label>
                  <input
                    type="date"
                    id="scheduledDate"
                    value={formData.scheduledDate}
                    onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                    className={formErrors.scheduledDate ? 'error' : ''}
                    min={new Date().toISOString().split('T')[0]}
                  />
                  {formErrors.scheduledDate && <span className="error-text">{formErrors.scheduledDate}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="scheduledTime">Time *</label>
                  <input
                    type="time"
                    id="scheduledTime"
                    value={formData.scheduledTime}
                    onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                    className={formErrors.scheduledTime ? 'error' : ''}
                  />
                  {formErrors.scheduledTime && <span className="error-text">{formErrors.scheduledTime}</span>}
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="subject">Subject *</label>
                <input
                  type="text"
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className={formErrors.subject ? 'error' : ''}
                  placeholder="e.g., Reading, Math, Science"
                />
                {formErrors.subject && <span className="error-text">{formErrors.subject}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="notes">Notes (Optional)</label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes or special instructions"
                  rows="3"
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={formLoading}>
                  {formLoading ? 'Saving...' : (editingSchedule ? 'Update Session' : 'Schedule Session')}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowForm(false);
                    setEditingSchedule(null);
                    setFormData({
                      studentId: '',
                      scheduledDate: '',
                      scheduledTime: '',
                      subject: '',
                      notes: '',
                    });
                    setFormErrors({});
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Schedules List */}
        <div className="schedules-grid">
          {schedules.length === 0 ? (
            <div className="card">
              <p>No sessions scheduled. Click "Schedule New Session" to get started.</p>
            </div>
          ) : (
            <>
              {/* Today's Sessions */}
              {schedules.filter(s => s.status === 'today').length > 0 && (
                <div className="schedule-section">
                  <h3>Today's Sessions</h3>
                  <div className="grid grid-1">
                    {schedules
                      .filter(s => s.status === 'today')
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((schedule) => (
                        <div key={schedule._id} className="card schedule-card today">
                          <div className="schedule-header">
                            <div className="schedule-time">
                              <FiClock /> {schedule.time}
                            </div>
                            <div className="schedule-actions">
                              <button
                                className="btn-icon"
                                onClick={() => handleEditSchedule(schedule)}
                                title="Edit session"
                              >
                                <FiEdit2 />
                              </button>
                              <button
                                className="btn-icon btn-danger"
                                onClick={() => handleDeleteSchedule(schedule._id)}
                                title="Cancel session"
                              >
                                <FiTrash2 />
                              </button>
                            </div>
                          </div>
                          <div className="schedule-body">
                            <h4>{schedule.subject}</h4>
                            <div className="schedule-details">
                              <span><FiUser /> {schedule.child}</span>
                              {schedule.teacher !== 'Unassigned' && (
                                <span>with {schedule.teacher}</span>
                              )}
                            </div>
                            {schedule.notes && (
                              <p className="schedule-notes">{schedule.notes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Upcoming Sessions */}
              {schedules.filter(s => s.status === 'upcoming').length > 0 && (
                <div className="schedule-section">
                  <h3>Upcoming Sessions</h3>
                  <div className="grid grid-2">
                    {schedules
                      .filter(s => s.status === 'upcoming')
                      .sort((a, b) => new Date(a.date) - new Date(b.date) || a.time.localeCompare(b.time))
                      .map((schedule) => (
                        <div key={schedule._id} className="card schedule-card upcoming">
                          <div className="schedule-header">
                            <div className="schedule-date">
                              <FiCalendar /> {new Date(schedule.date).toLocaleDateString()}
                            </div>
                            <div className="schedule-time">
                              <FiClock /> {schedule.time}
                            </div>
                            <div className="schedule-actions">
                              <button
                                className="btn-icon"
                                onClick={() => handleEditSchedule(schedule)}
                                title="Edit session"
                              >
                                <FiEdit2 />
                              </button>
                              <button
                                className="btn-icon btn-danger"
                                onClick={() => handleDeleteSchedule(schedule._id)}
                                title="Cancel session"
                              >
                                <FiTrash2 />
                              </button>
                            </div>
                          </div>
                          <div className="schedule-body">
                            <h4>{schedule.subject}</h4>
                            <div className="schedule-details">
                              <span><FiUser /> {schedule.child}</span>
                              {schedule.teacher !== 'Unassigned' && (
                                <span>with {schedule.teacher}</span>
                              )}
                            </div>
                            {schedule.notes && (
                              <p className="schedule-notes">{schedule.notes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Completed Sessions */}
              {schedules.filter(s => s.status === 'completed').length > 0 && (
                <div className="schedule-section">
                  <h3>Completed Sessions</h3>
                  <div className="grid grid-3">
                    {schedules
                      .filter(s => s.status === 'completed')
                      .sort((a, b) => new Date(b.date) - new Date(a.date))
                      .slice(0, 6) // Show only recent completed sessions
                      .map((schedule) => (
                        <div key={schedule._id} className="card schedule-card completed">
                          <div className="schedule-header">
                            <div className="schedule-date">
                              <FiCalendar /> {new Date(schedule.date).toLocaleDateString()}
                            </div>
                            <div className="schedule-time">
                              <FiClock /> {schedule.time}
                            </div>
                          </div>
                          <div className="schedule-body">
                            <h4>{schedule.subject}</h4>
                            <div className="schedule-details">
                              <span><FiUser /> {schedule.child}</span>
                              {schedule.teacher !== 'Unassigned' && (
                                <span>with {schedule.teacher}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { FiAlertCircle, FiCheck, FiCalendar, FiClock } from 'react-icons/fi';
import { scheduleService, studentService, userService, lessonService } from '../services/api';

export default function ScheduleForm({ onComplete, onCancel }) {
  const [formData, setFormData] = useState({
    studentId: '',
    teacherId: '',
    lessonId: '',
    scheduledDate: '',
    scheduledTime: '',
    sessionType: '',
  });
  
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);
  
  // Fetch students and teachers
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [studentsRes, teachersRes, lessonsRes] = await Promise.all([
          studentService.getAllStudents(),
          userService.getAllTeachers(),
          lessonService.getAllLessons(),
        ]);
        
        setStudents(studentsRes.data || []);
        setTeachers(teachersRes.data || []);
        setLessons(lessonsRes.data || []);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: '',
      }));
    }
  };
  
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.studentId) {
      newErrors.studentId = 'Please select a student';
    }
    
    if (!formData.teacherId) {
      newErrors.teacherId = 'Please select a teacher';
    }
    
    if (!formData.lessonId) {
      newErrors.lessonId = 'Please select a lesson';
    }
    
    if (!formData.scheduledDate) {
      newErrors.scheduledDate = 'Date is required';
    } else {
      const selectedDate = new Date(formData.scheduledDate);
      if (selectedDate < new Date()) {
        newErrors.scheduledDate = 'Date cannot be in the past';
      }
    }
    
    if (!formData.scheduledTime) {
      newErrors.scheduledTime = 'Time is required';
    } else if (!/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(formData.scheduledTime)) {
      newErrors.scheduledTime = 'Please enter time in HH:MM format';
    }
    
    if (!formData.sessionType) {
      newErrors.sessionType = 'Session type is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setSubmitting(true);
    try {
      const response = await scheduleService.createSchedule({
        studentId: formData.studentId,
        teacherId: formData.teacherId,
        lessonId: formData.lessonId,
        scheduledDate: formData.scheduledDate,
        scheduledTime: formData.scheduledTime,
        sessionType: formData.sessionType,
      });
      
      if (response.data.success) {
        setSuccess(true);
        setTimeout(() => {
          onComplete(response.data.data);
        }, 1500);
      } else {
        setErrors({ submit: response.data.message || 'Failed to create schedule' });
      }
    } catch (error) {
      setErrors({ submit: error.response?.data?.message || 'Failed to create schedule' });
    } finally {
      setSubmitting(false);
    }
  };
  
  if (success) {
    return (
      <div 
        style={{
          maxWidth: '600px',
          margin: '0 auto',
          padding: '2rem',
          backgroundColor: 'white',
          borderRadius: '8px',
          textAlign: 'center',
          fontFamily: "'Comic Sans MS', 'Trebuchet MS', Verdana, Arial, sans-serif",
        }}
      >
        <div style={{ marginBottom: '1rem' }}>
          <FiCheck size={64} style={{ color: '#10b981' }} />
        </div>
        <h2 style={{ color: '#10b981', marginTop: 0 }}>Session Scheduled!</h2>
        <p style={{ color: '#666' }}>Your lesson session has been successfully scheduled.</p>
      </div>
    );
  }
  
  return (
    <div 
      style={{
        maxWidth: '600px',
        margin: '0 auto',
        padding: '2rem',
        backgroundColor: 'white',
        borderRadius: '8px',
        fontFamily: "'Comic Sans MS', 'Trebuchet MS', Verdana, Arial, sans-serif",
      }}
    >
      <h1 style={{ color: '#4F46E5', marginTop: 0, fontSize: '28px', letterSpacing: '0.06em' }}>
        Schedule a Lesson
      </h1>
      
      {errors.submit && (
        <div 
          style={{
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            padding: '0.75rem',
            borderRadius: '6px',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <FiAlertCircle size={18} />
          <span>{errors.submit}</span>
        </div>
      )}
      
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Student Selection */}
        <div>
          <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'block' }}>
            Select Student *
          </label>
          <select
            name="studentId"
            value={formData.studentId}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors.studentId ? '2px solid #ef4444' : '1px solid #e5e7eb',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '16px',
              letterSpacing: '0.06em',
            }}
            disabled={loading || submitting}
          >
            <option value="">Choose a student...</option>
            {students.map(student => (
              <option key={student._id} value={student._id}>
                {student.name} (Age {student.age})
              </option>
            ))}
          </select>
          {errors.studentId && (
            <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              <FiAlertCircle size={14} /> {errors.studentId}
            </span>
          )}
        </div>
        
        {/* Teacher Selection */}
        <div>
          <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'block' }}>
            Select Teacher *
          </label>
          <select
            name="teacherId"
            value={formData.teacherId}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors.teacherId ? '2px solid #ef4444' : '1px solid #e5e7eb',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '16px',
              letterSpacing: '0.06em',
            }}
            disabled={loading || submitting}
          >
            <option value="">Choose a teacher...</option>
            {teachers.map(teacher => (
              <option key={teacher._id} value={teacher._id}>
                {teacher.fullName}
              </option>
            ))}
          </select>
          {errors.teacherId && (
            <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              <FiAlertCircle size={14} /> {errors.teacherId}
            </span>
          )}
        </div>
        
        {/* Lesson Selection */}
        <div>
          <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'block' }}>
            Select Lesson *
          </label>
          <select
            name="lessonId"
            value={formData.lessonId}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors.lessonId ? '2px solid #ef4444' : '1px solid #e5e7eb',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '16px',
              letterSpacing: '0.06em',
            }}
            disabled={loading || submitting}
          >
            <option value="">Choose a lesson...</option>
            {lessons.map(lesson => (
              <option key={lesson._id} value={lesson._id}>
                {lesson.title} (Level {lesson.level})
              </option>
            ))}
          </select>
          {errors.lessonId && (
            <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              <FiAlertCircle size={14} /> {errors.lessonId}
            </span>
          )}
        </div>
        
        {/* Date Selection */}
        <div>
          <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FiCalendar size={18} /> Schedule Date *
          </label>
          <input
            type="date"
            name="scheduledDate"
            value={formData.scheduledDate}
            onChange={handleInputChange}
            min={new Date().toISOString().split('T')[0]}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors.scheduledDate ? '2px solid #ef4444' : '1px solid #e5e7eb',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '16px',
              letterSpacing: '0.06em',
            }}
            disabled={submitting}
          />
          {errors.scheduledDate && (
            <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              <FiAlertCircle size={14} /> {errors.scheduledDate}
            </span>
          )}
        </div>
        
        {/* Time Selection */}
        <div>
          <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FiClock size={18} /> Time (HH:MM) *
          </label>
          <input
            type="time"
            name="scheduledTime"
            value={formData.scheduledTime}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors.scheduledTime ? '2px solid #ef4444' : '1px solid #e5e7eb',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '16px',
              letterSpacing: '0.06em',
            }}
            disabled={submitting}
          />
          {errors.scheduledTime && (
            <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              <FiAlertCircle size={14} /> {errors.scheduledTime}
            </span>
          )}
        </div>
        
        {/* Session Type */}
        <div>
          <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'block' }}>
            Session Type *
          </label>
          <select
            name="sessionType"
            value={formData.sessionType}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors.sessionType ? '2px solid #ef4444' : '1px solid #e5e7eb',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '16px',
              letterSpacing: '0.06em',
            }}
            disabled={submitting}
          >
            <option value="">Choose session type...</option>
            <option value="assessment">Assessment</option>
            <option value="lesson">Lesson</option>
            <option value="review">Review</option>
            <option value="practice">Practice</option>
          </select>
          {errors.sessionType && (
            <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              <FiAlertCircle size={14} /> {errors.sessionType}
            </span>
          )}
        </div>
        
        {/* Buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              backgroundColor: '#f3f4f6',
              color: '#1f2937',
              border: '1px solid #e5e7eb',
              padding: '0.75rem 1.5rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '16px',
              fontWeight: '600',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || loading}
            style={{
              backgroundColor: '#4F46E5',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '6px',
              cursor: submitting || loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontSize: '16px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              opacity: submitting || loading ? 0.7 : 1,
            }}
          >
            <FiCheck /> {submitting ? 'Scheduling...' : 'Schedule Session'}
          </button>
        </div>
      </form>
    </div>
  );
}

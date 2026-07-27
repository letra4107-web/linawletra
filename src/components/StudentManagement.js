import React, { useState, useEffect } from 'react';
import { studentService, assessmentService } from '../services/api';
import { FiAlertCircle, FiCheck, FiEdit2, FiTrash2, FiX } from 'react-icons/fi';
import { ACHIEVEMENTS, getAchievementById } from '../services/achievementService';
import AchievementBadge from './AchievementBadge';
import './StudentManagement.css';

export default function StudentManagement() {
  const [students, setStudents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    gradeLevel: '',
    notes: '',
  });

  const [fieldErrors, setFieldErrors] = useState({});

  const gradeLevels = ['Pre-K', 'K', '1', '2', '3', '4', '5', '6', '7', '8'];

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const response = await studentService.getStudents();
      setStudents(response.data?.data?.students ?? response.data?.students ?? response.data ?? []);
      setGeneralError('');
    } catch (error) {
      console.error('Error fetching students:', error);
      setGeneralError('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  // Validate email format
  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Real-time field validation
  const handleFieldChange = (e) => {
    const { name, value } = e.target;
    const trimmedValue = value.trim();

    setFormData(prev => ({
      ...prev,
      [name]: trimmedValue,
    }));

    // Validate field
    let error = '';
    if (name === 'email' && trimmedValue) {
      if (!validateEmail(trimmedValue)) {
        error = 'Please enter a valid email address';
      }
    } else if (name === 'name' && trimmedValue) {
      if (trimmedValue.length < 2) {
        error = 'Name must be at least 2 characters';
      }
    }

    setFieldErrors(prev => ({
      ...prev,
      [name]: error,
    }));
  };

  const validateForm = () => {
    const errors = {};
    let isValid = true;

    if (!formData.email.trim()) {
      errors.email = 'Email is required';
      isValid = false;
    } else if (!validateEmail(formData.email)) {
      errors.email = 'Please enter a valid email address';
      isValid = false;
    }

    if (formData.name && formData.name.length < 2) {
      errors.name = 'Name must be at least 2 characters';
      isValid = false;
    }

    setFieldErrors(errors);
    return isValid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      setGeneralError('Please fix the errors below');
      return;
    }

    setSubmitLoading(true);
    setGeneralError('');
    setSuccessMessage('');

    try {
      const payload = {
        email: formData.email.toLowerCase(),
        ...(formData.name && { name: formData.name }),
        ...(formData.gradeLevel && { gradeLevel: formData.gradeLevel }),
        ...(formData.notes && { notes: formData.notes }),
      };

      if (editingId) {
        await studentService.updateStudent(editingId, payload);
        setSuccessMessage('Student updated successfully!');
        setEditingId(null);
      } else {
        await studentService.createStudent(payload);
        setSuccessMessage('Student enrolled successfully!');
      }

      setFormData({ name: '', email: '', gradeLevel: '', notes: '' });
      setFieldErrors({});
      setShowForm(false);
      await fetchStudents();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Error saving student:', error);
      
      if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
        const errorMessages = error.response.data.errors
          .map(e => e.message)
          .join('. ');
        setGeneralError(errorMessages);
      } else {
        setGeneralError(error.response?.data?.message || 'Failed to save student');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleEdit = (student) => {
    setFormData({
      name: student.name || '',
      email: student.email || '',
      gradeLevel: student.gradeLevel || '',
      notes: student.notes || '',
    });
    setEditingId(student.id);
    setShowForm(true);
    setFieldErrors({});
    setGeneralError('');
  };

  const handleCancel = () => {
    setFormData({ name: '', email: '', gradeLevel: '', notes: '' });
    setFieldErrors({});
    setGeneralError('');
    setEditingId(null);
    setShowForm(false);
  };

  const handleDelete = async (studentId) => {
    if (window.confirm('Are you sure you want to remove this student?')) {
      try {
        await studentService.deleteStudent(studentId);
        await fetchStudents();
        setSuccessMessage('Student removed successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } catch (error) {
        console.error('Error deleting student:', error);
        setGeneralError('Failed to remove student');
      }
    }
  };

  const startAssessment = async (studentId) => {
    try {
      const response = await assessmentService.createAssessment({ studentId });
      window.location.href = `/assessment/${response.data.data?.assessment?.id || response.data.assessment.id}`;
    } catch (error) {
      console.error('Error starting assessment:', error);
      setGeneralError('Failed to start assessment');
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ marginTop: '2rem', textAlign: 'center' }}>
        <p>Loading students...</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ marginTop: '2rem', maxWidth: '1000px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ marginBottom: '0.5rem' }}>Manage Students</h1>
        <p style={{ color: '#666', margin: 0 }}>Add and manage your students' enrollment</p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div
          className="alert alert-success"
          style={{
            backgroundColor: '#d4edda',
            border: '1px solid #c3e6cb',
            color: '#155724',
            padding: '1rem',
            borderRadius: '0.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <FiCheck style={{ flexShrink: 0 }} />
          {successMessage}
        </div>
      )}

      {/* General Error */}
      {generalError && (
        <div
          className="alert alert-error"
          style={{
            backgroundColor: '#f8d7da',
            border: '1px solid #f5c6cb',
            color: '#721c24',
            padding: '1rem',
            borderRadius: '0.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <FiAlertCircle style={{ flexShrink: 0 }} />
          {generalError}
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div
          className="card form-card"
          style={{
            marginBottom: '2rem',
            backgroundColor: '#f9f9f9',
            border: '1px solid #e0e0e0',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ margin: 0 }}>{editingId ? 'Edit Student' : 'Enroll New Student'}</h2>
            <button
              onClick={handleCancel}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#666',
                fontSize: '1.5rem',
              }}
              aria-label="Close form"
            >
              <FiX />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {/* Student Email (Required) */}
              <div>
                <label htmlFor="email" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Student Email <span style={{ color: '#e74c3c' }}>*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleFieldChange}
                  placeholder="student@example.com"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: fieldErrors.email ? '2px solid #e74c3c' : '1px solid #ddd',
                    borderRadius: '0.25rem',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                  }}
                />
                {fieldErrors.email && (
                  <p style={{ color: '#e74c3c', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              {/* Student Name (Optional) */}
              <div>
                <label htmlFor="name" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Student Name <span style={{ fontSize: '0.875rem', color: '#999' }}>(optional)</span>
                </label>
                <input
                  id="name"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleFieldChange}
                  placeholder="e.g., John Smith"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: fieldErrors.name ? '2px solid #e74c3c' : '1px solid #ddd',
                    borderRadius: '0.25rem',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                  }}
                />
                {fieldErrors.name && (
                  <p style={{ color: '#e74c3c', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
                    {fieldErrors.name}
                  </p>
                )}
              </div>

              {/* Grade Level (Optional) */}
              <div>
                <label htmlFor="gradeLevel" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Grade Level <span style={{ fontSize: '0.875rem', color: '#999' }}>(optional)</span>
                </label>
                <select
                  id="gradeLevel"
                  name="gradeLevel"
                  value={formData.gradeLevel}
                  onChange={handleFieldChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '0.25rem',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                  }}
                >
                  <option value="">Select a grade level</option>
                  {gradeLevels.map(grade => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>
              </div>

              {/* Notes (Optional) */}
              <div>
                <label htmlFor="notes" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                  Notes <span style={{ fontSize: '0.875rem', color: '#999' }}>(optional)</span>
                </label>
                <input
                  id="notes"
                  type="text"
                  name="notes"
                  value={formData.notes}
                  onChange={handleFieldChange}
                  placeholder="e.g., Allergies, special needs, etc."
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '0.25rem',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                type="submit"
                disabled={submitLoading}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: submitLoading ? 'not-allowed' : 'pointer',
                  opacity: submitLoading ? 0.6 : 1,
                }}
              >
                {submitLoading ? 'Saving...' : editingId ? 'Update Student' : 'Enroll Student'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#ecf0f1',
                  color: '#333',
                  border: '1px solid #ddd',
                  borderRadius: '0.25rem',
                  fontSize: '1rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Student Button */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#27ae60',
            color: 'white',
            border: 'none',
            borderRadius: '0.25rem',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            marginBottom: '2rem',
          }}
        >
          + Add Student
        </button>
      )}

      {/* Students List */}
      <div>
        <h2 style={{ marginBottom: '1.5rem' }}>Enrolled Students ({students.length})</h2>
        
        {students.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '2rem',
              backgroundColor: '#f9f9f9',
              borderRadius: '0.25rem',
              color: '#999',
            }}
          >
            <p>No students enrolled yet. Add your first student to get started!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {students.map(student => (
              <div
                key={student.id}
                className="student-card"
                style={{
                  backgroundColor: 'white',
                  border: '1px solid #e0e0e0',
                  borderRadius: '0.5rem',
                  padding: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 0.5rem 0' }}>
                    {student.name || 'Student'}
                  </h3>
                  <p style={{ margin: '0.25rem 0', color: '#666' }}>
                    <strong>Email:</strong> {student.email}
                  </p>
                  {student.gradeLevel && (
                    <p style={{ margin: '0.25rem 0', color: '#666' }}>
                      <strong>Grade:</strong> {student.gradeLevel}
                    </p>
                  )}
                  {student.notes && (
                    <p style={{ margin: '0.25rem 0', color: '#666' }}>
                      <strong>Notes:</strong> {student.notes}
                    </p>
                  )}
                  {(() => {
                    const unlockedIds = student.user?.metadata?.unlockedAchievementIds || [];
                    if (unlockedIds.length === 0) {
                      return (
                        <p style={{ margin: '0.5rem 0 0', color: '#999', fontSize: '0.85rem' }}>
                          Wala pang nakukuhang badge.
                        </p>
                      );
                    }
                    const previewBadges = unlockedIds.slice(-5).map(getAchievementById).filter(Boolean);
                    return (
                      <div style={{ marginTop: '0.75rem' }}>
                        <p style={{ margin: '0 0 0.4rem', color: '#4F46E5', fontWeight: 700, fontSize: '0.85rem' }}>
                          🏅 {unlockedIds.length}/{ACHIEVEMENTS.length} na badge
                        </p>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {previewBadges.map((achievement) => (
                            <AchievementBadge key={achievement.id} achievement={achievement} unlocked size="sm" />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginLeft: '1rem' }}>
                  <button
                    onClick={() => handleEdit(student)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#3498db',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.875rem',
                    }}
                  >
                    <FiEdit2 /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(student.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#e74c3c',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.875rem',
                    }}
                  >
                    <FiTrash2 /> Remove
                  </button>
                  <button
                    onClick={() => startAssessment(student.id)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#f39c12',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    Start Assessment
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

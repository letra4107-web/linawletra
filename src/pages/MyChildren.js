import React, { useState, useEffect, useContext, useCallback } from 'react';
import { AuthContext } from '../context/AuthContext';
import DashboardSidebar from '../components/DashboardSidebar';
import { studentService, progressService } from '../services/api';
import { FiPlus, FiEdit2, FiTrash2, FiEye, FiAlertCircle, FiCheck, FiX } from 'react-icons/fi';

const READING_LEVELS = ['beginner', 'intermediate', 'advanced'];
const GRADE_LEVELS = ['1', '2', '3', '4', '5', '6'];

export default function MyChildren() {
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [children, setChildren] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingChild, setEditingChild] = useState(null);
  const [selectedChild, setSelectedChild] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    gradeLevel: '',
    readingLevel: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [formLoading, setFormLoading] = useState(false);

  const fetchChildren = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // Check if user is authenticated
      if (!user) {
        setError('User not authenticated. Please log in.');
        return;
      }

      // Fetch children
      const childrenResponse = await studentService.getStudents();
      const childrenData = childrenResponse.data || childrenResponse.data?.students || [];

      // Fetch progress for each child
      const childrenWithProgress = await Promise.all(
        childrenData.map(async (child) => {
          try {
            const progressResponse = await progressService.getProgressByStudent(child._id);
            const progressData = progressResponse.data || [];
            const latestProgress = progressData.length > 0 ? progressData[progressData.length - 1] : null;

            return {
              ...child,
              progress: latestProgress ? Math.round(latestProgress.score) : 0,
              assessments: progressData.length,
              lastActivity: latestProgress ? new Date(latestProgress.createdAt).toLocaleDateString() : 'No activity',
            };
          } catch (err) {
            return {
              ...child,
              progress: 0,
              assessments: 0,
              lastActivity: 'No activity',
            };
          }
        })
      );

      setChildren(childrenWithProgress);
    } catch (err) {
      console.error('Children fetch error:', err);

      // Provide specific error messages based on error type
      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        setError('Unable to connect to the server. Please check if the backend is running and try again.');
      } else if (err.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (err.response?.status === 403) {
        setError('Access denied. You do not have permission to view this data.');
      } else if (err.response?.status === 404) {
        setError('API endpoint not found. Please contact support.');
      } else {
        setError(err.response?.data?.message || 'Failed to load children data. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Fetch children data
  useEffect(() => {
    if (!user || user.role !== 'parent') return;
    fetchChildren();
  }, [user, fetchChildren]);

  // Form validation
  const validateForm = () => {
    const errors = {};

    // Name validation (required)
    if (!formData.name.trim()) {
      errors.name = 'Child Name is required';
    } else if (formData.name.trim().length < 2) {
      errors.name = 'Child Name must be at least 2 characters';
    }

    // Grade level validation (required)
    if (!formData.gradeLevel) {
      errors.gradeLevel = 'Grade is required';
    } else if (!GRADE_LEVELS.includes(formData.gradeLevel)) {
      errors.gradeLevel = 'Please select a valid grade level';
    }

    // Reading level validation (required)
    if (!formData.readingLevel) {
      errors.readingLevel = 'Reading Level is required';
    } else if (!READING_LEVELS.includes(formData.readingLevel)) {
      errors.readingLevel = 'Please select a valid reading level';
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
      const childData = {
        name: formData.name.trim(),
        gradeLevel: formData.gradeLevel,
        readingLevel: formData.readingLevel,
      };

      if (editingChild) {
        // Update existing child
        await studentService.updateStudent(editingChild._id, childData);
        if (childData.readingLevel) {
          try {
            await studentService.setPracticeLevel(editingChild._id, { level: childData.readingLevel });
          } catch (practiceError) {
            console.warn('Practice level sync failed:', practiceError);
          }
        }
        setSuccess('Child updated successfully!');
      } else {
        // Add new child
        const response = await studentService.createStudent(childData);
        const createdId = response?.data?.data?.student?.id || response?.data?.data?.student?._id || response?.data?.id;
        if (createdId && childData.readingLevel) {
          try {
            await studentService.setPracticeLevel(createdId, { level: childData.readingLevel });
          } catch (practiceError) {
            console.warn('Practice level sync failed:', practiceError);
          }
        }
        setSuccess('Child added successfully!');
      }

      // Reset form and refresh data
      setFormData({ name: '', gradeLevel: '', readingLevel: '' });
      setShowAddForm(false);
      setEditingChild(null);
      fetchChildren();

    } catch (err) {
      console.error('Child save error:', err);

      // Provide specific error messages
      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        setError('Unable to connect to the server. Please check your connection and try again.');
      } else if (err.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (err.response?.status === 400) {
        setError('Invalid data provided. Please check your input and try again.');
      } else {
        setError(err.response?.data?.message || 'Failed to save child. Please try again.');
      }
    } finally {
      setFormLoading(false);
    }
  };

  // Handle child deletion
  const handleDeleteChild = async (childId) => {
    if (!window.confirm('Are you sure you want to remove this child? This action cannot be undone.')) return;

    try {
      await studentService.deleteStudent(childId);
      setSuccess('Child removed successfully!');
      fetchChildren();
    } catch (err) {
      console.error('Child delete error:', err);

      // Provide specific error messages
      if (err.code === 'ERR_NETWORK' || err.message?.includes('Network Error')) {
        setError('Unable to connect to the server. Please check your connection and try again.');
      } else if (err.response?.status === 401) {
        setError('Authentication failed. Please log in again.');
      } else if (err.response?.status === 404) {
        setError('Child not found. It may have already been deleted.');
      } else {
        setError('Failed to remove child. Please try again.');
      }
    }
  };

  // Handle child editing
  const handleEditChild = (child) => {
    setFormData({
      name: child.name || '',
      gradeLevel: child.gradeLevel || '',
      readingLevel: child.readingLevel || '',
    });
    setEditingChild(child);
    setShowAddForm(true);
  };

  // Handle child selection for detailed view
  const handleViewChild = (child) => {
    setSelectedChild(child);
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
          <div style={{ marginTop: '2rem' }}>Loading children...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout">
      <DashboardSidebar />
      <div className="dashboard-content">
        <h1>My Children</h1>
        <p className="dashboard-subtitle">Manage your children's profiles and learning progress</p>

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

        {/* Add Child Button */}
        <div className="card">
          <button
            className="btn-primary"
            onClick={() => {
              setShowAddForm(!showAddForm);
              setEditingChild(null);
              setFormData({ name: '', gradeLevel: '', readingLevel: '' });
              setFormErrors({});
            }}
          >
            <FiPlus /> {showAddForm ? 'Cancel' : 'Add Child'}
          </button>
        </div>

        {/* Add/Edit Child Form */}
        {showAddForm && (
          <div className="card">
            <h3>{editingChild ? 'Edit Child' : 'Add New Child'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="name">Full Name *</label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`form-input ${formErrors.name ? 'error' : formData.name ? 'success' : ''}`}
                  placeholder="Enter child's full name"
                />
                {formErrors.name && <span className="error-text">{formErrors.name}</span>}
              </div>


              <div className="form-group">
                <label htmlFor="gradeLevel">Grade Level</label>
                <select
                  id="gradeLevel"
                  value={formData.gradeLevel}
                  onChange={(e) => setFormData({ ...formData, gradeLevel: e.target.value })}
                  className={`form-input ${formErrors.gradeLevel ? 'error' : formData.gradeLevel ? 'success' : ''}`}
                >
                  <option value="">Select grade level</option>
                  <option value="1">Grade 1</option>
                  <option value="2">Grade 2</option>
                  <option value="3">Grade 3</option>
                  <option value="4">Grade 4</option>
                  <option value="5">Grade 5</option>
                  <option value="6">Grade 6</option>
                </select>
                {formErrors.gradeLevel && <span className="error-text">{formErrors.gradeLevel}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="readingLevel">Reading Level</label>
                <select
                  id="readingLevel"
                  value={formData.readingLevel}
                  onChange={(e) => setFormData({ ...formData, readingLevel: e.target.value })}
                  className={`form-input ${formErrors.readingLevel ? 'error' : formData.readingLevel ? 'success' : ''}`}
                >
                  <option value="">Select reading level</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
                {formErrors.readingLevel && <span className="error-text">{formErrors.readingLevel}</span>}
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-primary" disabled={formLoading}>
                  {formLoading ? 'Saving...' : (editingChild ? 'Update Child' : 'Add Child')}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingChild(null);
                    setFormData({ name: '', gradeLevel: '', readingLevel: '' });
                    setFormErrors({});
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Children List */}
        <div className="grid grid-3">
          {children.length === 0 ? (
            <div className="card">
              <p>No children added yet. Click "Add Child" to get started.</p>
            </div>
          ) : (
            children.map((child) => (
              <div key={child._id || child.email} className="card dashboard-card">
                <div className="card-header">
                  <div>
                    <h3>{child.name || child.email}</h3>
                    <p className="card-subtitle">Reading level: {child.readingLevel ? child.readingLevel.charAt(0).toUpperCase() + child.readingLevel.slice(1) : 'Not set'}</p>
                  </div>
                  <div className="card-actions">
                    <button
                      className="btn-icon"
                      onClick={() => handleViewChild(child)}
                      title="View details"
                    >
                      <FiEye />
                    </button>
                    <button
                      className="btn-icon"
                      onClick={() => handleEditChild(child)}
                      title="Edit child"
                    >
                      <FiEdit2 />
                    </button>
                    <button
                      className="btn-icon btn-danger"
                      onClick={() => handleDeleteChild(child._id)}
                      title="Remove child"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${child.progress}%` }}
                    ></div>
                  </div>
                  <p className="progress-text">{child.progress}% Complete</p>
                  <div className="card-stats">
                    <span>{child.assessments} assessments</span>
                    <span>Last activity: {child.lastActivity}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Child Detail Modal/View */}
        {selectedChild && (
          <div className="modal-overlay" onClick={() => setSelectedChild(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{selectedChild.name}'s Details</h3>
                <button className="modal-close" onClick={() => setSelectedChild(null)}>
                  <FiX />
                </button>
              </div>
              <div className="modal-body">
                <div className="child-detail-grid">
                  <div className="detail-item">
                    <label>Name:</label>
                    <span>{selectedChild.name}</span>
                  </div>
                  <div className="detail-item">
                    <label>Email:</label>
                    <span>{selectedChild.email}</span>
                  </div>
                  <div className="detail-item">
                    <label>Grade Level:</label>
                    <span>{selectedChild.gradeLevel || 'Not specified'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Reading Level:</label>
                    <span>{selectedChild.readingLevel ? selectedChild.readingLevel.charAt(0).toUpperCase() + selectedChild.readingLevel.slice(1) : 'Not specified'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Progress:</label>
                    <span>{selectedChild.progress}%</span>
                  </div>
                  <div className="detail-item">
                    <label>Assessments Completed:</label>
                    <span>{selectedChild.assessments}</span>
                  </div>
                  <div className="detail-item">
                    <label>Last Activity:</label>
                    <span>{selectedChild.lastActivity}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
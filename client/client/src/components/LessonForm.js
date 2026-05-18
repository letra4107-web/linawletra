import React, { useState } from 'react';
import { FiAlertCircle, FiCheck, FiUpload } from 'react-icons/fi';
import { lessonService } from '../services/api';
import { sanitizeInput } from '../services/validation';

export default function LessonForm({ onComplete, onCancel }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    level: '',
    tagalogText: '',
    content: '',
    estimatedDuration: '',
  });
  
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState(false);
  
  const categories = [
    'alphabetRecognition',
    'letterIdentification',
    'letterFormation',
    'readingAbility',
    'writingAbility',
  ];
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    let sanitizedValue = value;
    if (name === 'title') {
      sanitizedValue = sanitizeInput(value).slice(0, 100);
    } else if (name === 'description') {
      sanitizedValue = sanitizeInput(value).slice(0, 500);
    } else if (name === 'content') {
      sanitizedValue = sanitizeInput(value);
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: sanitizedValue,
    }));
    
    // Clear field error on change
    if (fieldErrors[name]) {
      setFieldErrors(prev => ({
        ...prev,
        [name]: '',
      }));
    }
  };
  
  const handleFileChange = (e) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      // Validate file type and size
      const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
      const maxSize = 5 * 1024 * 1024; // 5MB
      
      if (!validTypes.includes(uploadedFile.type)) {
        setFieldErrors(prev => ({
          ...prev,
          file: 'Only JPG, PNG, and PDF files are allowed',
        }));
        return;
      }
      
      if (uploadedFile.size > maxSize) {
        setFieldErrors(prev => ({
          ...prev,
          file: 'File size must be less than 5MB',
        }));
        return;
      }
      
      setFile(uploadedFile);
      setFieldErrors(prev => ({
        ...prev,
        file: '',
      }));
    }
  };
  
  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.title.trim()) {
      newErrors.title = 'Lesson title is required';
    } else if (formData.title.length > 100) {
      newErrors.title = 'Title must not exceed 100 characters';
    }
    
    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    } else if (formData.description.length > 500) {
      newErrors.description = 'Description must not exceed 500 characters';
    }
    
    if (!formData.category) {
      newErrors.category = 'Category is required';
    }
    
    if (!formData.level) {
      newErrors.level = 'Difficulty level is required';
    }
    
    if (!formData.content.trim()) {
      newErrors.content = 'Content/Instructions are required';
    }
    
    if (formData.estimatedDuration && isNaN(parseInt(formData.estimatedDuration))) {
      newErrors.estimatedDuration = 'Duration must be a number';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('title', formData.title);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('category', formData.category);
      formDataToSend.append('level', formData.level);
      formDataToSend.append('tagalogText', formData.tagalogText);
      formDataToSend.append('content', formData.content);
      formDataToSend.append('estimatedDuration', formData.estimatedDuration || 30);
      
      if (file) {
        formDataToSend.append('file', file);
      }
      
      const response = await lessonService.createLesson(formDataToSend);
      
      if (response.data.success) {
        setSuccess(true);
        setTimeout(() => {
          onComplete(response.data.data);
        }, 1500);
      } else {
        setErrors({ submit: response.data.message || 'Failed to create lesson' });
      }
    } catch (error) {
      setErrors({ submit: error.response?.data?.message || 'Failed to create lesson' });
    } finally {
      setLoading(false);
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
          fontFamily: 'Josefin Sans, sans-serif',
        }}
      >
        <div style={{ marginBottom: '1rem' }}>
          <FiCheck size={64} style={{ color: '#10b981' }} />
        </div>
        <h2 style={{ color: '#10b981', marginTop: 0 }}>Lesson Created!</h2>
        <p style={{ color: '#666' }}>Your lesson has been successfully created and is ready for students.</p>
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
        fontFamily: 'Josefin Sans, sans-serif',
      }}
    >
      <h1 style={{ color: '#2d9c78', marginTop: 0, fontSize: '28px', letterSpacing: '0.06em' }}>
        Create New Lesson
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
        {/* Title */}
        <div>
          <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'block' }}>
            Lesson Title * ({formData.title.length}/100)
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            placeholder="e.g., Introduction to Letter A"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors.title ? '2px solid #ef4444' : '1px solid #e5e7eb',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '16px',
              letterSpacing: '0.06em',
            }}
            disabled={loading}
          />
          {errors.title && (
            <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              <FiAlertCircle size={14} /> {errors.title}
            </span>
          )}
        </div>
        
        {/* Description */}
        <div>
          <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'block' }}>
            Description * ({formData.description.length}/500)
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            placeholder="Describe the lesson content..."
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors.description ? '2px solid #ef4444' : '1px solid #e5e7eb',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '16px',
              letterSpacing: '0.06em',
              minHeight: '100px',
              resize: 'vertical',
            }}
            disabled={loading}
          />
          {errors.description && (
            <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              <FiAlertCircle size={14} /> {errors.description}
            </span>
          )}
        </div>
        
        {/* Category */}
        <div>
          <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'block' }}>
            Category *
          </label>
          <select
            name="category"
            value={formData.category}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors.category ? '2px solid #ef4444' : '1px solid #e5e7eb',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '16px',
              letterSpacing: '0.06em',
            }}
            disabled={loading}
          >
            <option value="">Select a category</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat.replace(/([A-Z])/g, ' $1').trim()}
              </option>
            ))}
          </select>
          {errors.category && (
            <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              <FiAlertCircle size={14} /> {errors.category}
            </span>
          )}
        </div>
        
        {/* Level */}
        <div>
          <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'block' }}>
            Difficulty Level *
          </label>
          <select
            name="level"
            value={formData.level}
            onChange={handleInputChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors.level ? '2px solid #ef4444' : '1px solid #e5e7eb',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '16px',
              letterSpacing: '0.06em',
            }}
            disabled={loading}
          >
            <option value="">Select a level</option>
            <option value="1">Beginner (Level 1)</option>
            <option value="2">Intermediate (Level 2)</option>
            <option value="3">Advanced (Level 3)</option>
          </select>
          {errors.level && (
            <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              <FiAlertCircle size={14} /> {errors.level}
            </span>
          )}
        </div>
        
        {/* Tagalog Text */}
        <div>
          <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'block' }}>
            Tagalog Text
          </label>
          <input
            type="text"
            name="tagalogText"
            value={formData.tagalogText}
            onChange={handleInputChange}
            placeholder="e.g., Ang alpabeto"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '16px',
              letterSpacing: '0.06em',
            }}
            disabled={loading}
          />
        </div>
        
        {/* Content */}
        <div>
          <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'block' }}>
            Content / Instructions *
          </label>
          <textarea
            name="content"
            value={formData.content}
            onChange={handleInputChange}
            placeholder="Detailed lesson content and instructions..."
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors.content ? '2px solid #ef4444' : '1px solid #e5e7eb',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '16px',
              letterSpacing: '0.06em',
              minHeight: '120px',
              resize: 'vertical',
            }}
            disabled={loading}
          />
          {errors.content && (
            <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              <FiAlertCircle size={14} /> {errors.content}
            </span>
          )}
        </div>
        
        {/* Estimated Duration */}
        <div>
          <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'block' }}>
            Estimated Duration (minutes)
          </label>
          <input
            type="number"
            name="estimatedDuration"
            value={formData.estimatedDuration}
            onChange={handleInputChange}
            placeholder="e.g., 30"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: errors.estimatedDuration ? '2px solid #ef4444' : '1px solid #e5e7eb',
              borderRadius: '6px',
              fontFamily: 'inherit',
              fontSize: '16px',
              letterSpacing: '0.06em',
            }}
            disabled={loading}
          />
          {errors.estimatedDuration && (
            <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              <FiAlertCircle size={14} /> {errors.estimatedDuration}
            </span>
          )}
        </div>
        
        {/* File Upload */}
        <div>
          <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'block' }}>
            Lesson Resource (optional)
          </label>
          <label 
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '1.5rem',
              border: '2px dashed #2d9c78',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              backgroundColor: '#f0fdf4',
            }}
          >
            <FiUpload size={20} style={{ color: '#2d9c78' }} />
            <span style={{ color: '#2d9c78', fontWeight: '600' }}>
              {file ? `${file.name} (${(file.size / 1024).toFixed(2)} KB)` : 'Upload JPG, PNG, or PDF (max 5MB)'}
            </span>
            <input
              type="file"
              onChange={handleFileChange}
              accept=".jpg,.jpeg,.png,.pdf"
              style={{ display: 'none' }}
              disabled={loading}
            />
          </label>
          {fieldErrors.file && (
            <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              <FiAlertCircle size={14} /> {fieldErrors.file}
            </span>
          )}
        </div>
        
        {/* Buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
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
            disabled={loading}
            style={{
              backgroundColor: '#2d9c78',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontSize: '16px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <FiCheck /> {loading ? 'Creating...' : 'Create Lesson'}
          </button>
        </div>
      </form>
    </div>
  );
}

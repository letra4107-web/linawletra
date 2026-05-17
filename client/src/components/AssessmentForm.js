import React, { useState } from 'react';
import { FiAlertCircle, FiCheck, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { assessmentService } from '../services/api';
import { validateScore, validateLetterInput } from '../services/validation';

export default function AssessmentForm({ studentId, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [scores, setScores] = useState({
    alphabetRecognition: '',
    letterIdentification: '',
    letterFormation: '',
    readingAbility: '',
    writingAbility: '',
  });
  
  const [inputs, setInputs] = useState({
    letterRecognitionInput: '',
    letterFormationInput: '',
    readingInput: '',
    writingInput: '',
  });
  
  const [fieldErrors, setFieldErrors] = useState({});
  
  const steps = [
    {
      title: 'Letter Recognition',
      subtitle: 'Can the student recognize letters A-Z?',
      description: 'Enter your observation score (0-100)',
      fieldName: 'alphabetRecognition',
      type: 'score',
    },
    {
      title: 'Letter Identification',
      subtitle: 'Can the student identify letter sounds?',
      description: 'Enter your observation score (0-100)',
      fieldName: 'letterIdentification',
      type: 'score',
    },
    {
      title: 'Letter Formation',
      subtitle: 'Can the student form letters correctly?',
      description: 'Ask student to write letters. Enter score (0-100)',
      fieldName: 'letterFormation',
      type: 'score',
    },
    {
      title: 'Reading Ability',
      subtitle: 'Can the student read simple words?',
      description: 'Ask student to read short Tagalog words. Enter score (0-100)',
      fieldName: 'readingAbility',
      type: 'score',
    },
    {
      title: 'Writing Ability',
      subtitle: 'Can the student write simple words?',
      description: 'Ask student to write simple Tagalog words. Enter score (0-100)',
      fieldName: 'writingAbility',
      type: 'score',
    },
  ];
  
  const currentStepData = steps[currentStep];
  
  const handleScoreChange = (e) => {
    const value = e.target.value;
    
    setScores(prev => ({
      ...prev,
      [currentStepData.fieldName]: value,
    }));
    
    if (fieldErrors[currentStepData.fieldName]) {
      setFieldErrors(prev => ({
        ...prev,
        [currentStepData.fieldName]: '',
      }));
    }
  };
  
  const validateCurrentStep = () => {
    const scoreValue = scores[currentStepData.fieldName];
    if (!scoreValue) {
      setFieldErrors(prev => ({
        ...prev,
        [currentStepData.fieldName]: 'Score is required',
      }));
      return false;
    }
    
    const validation = validateScore(scoreValue);
    if (!validation.valid) {
      setFieldErrors(prev => ({
        ...prev,
        [currentStepData.fieldName]: validation.error,
      }));
      return false;
    }
    
    return true;
  };
  
  const handleNext = () => {
    if (!validateCurrentStep()) return;
    
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      setError('');
    }
  };
  
  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setError('');
    }
  };
  
  const handleSubmit = async () => {
    if (!validateCurrentStep()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await assessmentService.submitAssessment({
        studentId,
        ...scores,
      });
      
      if (response.data.success) {
        onComplete(response.data.data);
      } else {
        setError(response.data.message || 'Failed to submit assessment');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit assessment');
    } finally {
      setLoading(false);
    }
  };
  
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
      {/* Progress Bar */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '14px', color: '#666' }}>
            Step {currentStep + 1} of {steps.length}
          </span>
          <span style={{ fontSize: '14px', color: '#999' }}>
            {Math.round(((currentStep + 1) / steps.length) * 100)}%
          </span>
        </div>
        <div style={{ height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
          <div 
            style={{
              height: '100%',
              width: `${((currentStep + 1) / steps.length) * 100}%`,
              backgroundColor: '#2d9c78',
              transition: 'width 0.3s',
            }}
          ></div>
        </div>
      </div>
      
      {/* Error Alert */}
      {error && (
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
          <span>{error}</span>
        </div>
      )}
      
      {/* Step Content */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ color: '#2d9c78', marginTop: 0, fontSize: '24px', letterSpacing: '0.06em' }}>
          {currentStepData.title}
        </h2>
        <p style={{ color: '#666', fontSize: '16px', marginTop: '0.5rem' }}>
          {currentStepData.subtitle}
        </p>
        <p style={{ color: '#999', fontSize: '14px', marginTop: '1rem' }}>
          {currentStepData.description}
        </p>
        
        {/* Score Input */}
        <div style={{ marginTop: '1.5rem' }}>
          <label style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.5rem', display: 'block' }}>
            Score (0-100) *
          </label>
          <input
            type="number"
            min="0"
            max="100"
            value={scores[currentStepData.fieldName]}
            onChange={handleScoreChange}
            placeholder="e.g., 85"
            style={{
              width: '100%',
              padding: '0.75rem',
              border: fieldErrors[currentStepData.fieldName] ? '2px solid #ef4444' : '1px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '16px',
              fontFamily: 'inherit',
              letterSpacing: '0.06em',
            }}
            disabled={loading}
          />
          {fieldErrors[currentStepData.fieldName] && (
            <span style={{ color: '#ef4444', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}>
              <FiAlertCircle size={14} /> {fieldErrors[currentStepData.fieldName]}
            </span>
          )}
        </div>
      </div>
      
      {/* Navigation Buttons */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
        <button
          onClick={handlePrevious}
          disabled={currentStep === 0 || loading}
          style={{
            backgroundColor: currentStep === 0 ? '#e5e7eb' : '#f3f4f6',
            color: currentStep === 0 ? '#999' : '#1f2937',
            border: '1px solid #e5e7eb',
            padding: '0.75rem 1rem',
            borderRadius: '6px',
            cursor: currentStep === 0 || loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontFamily: 'inherit',
            fontSize: '16px',
            fontWeight: '600',
          }}
        >
          <FiChevronLeft /> Previous
        </button>
        
        {currentStep < steps.length - 1 ? (
          <button
            onClick={handleNext}
            disabled={loading}
            style={{
              backgroundColor: '#2d9c78',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontFamily: 'inherit',
              fontSize: '16px',
              fontWeight: '600',
              opacity: loading ? 0.7 : 1,
            }}
          >
            Next <FiChevronRight />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontFamily: 'inherit',
              fontSize: '16px',
              fontWeight: '600',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <FiCheck /> {loading ? 'Submitting...' : 'Submit Assessment'}
          </button>
        )}
      </div>
    </div>
  );
}

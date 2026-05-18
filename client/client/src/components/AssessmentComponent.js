import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { assessmentService } from '../services/api';

const ASSESSMENT_CATEGORIES = [
  { key: 'alphabetRecognition', label: 'Alphabet Recognition' },
  { key: 'letterIdentification', label: 'Letter Identification (I vs L)' },
  { key: 'letterFormation', label: 'Letter Formation' },
  { key: 'readingAbility', label: 'Reading Ability' },
  { key: 'writingAbility', label: 'Writing Ability' },
];

export default function AssessmentComponent() {
  const { assessmentId } = useParams();
  const [currentCategory, setCurrentCategory] = useState('alphabetRecognition');
  const [categoryScores, setCategoryScores] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeScores = () => {
      const scores = {};
      ASSESSMENT_CATEGORIES.forEach(cat => {
        scores[cat.key] = 50;
      });
      setCategoryScores(scores);
      setLoading(false);
    };
    initializeScores();
  }, []);

  const handleScoreChange = (value) => {
    setCategoryScores(prev => ({
      ...prev,
      [currentCategory]: parseInt(value),
    }));
  };

  const handleSubmit = async () => {
    try {
      await assessmentService.updateAssessmentScores(assessmentId, {
        categories: categoryScores,
      });
      alert('Assessment submitted successfully!');
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Error submitting assessment:', error);
      alert('Error submitting assessment');
    }
  };

  if (loading) return <div className="container" style={{ marginTop: '2rem' }}>Loading...</div>;

  const currentCategoryLabel = ASSESSMENT_CATEGORIES.find(c => c.key === currentCategory)?.label;
  const progress = ASSESSMENT_CATEGORIES.filter(c => c.key <= currentCategory).length;

  return (
    <div className="container" style={{ maxWidth: '600px', marginTop: '2rem' }}>
      <div className="card">
        <h1>📝 Literacy Assessment</h1>
        <p style={{ color: 'var(--secondary-text)', marginBottom: '1.5rem' }}>
          Assessment {progress} of {ASSESSMENT_CATEGORIES.length}: {currentCategoryLabel}
        </p>

        <div style={{
          backgroundColor: 'var(--light-bg)',
          padding: '2rem',
          borderRadius: '8px',
          textAlign: 'center',
          marginBottom: '2rem',
        }}>
          <h2 style={{ marginBottom: '1rem' }}>{currentCategoryLabel}</h2>
          <p style={{ marginBottom: '2rem', color: 'var(--secondary-text)' }}>
            Score: {categoryScores[currentCategory]}/100
          </p>
          <input
            type="range"
            min="0"
            max="100"
            value={categoryScores[currentCategory]}
            onChange={(e) => handleScoreChange(e.target.value)}
            style={{ width: '100%', height: '8px', cursor: 'pointer' }}
          />
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <p style={{ marginBottom: '1rem', fontWeight: '600' }}>Progress:</p>
          <div style={{
            backgroundColor: 'var(--light-bg)',
            borderRadius: '8px',
            overflow: 'hidden',
            height: '20px',
          }}>
            <div style={{
              backgroundColor: 'var(--primary-green)',
              height: '100%',
              width: `${(progress / ASSESSMENT_CATEGORIES.length) * 100}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            className="btn-secondary"
            onClick={() => {
              const currentIndex = ASSESSMENT_CATEGORIES.findIndex(c => c.key === currentCategory);
              if (currentIndex > 0) {
                setCurrentCategory(ASSESSMENT_CATEGORIES[currentIndex - 1].key);
              }
            }}
            disabled={progress === 1}
          >
            Previous
          </button>
          {progress < ASSESSMENT_CATEGORIES.length ? (
            <button
              className="btn-primary"
              onClick={() => {
                const currentIndex = ASSESSMENT_CATEGORIES.findIndex(c => c.key === currentCategory);
                setCurrentCategory(ASSESSMENT_CATEGORIES[currentIndex + 1].key);
              }}
            >
              Next
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={handleSubmit}
            >
              Submit Assessment
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

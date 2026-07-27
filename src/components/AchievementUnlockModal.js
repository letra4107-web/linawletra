import React, { useEffect, useState } from 'react';
import './AchievementUnlockModal.css';

export default function AchievementUnlockModal({ achievements, onClose }) {
  const [index, setIndex] = useState(0);
  const queue = achievements || [];
  const current = queue[index];

  useEffect(() => {
    setIndex(0);
  }, [queue.length]);

  if (!current) return null;

  const isLast = index === queue.length - 1;

  const handleNext = () => {
    if (isLast) {
      onClose();
    } else {
      setIndex((prev) => prev + 1);
    }
  };

  return (
    <div className="achievement-unlock-overlay" role="dialog" aria-modal="true" aria-label="Bagong Badge">
      <div className="achievement-unlock-card">
        <p className="achievement-unlock-eyebrow">Bagong Badge!</p>
        <div className="achievement-unlock-image-wrap">
          <img src={current.image} alt={current.name} className="achievement-unlock-image" />
        </div>
        <h2 className="achievement-unlock-name">{current.name}</h2>
        <p className="achievement-unlock-description">{current.description}</p>
        {queue.length > 1 && (
          <p className="achievement-unlock-progress">{index + 1} / {queue.length}</p>
        )}
        <button type="button" className="achievement-unlock-btn" onClick={handleNext}>
          {isLast ? 'Magaling!' : 'Susunod'}
        </button>
      </div>
    </div>
  );
}

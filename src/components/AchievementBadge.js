import React from 'react';
import './AchievementBadge.css';

export default function AchievementBadge({ achievement, unlocked, size = 'md' }) {
  if (!achievement) return null;
  return (
    <div
      className={`achievement-badge-tile achievement-badge-tile--${size} ${unlocked ? 'is-unlocked' : 'is-locked'}`}
      title={unlocked ? achievement.description : 'Hindi pa nakukuha — magpatuloy sa pagsasanay!'}
    >
      <div className="achievement-badge-image-wrap">
        <img src={achievement.image} alt={achievement.name} className="achievement-badge-image" />
        {!unlocked && <span className="achievement-badge-lock" aria-hidden="true">🔒</span>}
      </div>
      <span className="achievement-badge-name">{achievement.name}</span>
    </div>
  );
}

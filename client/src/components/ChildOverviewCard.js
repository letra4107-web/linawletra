import React from 'react';
import './ChildOverviewCard.css';

/**
 * ChildOverviewCard Component
 * 
 * Displays a clean, emotionally engaging overview of a single child's status
 * answering "Kumusta anak ko ngayon?" (How is my child doing now?)
 * 
 * Props:
 * - child: { name, avatar, readingLevel, gradeLevel, lastActive, progressPercentage }
 * - isActive: boolean (highlight if selected)
 * - onClick: callback when card is clicked
 */
const ChildOverviewCard = ({ child, isActive, onClick }) => {
  if (!child) return null;

  const {
    name = 'Child',
    avatar,
    readingLevel = '—',
    gradeLevel = '—',
    lastActive = '—',
    progressPercentage = 0,
  } = child;

  // Determine progress status label and color
  const getProgressStatus = (percentage) => {
    const pct = Number(percentage) || 0;
    if (pct >= 75) return { label: 'On Track', variant: 'on-track' };
    if (pct >= 50) return { label: 'Improving', variant: 'improving' };
    return { label: 'Needs Support', variant: 'needs-support' };
  };

  const progressStatus = getProgressStatus(progressPercentage);

  // Format reading level for display
  const formatReadingLevel = (level) => {
    if (!level) return '—';
    return String(level).charAt(0).toUpperCase() + String(level).slice(1).toLowerCase();
  };

  // Get avatar initials or use avatar prop
  const getAvatarContent = () => {
    if (avatar) return avatar;
    return String(name).charAt(0).toUpperCase();
  };

  // Extract last active time info
  const formatLastActive = (time) => {
    if (!time || time === '—') return 'Not active yet';
    return time;
  };

  return (
    <div
      className={`child-overview-card ${isActive ? 'is-active' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`Child overview: ${name}`}
    >
      {/* Header: Avatar + Name + Status */}
      <div className="child-overview-card__header">
        <div className="child-overview-card__avatar">{getAvatarContent()}</div>
        <div className="child-overview-card__identity">
          <div className="child-overview-card__name">{name}</div>
          <div className="child-overview-card__status-badge">
            <span className={`status-badge status-badge--${progressStatus.variant}`}>
              {progressStatus.label}
            </span>
          </div>
        </div>
      </div>

      {/* Learning Status Section */}
      <div className="child-overview-card__section">
        <div className="child-overview-card__section-title">📚 Learning Status</div>
        <div className="child-overview-card__meta-grid">
          <div className="child-overview-card__meta">
            <div className="child-overview-card__meta-label">Reading Level</div>
            <div className="child-overview-card__meta-value">
              {formatReadingLevel(readingLevel)}
            </div>
          </div>
          <div className="child-overview-card__meta">
            <div className="child-overview-card__meta-label">Grade Level</div>
            <div className="child-overview-card__meta-value">Grade {gradeLevel}</div>
          </div>
        </div>
      </div>

      {/* Activity Status Section */}
      <div className="child-overview-card__section">
        <div className="child-overview-card__section-title">⏱ Activity Status</div>
        <div className="child-overview-card__last-active">
          {formatLastActive(lastActive)}
        </div>
      </div>

      {/* Progress Indicator Section */}
      <div className="child-overview-card__section">
        <div className="child-overview-card__progress-label">
          <span>📊 Overall Progress</span>
          <span className="child-overview-card__progress-value">
            {progressPercentage}%
          </span>
        </div>
        <div className="child-overview-card__progress-bar-container">
          <div
            className="child-overview-card__progress-bar"
            style={{ width: `${Math.max(0, Math.min(100, progressPercentage))}%` }}
            role="progressbar"
            aria-valuenow={progressPercentage}
            aria-valuemin="0"
            aria-valuemax="100"
          />
        </div>
        <div className="child-overview-card__progress-note">
          {progressPercentage >= 75
            ? '🎉 Great progress! Keep it up!'
            : progressPercentage >= 50
              ? '📈 Steady improvement. Keep learning!'
              : '💡 More practice needed. You got this!'}
        </div>
      </div>

      {/* Footer: Interactive Hint */}
      {onClick && (
        <div className="child-overview-card__footer">
          <div className="child-overview-card__footer-hint">View detailed progress →</div>
        </div>
      )}
    </div>
  );
};

export default ChildOverviewCard;

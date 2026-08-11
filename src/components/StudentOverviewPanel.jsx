import React from 'react';
import { normalizeStudentSummary, isWordOfDayDoneToday } from '../utils/normalizeStudentSummary';

// Shared "at a glance" student overview, shown right under StudentSelector on
// both the Parent and Teacher dashboards. Presentational only — every field
// is fed from data the caller has already fetched (word mastery, confusion
// patterns, practice recommendations, recent activity), reusing the same
// endpoints/shapes both dashboards already call elsewhere this session.
//
// "Progress to Next Lesson" is interpreted as progress toward the next
// phonetic level (Easy/Medium/Hard) — this app has no separate lesson-
// assignment concept beyond phonetic-level word practice, and
// StudentDashboard.js itself frames progression the same way.
export default function StudentOverviewPanel({
  student,
  wordMastery,
  confusionPatterns = [],
  recommendedWords = [],
  recentActivity = [],
  accentClass = '',
}) {
  if (!student) return null;

  const summary = normalizeStudentSummary(student);
  const counts = wordMastery?.counts || { mastered: 0, needsPractice: 0, difficult: 0 };
  const wordOfDayDone = isWordOfDayDoneToday(summary.wordOfDayCompletedDate);
  const patterns = Array.isArray(confusionPatterns) ? confusionPatterns : [];
  const recommendations = Array.isArray(recommendedWords) ? recommendedWords : [];
  const activity = Array.isArray(recentActivity) ? recentActivity : [];

  return (
    <section className={`student-overview-panel ${accentClass}`} aria-label={`${summary.name}'s overview`}>
      <header className="student-overview-panel__head">
        <div>
          <div className="student-overview-panel__name">{summary.name}</div>
          <div className="student-overview-panel__level">Reading level: {summary.readingLevel}</div>
        </div>
        <div className={`student-overview-panel__word-of-day ${wordOfDayDone ? 'is-done' : ''}`}>
          {wordOfDayDone ? 'Word of the Day: done today' : 'Word of the Day: not yet today'}
        </div>
      </header>

      <div className="student-overview-panel__progress">
        <div className="student-overview-panel__progress-label">
          Progress to next level ({summary.currentPhoneticLevel})
          <span>{summary.progressInCurrentLevel} / {summary.phoneticThreshold}</span>
        </div>
        <div className="student-overview-panel__progress-track">
          <div
            className="student-overview-panel__progress-fill"
            style={{ width: `${summary.progressToNextLevelPercent}%` }}
          />
        </div>
      </div>

      <div className="student-overview-panel__stats">
        <div className="student-overview-panel__stat">
          <span className="student-overview-panel__stat-value">{summary.streak}</span>
          <span className="student-overview-panel__stat-label">Current streak</span>
        </div>
        <div className="student-overview-panel__stat">
          <span className="student-overview-panel__stat-value">{summary.longestStreak}</span>
          <span className="student-overview-panel__stat-label">Longest streak</span>
        </div>
        <div className="student-overview-panel__stat">
          <span className="student-overview-panel__stat-value">{summary.allTimeAccuracy}%</span>
          <span className="student-overview-panel__stat-label">All-time accuracy</span>
        </div>
        <div className="student-overview-panel__stat">
          <span className="student-overview-panel__stat-value">{summary.totalAttempts}</span>
          <span className="student-overview-panel__stat-label">Practice sessions</span>
        </div>
        <div className="student-overview-panel__stat">
          <span className="student-overview-panel__stat-value">{summary.lessonsCompleted}</span>
          <span className="student-overview-panel__stat-label">Lessons completed</span>
        </div>
        <div className="student-overview-panel__stat">
          <span className="student-overview-panel__stat-value">{summary.dailyGoalDone}/{summary.dailyGoalTarget}</span>
          <span className="student-overview-panel__stat-label">Today's goal</span>
        </div>
        <div className="student-overview-panel__stat">
          <span className="student-overview-panel__stat-value">{summary.weeklyPracticeDays}</span>
          <span className="student-overview-panel__stat-label">Practice days this week</span>
        </div>
        <div className="student-overview-panel__stat">
          <span className="student-overview-panel__stat-value">{summary.xp}</span>
          <span className="student-overview-panel__stat-label">Total XP</span>
        </div>
        <div className="student-overview-panel__stat">
          <span className="student-overview-panel__stat-value">{summary.achievements}</span>
          <span className="student-overview-panel__stat-label">Achievements</span>
        </div>
        <div className="student-overview-panel__stat">
          <span className="student-overview-panel__stat-value">{summary.wordsCompleted}</span>
          <span className="student-overview-panel__stat-label">Words completed</span>
        </div>
      </div>

      <div className="student-overview-panel__mastery">
        <div className="student-overview-panel__mastery-chip is-mastered">Mastered: {counts.mastered ?? 0}</div>
        <div className="student-overview-panel__mastery-chip is-practice">Needs practice: {counts.needsPractice ?? 0}</div>
        <div className="student-overview-panel__mastery-chip is-difficult">Difficult: {counts.difficult ?? 0}</div>
      </div>

      {recommendations.length > 0 && (
        <div className="student-overview-panel__section">
          <div className="student-overview-panel__section-title">Recommended words to practice</div>
          <div className="student-overview-panel__word-chips">
            {recommendations.slice(0, 8).map((word) => {
              const rationale = word.ranking?.rationale?.[0] || 'Rule-based recommendation';
              const score = Number(word.recommendation_score);
              return (
                <span key={word.word} className="student-overview-panel__word-chip" title={rationale}>
                  {word.word}
                  {Number.isFinite(score) ? ` · ${score}` : ''}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {patterns.length > 0 && (
        <div className="student-overview-panel__section">
          <div className="student-overview-panel__section-title">Frequently confused sounds</div>
          <div className="student-overview-panel__word-chips">
            {patterns.slice(0, 5).map((pattern) => (
              <span key={pattern.pattern_type} className="student-overview-panel__word-chip is-warn">
                {String(pattern.pattern_type || '').replace(/_/g, ' ')} · {pattern.occurrence_count}x
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="student-overview-panel__section">
        <div className="student-overview-panel__section-title">Recent reading activity</div>
        {activity.length ? (
          <ul className="student-overview-panel__activity-list">
            {activity.slice(0, 6).map((item, index) => (
              <li key={index}>
                <span>{item?.lessonTitle || item?.lesson_name || item?.word || 'Activity'}</span>
                <span className="student-overview-panel__activity-time">
                  {item?.completedAt || item?.timestamp || item?.time || '—'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="student-overview-panel__empty">No recent activity yet.</p>
        )}
      </div>
    </section>
  );
}

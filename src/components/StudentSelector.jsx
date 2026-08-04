import React from 'react';
import { normalizeStudentSummary } from '../utils/normalizeStudentSummary';

// Horizontal avatar-list student switcher, shared by ParentDashboard and
// TeacherProgressPage. Presentational only — no data fetching — so switching
// students is always a single click regardless of which page renders it.
// Visual styling comes from `.student-selector*` classes defined separately in
// each dashboard's own CSS file (ParentDashboard.css / TeacherDashboard.css),
// each using that dashboard's own accent color token.
export default function StudentSelector({ students = [], selectedId, onSelect }) {
  const list = Array.isArray(students) ? students : [];

  if (!list.length) return null;

  return (
    <div className="student-selector" role="tablist" aria-label="Select a student">
      {list.map((student) => {
        const summary = normalizeStudentSummary(student);
        const isActive = String(summary.id) === String(selectedId);
        return (
          <button
            key={summary.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`student-selector__item ${isActive ? 'is-active' : ''}`}
            onClick={() => onSelect(summary.id)}
          >
            <span className="student-selector__avatar">{summary.name.charAt(0).toUpperCase()}</span>
            <span className="student-selector__meta">
              <span className="student-selector__name">{summary.name}</span>
              <span className="student-selector__level">{summary.readingLevel}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

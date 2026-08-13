import React, { useMemo, useState } from 'react';
import { normalizeStudentSummary } from '../utils/normalizeStudentSummary';

// Horizontal avatar-list student switcher, shared by ParentDashboard and
// TeacherProgressPage. Presentational only — no data fetching — so switching
// students is always a single click regardless of which page renders it.
// Visual styling comes from `.student-selector*` classes defined separately in
// each dashboard's own CSS file (ParentDashboard.css / TeacherDashboard.css),
// each using that dashboard's own accent color token.
export default function StudentSelector({ students = [], selectedId, onSelect, variant = 'tabs' }) {
  const [isOpen, setIsOpen] = useState(false);
  const list = Array.isArray(students) ? students : [];
  const summaries = useMemo(() => list.map((student) => normalizeStudentSummary(student)), [list]);
  const selected = summaries.find((summary) => String(summary.id) === String(selectedId)) || summaries[0] || null;

  if (!list.length) return null;

  if (variant === 'dropdown') {
    const chooseChild = (id) => {
      onSelect(id);
      setIsOpen(false);
    };

    return (
      <section className="student-selector-card" aria-label="Selected child">
        <div className="student-selector-card__head">
          <div>
            <div className="student-selector-card__eyebrow">Child Selector</div>
            <div className="student-selector-card__title">Child</div>
          </div>
          <div className="student-selector-card__count">
            {summaries.length} child{summaries.length === 1 ? '' : 'ren'}
          </div>
        </div>

        <div className="student-selector-dropdown">
          <button
            type="button"
            className={`student-selector-dropdown__button ${isOpen ? 'is-open' : ''}`}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((value) => !value)}
          >
            <span className="student-selector__avatar">{selected.name.charAt(0).toUpperCase()}</span>
            <span className="student-selector__meta">
              <span className="student-selector__name">{selected.name}</span>
              <span className="student-selector__level">{selected.readingLevel}</span>
            </span>
            <span className="student-selector-dropdown__chevron" aria-hidden="true">v</span>
          </button>

          {isOpen && (
            <div className="student-selector-dropdown__menu" role="listbox" aria-label="Choose child">
              {summaries.map((summary) => {
                const isActive = String(summary.id) === String(selected.id);
                return (
                  <button
                    key={summary.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`student-selector-dropdown__option ${isActive ? 'is-active' : ''}`}
                    onClick={() => chooseChild(summary.id)}
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
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="student-selector" role="tablist" aria-label="Select a student">
      {summaries.map((summary) => {
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

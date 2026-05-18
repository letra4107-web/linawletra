import React from 'react';
import { Bell, Search, UserCircle2 } from 'lucide-react';

export default function TopBar({
  title,
  subtitle,
  actions,
  showSearch = false,
  searchValue = '',
  onSearch,
  searchPlaceholder = 'Search teacher workspace',
}) {
  return (
    <div className="top-nav">
      <div>
        <p className="top-bar-subtitle">{subtitle || 'Teacher Workspace'}</p>
        <h1 className="top-bar-title">{title}</h1>
      </div>

      <div className="top-right">
        {showSearch && (
          <label className="top-search">
            <Search size={18} className="field-icon" />
            <input
              type="search"
              value={searchValue}
              onChange={(event) => onSearch?.(event.target.value)}
              placeholder={searchPlaceholder}
            />
          </label>
        )}

        {actions && <div className="top-actions">{actions}</div>}

        <div className="top-user-card">
          <div className="top-user-avatar">T</div>
          <div>
            <div className="top-user-name">Teacher</div>
            <div className="top-user-role">Classroom</div>
          </div>
        </div>
      </div>
    </div>
  );
}

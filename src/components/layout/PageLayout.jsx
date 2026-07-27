import React from 'react';
import TopBar from './TopBar';

export default function PageLayout({
  title,
  subtitle,
  children,
  actions,
  showSearch,
  searchValue,
  onSearch,
  searchPlaceholder,
}) {
  return (
    <div className="teacher-content">
      <TopBar
        title={title}
        subtitle={subtitle}
        actions={actions}
        showSearch={showSearch}
        searchValue={searchValue}
        onSearch={onSearch}
        searchPlaceholder={searchPlaceholder}
      />
      <main>{children}</main>
    </div>
  );
}

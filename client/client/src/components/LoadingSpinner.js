import React from 'react';

export default function LoadingSpinner() {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        flexDirection: 'column',
        gap: '1rem',
        fontFamily: 'var(--font-body, Lexend, sans-serif)',
        color: 'var(--color-text-secondary, #6b7280)',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          border: '3px solid var(--color-primary-light, #e8f5f1)',
          borderTopColor: 'var(--color-primary, #2d9c78)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <span style={{ fontSize: '0.95rem' }}>Naglo-load...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

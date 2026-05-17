import React from 'react';
import DashboardSidebar from './DashboardSidebar';

export default function PlaceholderPage({ title }) {
  return (
    <div className="dashboard-layout">
      <DashboardSidebar />
      <div className="dashboard-content">
        <div className="container">
          <h1>{title}</h1>
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <h2>🚧 Under Construction</h2>
            <p>This page is currently being developed. Please check back later.</p>
            <button
              className="btn-primary"
              onClick={() => window.history.back()}
              style={{ marginTop: '1rem' }}
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
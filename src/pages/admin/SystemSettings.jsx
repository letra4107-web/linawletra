import React, { useState } from 'react';

export default function SystemSettings() {
  const [profile, setProfile] = useState({ fullName: 'Admin User', email: 'admin@linaw.com' });
  const [preferences, setPreferences] = useState({ emailNotifications: true, twoFactorAuth: false, maintenanceMode: false });

  const handleProfileChange = (field, value) => setProfile((prev) => ({ ...prev, [field]: value }));
  const handlePreferenceChange = (field, value) => setPreferences((prev) => ({ ...prev, [field]: value }));

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <h2>System Settings</h2>
          <p>Adjust admin profile, security options, and platform preferences.</p>
        </div>
        <span className="pill">Settings</span>
      </div>

      <div className="dashboard-grid-two">
        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>Admin profile</h3>
              <p>Update administrator information and contact details.</p>
            </div>
          </div>
          <form className="teacher-form">
            <label>
              Full name
              <input value={profile.fullName} onChange={(e) => handleProfileChange('fullName', e.target.value)} />
            </label>
            <label>
              Email address
              <input type="email" value={profile.email} onChange={(e) => handleProfileChange('email', e.target.value)} />
            </label>
            <button type="button" className="btn-primary">Save profile</button>
          </form>
        </div>

        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>Security settings</h3>
              <p>Protect the platform with notifications and access controls.</p>
            </div>
          </div>
          <div className="performance-list">
            <div className="performance-item">
              <p>Email notifications</p>
              <button type="button" className="btn-secondary" onClick={() => handlePreferenceChange('emailNotifications', !preferences.emailNotifications)}>
                {preferences.emailNotifications ? 'On' : 'Off'}
              </button>
            </div>
            <div className="performance-item">
              <p>Two-factor auth</p>
              <button type="button" className="btn-secondary" onClick={() => handlePreferenceChange('twoFactorAuth', !preferences.twoFactorAuth)}>
                {preferences.twoFactorAuth ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            <div className="performance-item">
              <p>Maintenance mode</p>
              <button type="button" className="btn-secondary" onClick={() => handlePreferenceChange('maintenanceMode', !preferences.maintenanceMode)}>
                {preferences.maintenanceMode ? 'On' : 'Off'}
              </button>
            </div>
          </div>
          <div className="section-heading">
            <div>
              <h4>Platform configuration</h4>
            </div>
          </div>
          <div className="status-grid dashboard-status-grid">
            <div>
              <span>Notifications</span>
              <strong>{preferences.emailNotifications ? 'Enabled' : 'Disabled'}</strong>
            </div>
            <div>
              <span>2FA status</span>
              <strong>{preferences.twoFactorAuth ? 'Active' : 'Inactive'}</strong>
            </div>
            <div>
              <span>Current mode</span>
              <strong>{preferences.maintenanceMode ? 'Maintenance' : 'Live'}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

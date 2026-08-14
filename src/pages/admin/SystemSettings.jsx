import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { adminService } from '../../services/api';

export default function SystemSettings() {
  const { user } = useContext(AuthContext);
  const initialProfile = useMemo(() => ({
    fullName: user?.displayName || user?.name || 'Admin User',
    email: user?.email || '',
  }), [user?.displayName, user?.email, user?.name]);

  const [profile, setProfile] = useState(initialProfile);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');

  const [settings, setSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');

  const [health, setHealth] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);

  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);

  useEffect(() => {
    const loadSettings = async () => {
      setSettingsLoading(true);
      setSettingsError('');
      try {
        const response = await adminService.getSettings();
        const payload = response.data || response;
        setSettings(payload?.settings || null);
      } catch (err) {
        setSettingsError(err?.response?.data?.message || err?.message || 'Could not load platform settings.');
      } finally {
        setSettingsLoading(false);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const loadHealth = async () => {
      setHealthLoading(true);
      try {
        const response = await adminService.getHealth();
        setHealth(response.data || response);
      } catch (err) {
        setHealth({ status: 'unreachable', api: 'unreachable', database: 'unknown' });
      } finally {
        setHealthLoading(false);
      }
    };
    loadHealth();
  }, []);

  const handleProfileChange = (field, value) => setProfile((prev) => ({ ...prev, [field]: value }));
  const handleSettingsChange = (field, value) => setSettings((prev) => ({ ...(prev || {}), [field]: value }));

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    if (!user?.id) return;
    setProfileSaving(true);
    setProfileMessage('');
    try {
      await adminService.updateUser(user.id, { name: profile.fullName, email: profile.email });
      setProfileMessage('Profile updated.');
    } catch (err) {
      setProfileMessage(err?.response?.data?.message || err?.message || 'Could not update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveSettings = async (event) => {
    event.preventDefault();
    setSettingsSaving(true);
    setSettingsMessage('');
    setSettingsError('');
    try {
      const response = await adminService.updateSettings({
        websiteName: settings?.websiteName,
        logoUrl: settings?.logoUrl,
        homepageText: settings?.homepageText,
        announcements: settings?.announcements || [],
      });
      const payload = response.data || response;
      setSettings(payload?.settings || settings);
      setSettingsMessage('Platform settings saved.');
    } catch (err) {
      setSettingsError(err?.response?.data?.message || err?.message || 'Could not save platform settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const statusPill = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'ok') return <span className="pill small" style={{ background: '#DCFCE7', color: '#166534' }}>Operational</span>;
    if (normalized === 'degraded') return <span className="pill small" style={{ background: '#FEF9C3', color: '#854D0E' }}>Degraded</span>;
    return <span className="pill small" style={{ background: '#FEE2E2', color: '#991B1B' }}>Unreachable</span>;
  };

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <h2>System Settings</h2>
          <p>Administrative configuration for the LinawLetra platform.</p>
        </div>
        <span className="pill">Settings</span>
      </div>

      {/* GENERAL */}
      <div className="card-panel">
        <div className="section-heading">
          <div>
            <h3>General</h3>
            <p>Platform identity shown across the product.</p>
          </div>
        </div>
        {settingsError && <div className="dashboard-banner dashboard-banner-error">{settingsError}</div>}
        {settingsMessage && <div className="dashboard-banner">{settingsMessage}</div>}
        {settingsLoading ? (
          <div className="list-skeleton">Loading settings...</div>
        ) : (
          <form className="teacher-form" onSubmit={handleSaveSettings}>
            <div className="field-grid">
              <label>
                Platform name
                <input value={settings?.websiteName || ''} onChange={(e) => handleSettingsChange('websiteName', e.target.value)} />
              </label>
              <label>
                Logo URL
                <input value={settings?.logoUrl || ''} onChange={(e) => handleSettingsChange('logoUrl', e.target.value)} placeholder="https://" />
              </label>
            </div>
            <label>
              Platform description
              <textarea
                rows={3}
                value={settings?.homepageText || ''}
                onChange={(e) => handleSettingsChange('homepageText', e.target.value)}
              />
            </label>
            <button type="submit" className="btn-primary" disabled={settingsSaving}>
              {settingsSaving ? 'Saving...' : 'Save general settings'}
            </button>
          </form>
        )}
      </div>

      <div className="dashboard-grid-two">
        {/* SECURITY */}
        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>Security</h3>
              <p>Administrator account details. Authentication is managed by Supabase Auth.</p>
            </div>
          </div>
          {profileMessage && <div className="dashboard-banner">{profileMessage}</div>}
          <form className="teacher-form" onSubmit={handleSaveProfile}>
            <label>
              Full name
              <input value={profile.fullName} onChange={(e) => handleProfileChange('fullName', e.target.value)} />
            </label>
            <label>
              Email address
              <input type="email" value={profile.email} onChange={(e) => handleProfileChange('email', e.target.value)} />
            </label>
            <button type="submit" className="btn-primary" disabled={profileSaving}>
              {profileSaving ? 'Saving...' : 'Save profile'}
            </button>
          </form>
          <div className="performance-list">
            <div className="performance-item">
              <p>Authentication provider</p>
              <strong>Supabase Auth</strong>
            </div>
            <div className="performance-item">
              <p>Account role</p>
              <strong>Admin</strong>
            </div>
          </div>
        </div>

        {/* SYSTEM */}
        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>System status</h3>
              <p>Live status of the API and database.</p>
            </div>
          </div>
          {healthLoading ? (
            <div className="list-skeleton">Checking system status...</div>
          ) : (
            <div className="performance-list">
              <div className="performance-item">
                <p>API</p>
                {statusPill(health?.api || health?.status)}
              </div>
              <div className="performance-item">
                <p>Database</p>
                {statusPill(health?.database)}
              </div>
              <div className="performance-item">
                <p>Response time</p>
                <strong>{health?.responseTimeMs != null ? `${health.responseTimeMs} ms` : 'No data'}</strong>
              </div>
              <div className="performance-item">
                <p>Checked at</p>
                <strong>{health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : 'No data'}</strong>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* STUDENT EXPERIENCE / NOTIFICATIONS - not yet backed by configurable settings */}
      <div className="card-panel">
        <div className="section-heading">
          <div>
            <h3>Student experience &amp; notifications</h3>
            <p>Learning defaults, reading/practice tuning, and system notification behavior.</p>
          </div>
        </div>
        <p className="empty-state-text">
          These settings are not yet configurable from the admin console. Reading level defaults, practice pacing,
          and notification triggers are currently controlled by the application&apos;s curriculum and progress
          services rather than admin-editable fields.
        </p>
      </div>
    </section>
  );
}

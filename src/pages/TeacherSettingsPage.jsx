import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { userService } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import PageLayout from '../components/layout/PageLayout';
import '../styles/TeacherDashboard.css';

export default function TeacherSettingsPage() {
  const navigate = useNavigate();
  const { user, logout, loading: authLoading } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [formValues, setFormValues] = useState({
    name: '',
    email: '',
    school: '',
    grade: '',
    role: 'Teacher',
    avatarInitials: '',
  });
  const [passwordValues, setPasswordValues] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [preferences, setPreferences] = useState({
    emailUpdates: true,
    summaryEmails: false,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
      return;
    }

    const loadData = async () => {
      setLoading(true);
      try {
        const response = await userService.getProfile();
        const profile = response.data?.user || response.data || {};
        const metadata = profile.metadata || {};
        setFormValues({
          name: profile?.name || profile?.displayName || user?.name || '',
          email: profile?.email || user?.email || '',
          school: profile?.school || metadata.school || '',
          grade: profile?.grade || metadata.grade || metadata.gradeLevel || '',
          role: profile?.role || 'Teacher',
          avatarInitials: profile?.avatarInitials || metadata.avatarInitials || '',
        });
      } catch (err) {
        console.error(err);
        setStatusMessage('Unable to load settings.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [authLoading, navigate, user]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatusMessage('');

    if (passwordValues.newPassword && passwordValues.newPassword !== passwordValues.confirmPassword) {
      setStatusMessage('New passwords do not match.');
      setSaving(false);
      return;
    }

    try {
      const payload = {
        name: formValues.name,
        school: formValues.school,
        grade: formValues.grade,
        avatarInitials: formValues.avatarInitials,
      };

      if (passwordValues.newPassword || passwordValues.confirmPassword || passwordValues.currentPassword) {
        payload.currentPassword = passwordValues.currentPassword;
        payload.newPassword = passwordValues.newPassword;
        payload.confirmPassword = passwordValues.confirmPassword;
      }

      await userService.updateProfile(payload);
      setPasswordValues({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setStatusMessage('Settings saved successfully.');
    } catch (err) {
      console.error(err);
      setStatusMessage(err.response?.data?.message || err.message || 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = (event) => {
    const { name, value } = event.target;
    setPasswordValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleTogglePreference = (key) => {
    setPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSignOut = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error(err);
    }
  };

  if (authLoading || loading) {
    return (
      <PageLayout title="Settings" subtitle="Manage your account and file uploads" showSearch={false}>
        <div className="page-main">
          <div className="empty-state">
            <div className="empty-title">Loading settings...</div>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Settings" subtitle="Manage your account and classroom profile" showSearch={false}>
      <div className="page-main">
        <section className="headline-section">
          <div>
            <h1>Settings</h1>
            <p>Update your teacher profile, school information, and account preferences.</p>
          </div>
          <div className="headline-sync">
            <div className="headline-sync-text">Profile status</div>
            <div className="headline-sync-value">{formValues.name ? 'Ready' : 'Incomplete'}</div>
          </div>
        </section>

        <div className="body-grid settings-grid">
          <section className="setting-panel">
            <div className="detail-header">
              <div>
                <h2>Settings</h2>
                <p>Manage your profile, security, and notification preferences.</p>
              </div>
            </div>

            <form onSubmit={handleSave} className="form-grid">
              <div className="detail-block">
                <div className="detail-block-title">Account details</div>
                <div className="form-grid">
                  <label>
                    <div className="student-meta">Display name</div>
                    <input name="name" value={formValues.name} onChange={handleChange} className="list-search" />
                  </label>
                  <label>
                    <div className="student-meta">Email</div>
                    <input name="email" type="email" value={formValues.email} readOnly className="list-search" />
                  </label>
                  <label>
                    <div className="student-meta">School</div>
                    <input name="school" value={formValues.school} onChange={handleChange} className="list-search" />
                  </label>
                  <label>
                    <div className="student-meta">Grade level</div>
                    <input name="grade" value={formValues.grade} onChange={handleChange} className="list-search" />
                  </label>
                  <label>
                    <div className="student-meta">Avatar initials</div>
                    <input
                      name="avatarInitials"
                      value={formValues.avatarInitials}
                      onChange={handleChange}
                      className="list-search"
                    />
                  </label>
                </div>
              </div>

              <div className="detail-block">
                <div className="detail-block-title">Security & password</div>
                <div className="form-grid">
                  <label>
                    <div className="student-meta">Current password</div>
                    <input
                      name="currentPassword"
                      type="password"
                      value={passwordValues.currentPassword}
                      onChange={handlePasswordChange}
                      className="list-search"
                    />
                  </label>
                  <label>
                    <div className="student-meta">New password</div>
                    <input
                      name="newPassword"
                      type="password"
                      value={passwordValues.newPassword}
                      onChange={handlePasswordChange}
                      className="list-search"
                    />
                  </label>
                  <label>
                    <div className="student-meta">Confirm password</div>
                    <input
                      name="confirmPassword"
                      type="password"
                      value={passwordValues.confirmPassword}
                      onChange={handlePasswordChange}
                      className="list-search"
                    />
                  </label>
                </div>
              </div>

              <div className="detail-block">
                <div className="detail-block-title">Preferences</div>
                <div className="setting-card">
                  <button
                    type="button"
                    className={`filter-pill ${preferences.emailUpdates ? 'active' : ''}`}
                    onClick={() => handleTogglePreference('emailUpdates')}
                  >
                    {preferences.emailUpdates ? '✓' : '○'} Email updates
                  </button>
                  <button
                    type="button"
                    className={`filter-pill ${preferences.summaryEmails ? 'active' : ''}`}
                    onClick={() => handleTogglePreference('summaryEmails')}
                  >
                    {preferences.summaryEmails ? '✓' : '○'} Weekly summary emails
                  </button>
                </div>
              </div>

              {statusMessage && <div className="detail-block-title">{statusMessage}</div>}
              <button type="submit" className="detail-action" disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </form>
          </section>

          <section className="setting-panel">
            <div className="detail-header">
              <div>
                <h2>Account overview</h2>
                <p>See your profile summary and quick actions in one place.</p>
              </div>
            </div>

            <div className="setting-card">
              <div className="detail-name">{formValues.name || 'Teacher'}</div>
              <div className="detail-meta">{formValues.school || 'No school assigned'} • Grade {formValues.grade || 'N/A'}</div>
              <div className="detail-meta">Role: {formValues.role}</div>
              <div className="detail-meta">Email: {formValues.email}</div>
            </div>

            <div className="setting-card">
              <h3>Actions</h3>
              <p>Use these quick controls to manage your experience.</p>
              <button type="button" className="detail-action" onClick={handleSignOut}>Sign out</button>
            </div>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}

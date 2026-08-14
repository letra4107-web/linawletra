import React, { useEffect, useState } from 'react';
import { adminService } from '../../services/api';

const formatNumber = (value) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '0';
  return Number(value).toLocaleString();
};

const formatDate = (value) => {
  if (!value) return 'No data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No data';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const normalizeUser = (user = {}) => {
  const metadata = user.metadata || {};
  const status = user.status || user.accountStatus || (user.isActive === false || metadata.isActive === false ? 'disabled' : 'active');
  return {
    ...user,
    id: user.id || user.uid || user._id,
    name:
      user.name ||
      user.fullName ||
      user.full_name ||
      metadata.displayName ||
      [metadata.firstName, metadata.lastName].filter(Boolean).join(' ') ||
      user.email ||
      'Unnamed user',
    role: user.role || 'parent',
    status,
    platform: user.platform || 'Unknown',
    emailVerified: Boolean(user.emailVerified ?? user.email_verified),
    registeredAt: user.registeredAt || user.created_at || user.createdAt,
    lastActivityAt: user.lastActivityAt || user.lastSignInAt || user.lastLoginAt || user.updated_at,
    archivedDate: user.archivedDate || metadata.archivedAt || user.updatedAt || user.updated_at,
    archivedBy: user.archivedBy || metadata.archivedBy,
    previousStatus: user.previousStatus || metadata.previousStatus || 'active',
    metadata,
  };
};

const platformBadgeStyle = (platform) => {
  switch (platform) {
    case 'Web + Mobile':
      return { background: '#EDE9FE', color: '#5B21B6' };
    case 'Mobile':
      return { background: '#DBEAFE', color: '#1D4ED8' };
    case 'Web':
      return { background: '#DCFCE7', color: '#166534' };
    default:
      return { background: '#F1F5F9', color: '#475569' };
  }
};

const PlatformBadge = ({ platform }) => (
  <span className="pill small" style={platformBadgeStyle(platform)}>{platform}</span>
);

const ConfirmDialog = ({ open, title, message, confirmLabel, onCancel, onConfirm, busy }) => {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div className="card-panel" style={{ maxWidth: '420px', width: '90%' }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <p>{message}</p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [archivedUsers, setArchivedUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [viewMode, setViewMode] = useState('active');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [pendingAction, setPendingAction] = useState(null); // { type: 'disable' | 'restore', user }
  const [actionBusy, setActionBusy] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (viewMode !== 'active') return undefined;

    const loadUsers = async () => {
      setLoading(true);
      setError('');
      try {
        const params = {
          limit: 500,
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(roleFilter !== 'all' ? { role: roleFilter } : {}),
          ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        };
        const response = await adminService.getUsers(params);
        const payload = response.data || response;
        const list = Array.isArray(payload?.users)
          ? payload.users
          : Array.isArray(payload)
            ? payload
            : [];
        setUsers(list.map(normalizeUser).filter((user) => user.status !== 'archived' && user.status !== 'deleted'));
      } catch (err) {
        setUsers([]);
        setError(err?.response?.data?.message || err?.message || 'Could not load users.');
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(loadUsers, 250);
    return () => clearTimeout(timer);
  }, [search, roleFilter, statusFilter, viewMode, refreshToken]);

  useEffect(() => {
    if (viewMode !== 'archive') return undefined;

    const loadArchive = async () => {
      setArchiveLoading(true);
      setError('');
      try {
        const response = await adminService.getArchivedUsers();
        const payload = response.data || response;
        const list = Array.isArray(payload?.archivedUsers) ? payload.archivedUsers : [];
        setArchivedUsers(list.map(normalizeUser));
      } catch (err) {
        setArchivedUsers([]);
        setError(err?.response?.data?.message || err?.message || 'Could not load archived users.');
      } finally {
        setArchiveLoading(false);
      }
    };

    loadArchive();
    return undefined;
  }, [viewMode, refreshToken]);

  const requestDisable = (user) => {
    setSuccessMessage('');
    setPendingAction({ type: 'disable', user });
  };

  const requestRestore = (user) => {
    setSuccessMessage('');
    setPendingAction({ type: 'restore', user });
  };

  const closeDialog = () => {
    if (actionBusy) return;
    setPendingAction(null);
  };

  const confirmPendingAction = async () => {
    if (!pendingAction) return;
    const { type, user } = pendingAction;
    setActionBusy(true);
    setError('');
    try {
      if (type === 'disable') {
        await adminService.deleteUser(user.id);
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        setSuccessMessage('Account disabled and moved to Archive.');
        setPendingAction(null);
        setViewMode('archive');
        setRefreshToken((n) => n + 1);
      } else if (type === 'restore') {
        await adminService.restoreUser(user.id);
        setArchivedUsers((prev) => prev.filter((u) => u.id !== user.id));
        setSuccessMessage('Account restored to Active Users.');
        setPendingAction(null);
        setViewMode('active');
        setRefreshToken((n) => n + 1);
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || `Could not ${type === 'disable' ? 'disable' : 'restore'} account.`);
      setPendingAction(null);
    } finally {
      setActionBusy(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    const nextStatus = status === 'active' ? 'disabled' : 'active';
    try {
      setError('');
      const response = await adminService.updateUser(id, { isActive: nextStatus === 'active' });
      const updated = normalizeUser(response.data || response || {});
      setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, ...updated, status: updated.status || nextStatus } : user)));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not update user status.');
    }
  };

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <h2>Users</h2>
          <p>Manage active users and restore archived accounts without deleting learning history.</p>
        </div>
        <span className="pill">User Management</span>
      </div>

      {error && <div className="dashboard-banner dashboard-banner-error">{error}</div>}
      {successMessage && <div className="dashboard-banner">{successMessage}</div>}

      <div className="tab-row">
        <button type="button" className={`btn-secondary ${viewMode === 'active' ? 'is-active' : ''}`} onClick={() => setViewMode('active')}>
          Active Users
        </button>
        <button type="button" className={`btn-secondary ${viewMode === 'archive' ? 'is-active' : ''}`} onClick={() => setViewMode('archive')}>
          Archive
        </button>
      </div>

      {viewMode === 'active' && (
        <>
          <div className="panel-grid panel-grid-single">
            <div className="card-panel">
              <div className="section-heading">
                <div>
                  <h3>Search and filter</h3>
                  <p>Quickly locate users by name, email, role, or account status.</p>
                </div>
              </div>
              <div className="field-grid">
                <label>
                  Search users
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" />
                </label>
                <label>
                  Role
                  <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                    <option value="all">All roles</option>
                    <option value="student">Student</option>
                    <option value="parent">Parent</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <label>
                  Status
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">All active-list statuses</option>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="card-panel">
            <div className="section-heading">
              <div>
                <h3>Users table</h3>
                <p>Review roles, platform usage, verification, activity, and account status.</p>
              </div>
              <span className="pill small">{formatNumber(users.length)} users</span>
            </div>
            <div className="table-scroll">
              {loading ? (
                <div className="list-skeleton">Loading users...</div>
              ) : (
                <table className="simple-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Platform</th>
                      <th>Status</th>
                      <th>Email verified</th>
                      <th>Registered</th>
                      <th>Last activity</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan="9">No users found.</td>
                      </tr>
                    ) : users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.name}</td>
                        <td>{user.email}</td>
                        <td>{user.role}</td>
                        <td><PlatformBadge platform={user.platform} /></td>
                        <td>{user.status}</td>
                        <td>{user.emailVerified ? 'Verified' : 'Not verified'}</td>
                        <td>{formatDate(user.registeredAt)}</td>
                        <td>{formatDate(user.lastActivityAt)}</td>
                        <td>
                          <button type="button" className="btn-secondary" onClick={() => handleStatusChange(user.id, user.status)}>
                            {user.status === 'active' ? 'Disable' : 'Activate'}
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => requestDisable(user)}>
                            Archive
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {viewMode === 'archive' && (
        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>Archive</h3>
              <p>Archived accounts are inactive, restorable, and retain profile and learning history.</p>
            </div>
            <span className="pill small">{formatNumber(archivedUsers.length)} archived</span>
          </div>
          <div className="table-scroll">
            {archiveLoading ? (
              <div className="list-skeleton">Loading archived users...</div>
            ) : (
              <table className="simple-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Platform</th>
                    <th>Archived Date</th>
                    <th>Archived By</th>
                    <th>Previous Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedUsers.length === 0 ? (
                    <tr>
                      <td colSpan="8">No archived users.</td>
                    </tr>
                  ) : archivedUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>{user.role}</td>
                      <td><PlatformBadge platform={user.platform} /></td>
                      <td>{formatDate(user.archivedDate)}</td>
                      <td>{user.archivedBy || 'No data'}</td>
                      <td>{user.previousStatus || 'active'}</td>
                      <td>
                        <button type="button" className="btn-secondary" onClick={() => requestRestore(user)}>
                          Restore
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => window.alert(`Profile and learning history for ${user.name} remain preserved in Supabase.`)}>
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingAction)}
        busy={actionBusy}
        title={pendingAction?.type === 'restore' ? 'Restore account' : 'Disable account'}
        message={
          pendingAction?.type === 'restore'
            ? 'Are you sure you want to restore this account?'
            : 'Are you sure you want to disable this account?'
        }
        confirmLabel={pendingAction?.type === 'restore' ? 'Yes, Restore Account' : 'Yes, Disable Account'}
        onCancel={closeDialog}
        onConfirm={confirmPendingAction}
      />
    </section>
  );
}

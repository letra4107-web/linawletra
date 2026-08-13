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
    emailVerified: Boolean(user.emailVerified ?? user.email_verified),
    registeredAt: user.registeredAt || user.created_at || user.createdAt,
    lastActivityAt: user.lastActivityAt || user.lastSignInAt || user.lastLoginAt || user.updated_at,
    archivedDate: user.archivedDate || metadata.archivedAt || user.updatedAt || user.updated_at,
    archivedBy: user.archivedBy || metadata.archivedBy,
    previousStatus: user.previousStatus || metadata.previousStatus || 'active',
    metadata,
  };
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
  }, [search, roleFilter, statusFilter, viewMode]);

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
  }, [viewMode]);

  const handleArchive = async (id) => {
    if (!window.confirm("Archiving this account will remove it from active users but preserve the account's learning history and data. You can restore it later from the Archive.")) return;

    try {
      setError('');
      await adminService.deleteUser(id);
      setUsers((prev) => prev.filter((user) => user.id !== id));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not archive user.');
    }
  };

  const handleRestore = async (id) => {
    if (!window.confirm('Restore this account to active users? Historical learning data will remain unchanged.')) return;

    try {
      setError('');
      await adminService.restoreUser(id);
      setArchivedUsers((prev) => prev.filter((user) => user.id !== id));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not restore user.');
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
                <p>Review roles, verification, activity, and account status.</p>
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
                        <td colSpan="8">No users found.</td>
                      </tr>
                    ) : users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.name}</td>
                        <td>{user.email}</td>
                        <td>{user.role}</td>
                        <td>{user.status}</td>
                        <td>{user.emailVerified ? 'Verified' : 'Not verified'}</td>
                        <td>{formatDate(user.registeredAt)}</td>
                        <td>{formatDate(user.lastActivityAt)}</td>
                        <td>
                          <button type="button" className="btn-secondary" onClick={() => handleStatusChange(user.id, user.status)}>
                            {user.status === 'active' ? 'Disable' : 'Activate'}
                          </button>
                          <button type="button" className="btn-secondary" onClick={() => handleArchive(user.id)}>
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
                    <th>Archived Date</th>
                    <th>Archived By</th>
                    <th>Previous Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedUsers.length === 0 ? (
                    <tr>
                      <td colSpan="7">No archived users.</td>
                    </tr>
                  ) : archivedUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>{user.role}</td>
                      <td>{formatDate(user.archivedDate)}</td>
                      <td>{user.archivedBy || 'No data'}</td>
                      <td>{user.previousStatus || 'active'}</td>
                      <td>
                        <button type="button" className="btn-secondary" onClick={() => handleRestore(user.id)}>
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
    </section>
  );
}

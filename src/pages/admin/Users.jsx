import React, { useEffect, useMemo, useState } from 'react';
import { adminService } from '../../services/api';

const formatNumber = (value) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '0';
  return Number(value).toLocaleString();
};

const normalizeUser = (user = {}) => {
  const metadata = user.metadata || {};
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
    status: user.status || (metadata.isActive === false ? 'disabled' : user.email_verified === false ? 'pending' : 'active'),
  };
};

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await adminService.getUsers();
        const payload = response.data || response;
        const list = Array.isArray(payload?.users)
          ? payload.users
          : Array.isArray(payload)
            ? payload
            : [];
        setUsers(list.map(normalizeUser));
      } catch (err) {
        setUsers([]);
        setError(err?.response?.data?.message || err?.message || 'Could not load users.');
      } finally {
        setLoading(false);
      }
    };

    loadUsers();
  }, []);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch = [user.name, user.email, user.role, user.status]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase());
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [search, roleFilter, users]);

  const handleDelete = async (id) => {
    try {
      setError('');
      await adminService.deleteUser(id);
      setUsers((prev) => prev.filter((user) => user.id !== id));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not delete user.');
    }
  };

  const handleStatusChange = async (id, status) => {
    const nextStatus = status === 'active' ? 'disabled' : 'active';
    try {
      setError('');
      await adminService.updateUser(id, { isActive: nextStatus === 'active' });
      setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, status: nextStatus } : user)));
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not update user status.');
    }
  };

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <h2>Users</h2>
          <p>Manage all registered users with search, filters, and account controls.</p>
        </div>
        <span className="pill">User Management</span>
      </div>

      {error && <div className="dashboard-banner dashboard-banner-error">{error}</div>}

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
          </div>
        </div>

      </div>

      <div className="card-panel">
        <div className="section-heading">
          <div>
            <h3>Users table</h3>
            <p>Review, edit roles, and manage account statuses.</p>
          </div>
          <span className="pill small">{formatNumber(filteredUsers.length)} users</span>
        </div>
        <div className="table-scroll">
          {loading ? (
            <div className="list-skeleton">Loading users…</div>
          ) : (
            <table className="simple-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5">No users found.</td>
                  </tr>
                ) : filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                    <td>{user.status}</td>
                    <td>
                      <button type="button" className="btn-secondary" onClick={() => handleStatusChange(user.id, user.status === 'active' ? 'disabled' : 'active')}>
                        {user.status === 'active' ? 'Disable' : 'Activate'}
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => handleDelete(user.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

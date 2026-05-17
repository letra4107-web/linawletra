import React, { useEffect, useMemo, useState } from 'react';
import { adminService } from '../../services/api';

const formatNumber = (value) => {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return '0';
  return Number(value).toLocaleString();
};

const defaultUsers = [
  { id: 1, name: 'Ana Mendoza', email: 'ana@linaw.com', role: 'student', status: 'active' },
  { id: 2, name: 'Marco Reyes', email: 'marco@linaw.com', role: 'parent', status: 'pending' },
  { id: 3, name: 'Liza Cruz', email: 'liza@linaw.com', role: 'teacher', status: 'active' },
];

export default function Users() {
  const [users, setUsers] = useState(defaultUsers);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'student', status: 'active' });
  const [error, setError] = useState('');

  useEffect(() => {
    const loadUsers = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await adminService.getUsers();
        const payload = response.data || response;
        if (Array.isArray(payload)) {
          setUsers(payload);
        }
      } catch (err) {
        setError('Could not load users. Showing local sample data.');
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

  const handleCreateUser = (event) => {
    event.preventDefault();
    setUsers((prev) => [
      { ...newUser, id: Date.now(), status: newUser.status || 'active' },
      ...prev,
    ]);
    setNewUser({ name: '', email: '', role: 'student', status: 'active' });
  };

  const handleDelete = (id) => {
    setUsers((prev) => prev.filter((user) => user.id !== id));
  };

  const handleStatusChange = (id, status) => {
    setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, status } : user)));
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

      <div className="panel-grid">
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

        <div className="card-panel">
          <div className="section-heading">
            <div>
              <h3>Create new user</h3>
              <p>Add a user account and manage access roles from one panel.</p>
            </div>
          </div>
          <form className="teacher-form" onSubmit={handleCreateUser}>
            <div className="field-grid">
              <label>
                Full name
                <input
                  value={newUser.name}
                  onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Jane Doe"
                  required
                />
              </label>
              <label>
                Email address
                <input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="jane@example.com"
                  required
                />
              </label>
            </div>
            <div className="field-grid">
              <label>
                Role
                <select value={newUser.role} onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value }))}>
                  <option value="student">Student</option>
                  <option value="parent">Parent</option>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label>
                Account status
                <select value={newUser.status} onChange={(e) => setNewUser((prev) => ({ ...prev, status: e.target.value }))}>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </div>
            <button className="btn-primary" type="submit">Create User</button>
          </form>
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
                {filteredUsers.map((user) => (
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

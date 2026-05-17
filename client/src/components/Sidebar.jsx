import React, { useContext, useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  FiBarChart2,
  FiBookOpen,
  FiFileText,
  FiGrid,
  FiLogOut,
  FiMenu,
  FiMessageSquare,
  FiSettings,
  FiShield,
  FiUsers,
  FiUserCheck,
} from 'react-icons/fi';
import { AuthContext } from '../context/AuthContext';

const adminNavItems = [
  { id: 'overview', label: 'Overview', path: '/admin-dashboard/overview', icon: <FiGrid /> },
  { id: 'users', label: 'Users', path: '/admin-dashboard/users', icon: <FiUsers /> },
  { id: 'teachers', label: 'Teachers', path: '/admin-dashboard/teachers', icon: <FiUserCheck /> },
  { id: 'content', label: 'Content', path: '/admin-dashboard/content', icon: <FiBookOpen /> },
  { id: 'analytics', label: 'Analytics', path: '/admin-dashboard/analytics', icon: <FiBarChart2 /> },
  { id: 'reports', label: 'Reports', path: '/admin-dashboard/reports', icon: <FiFileText /> },
  { id: 'communication', label: 'Communication', path: '/admin-dashboard/communication', icon: <FiMessageSquare /> },
  { id: 'ai-settings', label: 'AI Settings', path: '/admin-dashboard/ai-settings', icon: <FiShield /> },
  { id: 'system-settings', label: 'System Settings', path: '/admin-dashboard/system-settings', icon: <FiSettings /> },
];

export default function Sidebar() {
  const { user, logout, loading } = useContext(AuthContext);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const navigate = useNavigate();

  const isAdminUser = useMemo(() => String(user?.role || '').toLowerCase() === 'admin', [user]);

  const permissions = useMemo(() => {
    if (!user?.permissions) return null;
    if (Array.isArray(user.permissions)) return user.permissions;
    return String(user.permissions).split(',').map((permission) => permission.trim()).filter(Boolean);
  }, [user?.permissions]);

  const navItems = useMemo(() => {
    if (!isAdminUser) return [];
    if (!permissions?.length) return adminNavItems;
    return adminNavItems.filter(
      (item) => permissions.includes(item.id) || permissions.includes(item.permission) || item.id === 'overview'
    );
  }, [isAdminUser, permissions]);

  const displayName = useMemo(
    () => user?.displayName || user?.firstName || user?.name || user?.email || 'Admin',
    [user]
  );

  const displayRole = useMemo(() => {
    const role = String(user?.role || 'admin');
    return `${role.charAt(0).toUpperCase()}${role.slice(1)} Dashboard`;
  }, [user?.role]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Sidebar logout failed:', error);
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const toggleMobile = () => setIsMobileOpen((prev) => !prev);
  const closeMobile = () => setIsMobileOpen(false);

  if (loading || !isAdminUser) {
    return null;
  }

  return (
    <>
      <button className="mobile-sidebar-toggle" onClick={toggleMobile} aria-label="Toggle sidebar">
        <FiMenu />
      </button>

      <div className={`admin-sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-logo">LL</div>
            <div>
              <div className="sidebar-brand-name">LinawLetra</div>
              <div className="sidebar-brand-sub">Admin Console</div>
            </div>
          </div>
          <div className="user-info">
            <div className="user-info__avatar">{String(displayName).charAt(0).toUpperCase()}</div>
            <div>
              <p className="user-name">{displayName}</p>
              <p className="user-role">{displayRole}</p>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <ul className="sidebar-list">
            {navItems.map((item) => (
              <li key={item.id}>
                <NavLink
                  to={item.path}
                  end
                  className={({ isActive }) => `sidebar-link${isActive ? ' is-active' : ''}`}
                  onClick={closeMobile}
                >
                  <span className="icon">{item.icon}</span>
                  <span className="label">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="sidebar-logout" onClick={handleLogout}>
            <FiLogOut className="sidebar-logout-icon" />
            Logout
          </button>
        </div>
      </div>

      {isMobileOpen && <div className="sidebar-overlay" onClick={closeMobile} />}
    </>
  );
}

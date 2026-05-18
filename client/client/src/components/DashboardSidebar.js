import React, { useContext, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  FiBarChart2,
  FiBookOpen,
  FiCalendar,
  FiFileText,
  FiGrid,
  FiLogOut,
  FiMenu,
  FiMessageSquare,
  FiSettings,
  FiUser,
  FiUsers,
  FiX,
} from 'react-icons/fi';

export default function DashboardSidebar({
  childProfiles,
  navItems: overrideNavItems,
  activeItem = '',
  onItemSelect,
  headerTitle,
  headerSubtitle,
  showLogout = true,
}) {
  const { user, logout } = useContext(AuthContext);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('DashboardSidebar logout failed:', error);
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const closeMobileSidebar = () => {
    setIsMobileOpen(false);
  };

  const getNavItems = (profiles) => {
    switch (user?.role) {
      case 'admin':
        return [
          { path: '/admin-dashboard/overview', label: 'Overview', icon: <FiGrid /> },
          { path: '/admin-dashboard/users', label: 'Users', icon: <FiUsers /> },
          { path: '/admin-dashboard/teachers', label: 'Teachers', icon: <FiUser /> },
          { path: '/admin-dashboard/reports', label: 'Reports', icon: <FiBarChart2 /> },
          { path: '/admin-dashboard/communication', label: 'Communication', icon: <FiMessageSquare /> },
          { path: '/admin-dashboard/system-settings', label: 'Settings', icon: <FiSettings /> },
        ];
      case 'teacher':
        return [
          { path: '/teacher-dashboard', label: 'Dashboard', icon: <FiGrid /> },
          { path: '/teacher/assessments', label: 'Assessments', icon: <FiFileText /> },
          { path: '/teacher/students', label: 'My Students', icon: <FiUsers /> },
          { path: '/teacher/learning-paths', label: 'Learning Paths', icon: <FiBookOpen /> },
          { path: '/teacher/schedules', label: 'Schedules', icon: <FiCalendar /> },
          { path: '/teacher/progress', label: 'Progress Reports', icon: <FiBarChart2 /> },
          { path: '/teacher/activities', label: 'Activities', icon: <FiMessageSquare /> },
          { path: '/teacher/settings', label: 'Settings', icon: <FiSettings /> },
        ];
      case 'parent':
        return [
          { path: '/parent/summary', label: 'Dashboard', icon: <FiGrid /> },
          { path: '/parent/children', label: 'My Children', icon: <FiUsers /> },
          { path: '/parent/reports', label: 'Reports', icon: <FiFileText /> },
          { path: '/parent/profile', label: 'Profile', icon: <FiUser /> },
          { path: '/parent/settings', label: 'Settings', icon: <FiSettings /> },
        ];
      case 'student':
        return [
          { path: '/student-dashboard', label: 'Student Dashboard', icon: <FiGrid /> },
        ];
      default:
        return profiles || [];
    }
  };

  const navItems = overrideNavItems || getNavItems(childProfiles);

  const isTabNavigation = typeof onItemSelect === 'function';
  const displayName = headerTitle || user?.fullName || user?.name || user?.email || 'User';
  const displayRole = headerSubtitle || `${user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)} Dashboard`;

  return (
    <>
      <button
        className="mobile-sidebar-toggle"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        aria-label="Toggle sidebar"
      >
        {isMobileOpen ? <FiX /> : <FiMenu />}
      </button>

      <div className={`dashboard-sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <img className="sidebar-logo" src="/logo.png" alt="LinawLetra" />
            <h2>LinawLetra</h2>
          </div>
          <div className="user-info">
            <p className="user-name">{displayName}</p>
            <p className="user-role">{displayRole}</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <ul>
            {navItems.map((item) => (
              <li key={item.path || item.id || item.label}>
                {isTabNavigation ? (
                  <button
                    type="button"
                    className={`sidebar-link sidebar-link-button ${activeItem === item.id ? 'active' : ''}`}
                    onClick={() => {
                      onItemSelect(item.id);
                      closeMobileSidebar();
                    }}
                  >
                    <span className="icon">{item.icon}</span>
                    <span className="label">{item.label}</span>
                  </button>
                ) : (
                  <NavLink
                    to={item.path}
                    end
                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    onClick={closeMobileSidebar}
                  >
                    <span className="icon">{item.icon}</span>
                    <span className="label">{item.label}</span>
                  </NavLink>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {showLogout && (
          <div className="sidebar-footer">
            <button className="btn-secondary logout-btn" onClick={handleLogout}>
              <FiLogOut style={{ marginRight: '0.5rem' }} /> Logout
            </button>
          </div>
        )}
      </div>

      {isMobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={closeMobileSidebar}
        />
      )}
    </>
  );
}
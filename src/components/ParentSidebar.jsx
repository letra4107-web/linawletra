import React, { useContext, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  FiGrid,
  FiUsers,
  FiBarChart2,
  FiCalendar,
  FiBookOpen,
  FiAward,
  FiFileText,
  FiDownload,
  FiSettings,
  FiMenu,
  FiX,
  FiLogOut,
} from 'react-icons/fi';

const sidebarGroups = [
  {
    label: 'Main',
    items: [
      { path: '/parent/summary', label: 'Dashboard', icon: <FiGrid /> },
      { path: '/parent/children', label: 'My Children', icon: <FiUsers /> },
      { path: '/parent/progress', label: 'Progress Report', icon: <FiBarChart2 /> },
      { path: '/parent/schedules', label: 'Calendar', icon: <FiCalendar /> },
    ],
  },
  {
    label: 'Learning',
    items: [
      { path: '/parent/modules', label: 'Modules', icon: <FiBookOpen /> },
      { path: '/parent/badges', label: 'Badges & Achievements', icon: <FiAward /> },
    ],
  },
  {
    label: 'Reports',
    items: [
      { path: '/parent/reports', label: 'Child Reports', icon: <FiFileText /> },
      { path: '/parent/downloads', label: 'Download Reports', icon: <FiDownload /> },
    ],
  },
  {
    label: 'Account',
    items: [
      { path: '/parent/settings', label: 'Settings', icon: <FiSettings /> },
    ],
  },
];

export default function ParentSidebar() {
  const { user, logout } = useContext(AuthContext);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('ParentSidebar logout failed:', error);
    } finally {
      navigate('/login', { replace: true });
    }
  };

  const userInitial = useMemo(() => {
    const name = user?.displayName || user?.email || 'P';
    return String(name).charAt(0).toUpperCase();
  }, [user]);

  const closeMobile = () => setIsMobileOpen(false);

  return (
    <>
      <button
        type="button"
        className="parent-sidebar-toggle"
        onClick={() => setIsMobileOpen((v) => !v)}
        aria-label="Open parent navigation"
      >
        {isMobileOpen ? <FiX /> : <FiMenu />}
      </button>

      <aside className={`parent-sidebar ${isMobileOpen ? 'is-mobile-open' : ''}`}>
        <div className="parent-sidebar__header">
          <div className="parent-sidebar__brand">
            <div className="parent-sidebar__logo">
              <img src="/logo.png" alt="" className="parent-sidebar__logo-img" aria-hidden="true" />
            </div>
            <div>
              <div className="parent-sidebar__brand-name">LinawLetra</div>
              <div className="parent-sidebar__brand-sub">Parent Dashboard</div>
            </div>
          </div>

          <div className="parent-sidebar__user">
            <div className="parent-sidebar__avatar">{userInitial}</div>
            <div className="parent-sidebar__user-meta">
              <div className="parent-sidebar__user-name">{user?.displayName || 'Parent'}</div>
              <div className="parent-sidebar__user-role">{user?.role ? String(user.role) : 'parent'}</div>
            </div>
          </div>
        </div>

        <nav className="parent-sidebar__nav" aria-label="Parent navigation">
          {sidebarGroups.map((group) => (
            <div key={group.label} className="parent-sidebar__group">
              <div className="parent-sidebar__group-label">{group.label}</div>
              <ul className="parent-sidebar__list">
                {group.items.map((item) => (
                  <li key={`${group.label}-${item.label}`}>
                    <NavLink
                      to={item.path}
                      onClick={closeMobile}
                      className={({ isActive }) => {
                        const pathActive = isActive || location.pathname.startsWith(`${item.path}/`);
                        const isActiveEffective = pathActive;
                        return `parent-sidebar__link ${isActiveEffective ? 'is-active' : ''}`;
                      }}
                    >
                      <span className="parent-sidebar__icon">{item.icon}</span>
                      <span className="parent-sidebar__label">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="parent-sidebar__footer">
          <button type="button" className="parent-sidebar__logout" onClick={handleLogout}>
            <span className="parent-sidebar__logout-icon">
              <FiLogOut />
            </span>
            <span className="parent-sidebar__logout-label">Logout</span>
          </button>
        </div>
      </aside>

      {isMobileOpen && <div className="parent-sidebar__overlay" onClick={closeMobile} />}
    </>
  );
}


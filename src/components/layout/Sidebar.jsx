import React, { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarCheck2,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
} from 'lucide-react';

const navSections = [
  {
    label: 'Overview',
    items: [
      { path: '/teacher-dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/teacher/assessments', label: 'Assessments', icon: FileText },
    ],
  },
  {
    label: 'Students',
    items: [
      { path: '/teacher/students', label: 'My Students', icon: Users },
      { path: '/teacher/learning-paths', label: 'Learning paths', icon: BookOpen },
      { path: '/teacher/lessons', label: 'Lessons', icon: BookOpen },
      { path: '/teacher/reading', label: 'PDF reading', icon: FileText },
      { path: '/teacher/schedules', label: 'Schedules', icon: CalendarCheck2 },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { path: '/teacher/progress', label: 'Progress reports', icon: BarChart3 },
      { path: '/teacher/activities', label: 'Activities', icon: Activity },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/teacher/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Layout sidebar logout failed:', error);
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <aside className="teacher-sidebar">
      <div className="sidebar-top">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="" className="sidebar-brand-img" aria-hidden="true" />
          <div>
            <div className="sidebar-logo">LinawLetra</div>
            <div className="sidebar-role">Teacher dashboard</div>
          </div>
        </div>

        <div className="sidebar-menu">
          {navSections.map((section) => (
            <div key={section.label} className="sidebar-section">
              <div className="sidebar-section-title">{section.label}</div>
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
                  >
                    <span className="sidebar-item-icon">
                      <Icon size={18} />
                    </span>
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{(user?.firstName || user?.name || 'T').charAt(0)}</div>
          <div>
            <div className="sidebar-user-name">{user?.firstName || user?.name || 'Teacher'}</div>
            <div className="sidebar-user-role">{user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Teacher'}</div>
          </div>
        </div>
        <button type="button" className="sidebar-logout" onClick={handleLogout}>
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}

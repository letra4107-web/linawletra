import React, { useContext } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import {
  BookOpen,
  CalendarCheck2,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquare,
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
    label: 'Classroom',
    items: [
      { path: '/teacher/modules', label: 'Modules', icon: BookOpen },
      { path: '/teacher/class-roster', label: 'Class Roster', icon: Users },
      { path: '/teacher/assignments', label: 'Assignments', icon: CalendarCheck2 },
    ],
  },
  {
    label: 'Communication',
    items: [
      { path: '/teacher/messages', label: 'Messages', icon: MessageSquare },
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
        <div>
          <div className="sidebar-logo">LinawLetra</div>
          <div className="sidebar-role">Teacher dashboard</div>
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

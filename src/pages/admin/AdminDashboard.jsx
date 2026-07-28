import React, { useContext } from 'react';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { FiLogOut } from 'react-icons/fi';
import Sidebar from '../../components/Sidebar';
import { AuthContext } from '../../context/AuthContext';
import '../AdminDashboard.css';

const sectionMeta = {
  overview: { title: 'Overview', description: 'High-level platform metrics and quick health checks.' },
  users: { title: 'Users', description: 'User management, account status, and role controls.' },
  teachers: { title: 'Teachers', description: 'Teacher accounts, performance, and student assignment.' },
  content: { title: 'Content', description: 'Lessons, categories, and curriculum management tools.' },
  analytics: { title: 'Analytics', description: 'Platform trends, usage metrics, and progress charts.' },
  reports: { title: 'Reports', description: 'Exportable performance summaries and progress reports.' },
  communication: { title: 'Communication', description: 'Announcements, notifications, and messages.' },
  'ai-settings': { title: 'AI Settings', description: 'Reading assistance, recommendations, and AI controls.' },
  'system-settings': { title: 'System Settings', description: 'Security, profile, email, and platform preferences.' },
};

const getActiveSection = (pathname) => {
  const parts = pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'overview';
};

export default function AdminDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useContext(AuthContext);
  const activeSection = getActiveSection(location.pathname);
  const section = sectionMeta[activeSection] || sectionMeta.overview;

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Admin header logout failed:', error);
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="admin-dashboard-shell">
      <Sidebar />
      <div className="admin-dashboard-main">
        <header className="admin-dashboard-header">
          <div>
            <p className="dashboard-eyebrow">Admin Console</p>
            <h1>{section.title}</h1>
            <p className="dashboard-description">{section.description}</p>
          </div>
          <div className="dashboard-header-actions">
            <Link className="btn-secondary" to="overview">
              Overview
            </Link>
            <Link className="btn-secondary" to="analytics">
              Analytics
            </Link>
            <button type="button" className="btn-secondary admin-header-logout" onClick={handleLogout}>
              <FiLogOut aria-hidden="true" /> Logout
            </button>
          </div>
        </header>
        <main className="admin-dashboard-content" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

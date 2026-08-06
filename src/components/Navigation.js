import { useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function Navigation() {
  const { user } = useContext(AuthContext);
  const location = useLocation();

  const dashboardPrefixes = [
    '/dashboard',
    '/admin',
    '/teacher',
    '/parent',
    '/student',
    '/students',
    '/lesson',
    '/assessment',
  ];

  const authHiddenRoutes = [
    '/login',
    '/register',
    '/verify-email',
    '/resend-verification',
    '/verify-login-otp',
    '/forgot-password',
    '/reset-password',
  ];

  const shouldHideOnDashboard = user && dashboardPrefixes.some((prefix) =>
    location.pathname === prefix || location.pathname.startsWith(`${prefix}/`)
  );

  const shouldHideOnAuthFlow = authHiddenRoutes.includes(location.pathname);

  // Hide top navbar on dashboard and authentication/verification screens
  if (shouldHideOnDashboard || shouldHideOnAuthFlow) {
    return null;
  }

  // NOTE: ProgressReports/ParentDashboard navbar visibility logic is intentionally conservative.

  if (!user) return null;

  return null;
}

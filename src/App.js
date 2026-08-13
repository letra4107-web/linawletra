import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext, AuthProvider } from './context/AuthContext';
import Navigation from './components/Navigation';
import Home from './pages/Home';
import Login from './components/Login';
import Register from './components/Register';
import EmailVerification from './components/EmailVerification';
import OTPVerification from './components/OTPVerification';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import ResendVerification from './components/ResendVerification';
import AdminDashboard from './pages/admin/AdminDashboard';
import Overview from './pages/admin/Overview';
import Users from './pages/admin/Users';
import Teachers from './pages/admin/Teachers';
import Content from './pages/admin/Content';
import Analytics from './pages/admin/Analytics';
import Reports from './pages/admin/Reports';
import Communication from './pages/admin/Communication';
import AISettings from './pages/admin/AISettings';
import SystemSettings from './pages/admin/SystemSettings';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherLayout from './components/layout/TeacherLayout';
import StudentDashboard from './pages/StudentDashboard';
import ParentDashboard from './pages/ParentDashboard';
import StudentManagement from './components/StudentManagement';
import Schedules from './pages/Schedules';

import AssessmentComponent from './components/AssessmentComponent';
import LessonComponent from './components/LessonComponent';
import AssessmentsPage from './pages/AssessmentsPage';
import MyStudentsPage from './pages/MyStudentsPage';
import LearningPathsPage from './pages/LearningPathsPage';
import TeacherLessonsPage from './pages/TeacherLessonsPage';
import TeacherProgressPage from './pages/TeacherProgressPage';
import TeacherActivitiesPage from './pages/TeacherActivitiesPage';
import TeacherSettingsPage from './pages/TeacherSettingsPage';
import TeacherReadingMaterials from './pages/TeacherReadingMaterials';
import TeacherStudentDetailPage from './pages/TeacherStudentDetailPage';
import TeacherSchedulesPage from './pages/TeacherSchedulesPage';
import './index.css';

const isSystemGeneratedStudentEmail = (email = '') => {
  const normalizedEmail = String(email).toLowerCase();
  return normalizedEmail.endsWith('@linawletra.edu.ph') ||
    normalizedEmail.endsWith('@linaw.local') ||
    normalizedEmail.endsWith('@student.linawletra.ph');
};

const needsEmailVerification = (user) =>
  !user?.emailVerified &&
  user?.role !== 'student' &&
  !isSystemGeneratedStudentEmail(user?.email);

function PrivateRoute({ children, allowedRoles = [] }) {
  const { user, loading } = useContext(AuthContext);

  if (loading) return <div style={{ marginTop: '2rem' }}>Loading...</div>;

  if (!user) return <Navigate to="/login" />;

  const requiresEmailVerification = needsEmailVerification(user);

  if (requiresEmailVerification) {
    return (
      <Navigate
        to="/verify-email"
        state={{
          email: user.email,
          message: 'Please enter the 6-digit verification code sent to your email before continuing.',
        }}
        replace
      />
    );
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" />;
  }

  return children;
}

function RoleBasedRedirect() {
  const { user } = useContext(AuthContext);

  if (!user) return <Navigate to="/login" />;

  if (needsEmailVerification(user)) {
    return (
      <Navigate
        to="/verify-email"
        state={{
          email: user.email,
          message: 'Please verify your email with the 6-digit code to continue.',
        }}
        replace
      />
    );
  }

  // Redirect to role-specific dashboard
  switch (user.role) {
    case 'admin':
      return <Navigate to="/admin-dashboard/overview" />;
    case 'teacher':
      return <Navigate to="/teacher-dashboard" />;
    case 'student':
      return <Navigate to="/student" />;
    case 'parent':
      return <Navigate to="/parent/summary" />;
    default:
      return <Navigate to="/dashboard" />;
  }
}

function AppRoutes() {
  const { user } = useContext(AuthContext);

  return (
    <>
      <a
        href="#main-content"
        style={{
          position: 'absolute',
          top: '-40px',
          left: 0,
          background: '#4F46E5',
          color: '#fff',
          padding: '8px 16px',
          borderRadius: '0 0 8px 0',
          fontWeight: 700,
          fontSize: '0.875rem',
          zIndex: 9999,
          transition: 'top 120ms ease',
          textDecoration: 'none',
        }}
        onFocus={(e) => { e.currentTarget.style.top = '0'; }}
        onBlur={(e) => { e.currentTarget.style.top = '-40px'; }}
      >
        Pumunta sa nilalaman
      </a>
      <Navigation />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={user ? <RoleBasedRedirect /> : <Login />} />
        <Route path="/register" element={user ? <RoleBasedRedirect /> : <Register />} />
        <Route path="/verify-email" element={<EmailVerification />} />
        <Route path="/email-verification" element={<EmailVerification />} />
        <Route path="/verify-otp" element={<EmailVerification />} />
        <Route path="/resend-verification" element={<ResendVerification />} />
        <Route path="/verify-login-otp" element={<OTPVerification />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/dashboard" element={<PrivateRoute><RoleBasedRedirect /></PrivateRoute>} />

        {/* Admin routes (URL-based sections for correct sidebar active state) */}
        <Route path="/admin-dashboard/*" element={<PrivateRoute allowedRoles={['admin']}><AdminDashboard /></PrivateRoute>}>
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="users" element={<Users />} />
          <Route path="teachers" element={<Teachers />} />
          <Route path="content" element={<Content />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="reports" element={<Reports />} />
          <Route path="communication" element={<Communication />} />
          <Route path="ai-settings" element={<AISettings />} />
          <Route path="system-settings" element={<SystemSettings />} />
        </Route>
        <Route path="/admin" element={<Navigate to="/admin-dashboard/overview" replace />} />

        <Route path="/student-dashboard" element={<PrivateRoute allowedRoles={['student']}><StudentDashboard /></PrivateRoute>} />
        <Route path="/student" element={<PrivateRoute allowedRoles={['student']}><StudentDashboard /></PrivateRoute>} />
        <Route path="/student/modules" element={<PrivateRoute allowedRoles={['student']}><StudentDashboard /></PrivateRoute>} />
        <Route path="/student/practice" element={<PrivateRoute allowedRoles={['student']}><StudentDashboard /></PrivateRoute>} />
        <Route path="/student/word-of-the-day" element={<PrivateRoute allowedRoles={['student']}><StudentDashboard /></PrivateRoute>} />
        <Route path="/student/activities" element={<PrivateRoute allowedRoles={['student']}><StudentDashboard /></PrivateRoute>} />
        <Route path="/student/calendar" element={<PrivateRoute allowedRoles={['student']}><StudentDashboard /></PrivateRoute>} />
        <Route path="/student/notifications" element={<PrivateRoute allowedRoles={['student']}><StudentDashboard /></PrivateRoute>} />
        <Route path="/student/badges" element={<PrivateRoute allowedRoles={['student']}><StudentDashboard /></PrivateRoute>} />
        <Route path="/student/profile" element={<PrivateRoute allowedRoles={['student']}><StudentDashboard /></PrivateRoute>} />
        <Route path="/student/settings" element={<PrivateRoute allowedRoles={['student']}><StudentDashboard /></PrivateRoute>} />
        <Route path="/student-dashboard/:childId" element={<PrivateRoute allowedRoles={['parent']}><StudentDashboard /></PrivateRoute>} />
        <Route path="/student/dashboard/:childId" element={<PrivateRoute allowedRoles={['parent']}><StudentDashboard /></PrivateRoute>} />
        <Route path="/student/:childId" element={<PrivateRoute allowedRoles={['parent']}><StudentDashboard /></PrivateRoute>} />

        {/* Parent routes (single ParentDashboard with sections) */}
        <Route path="/parent-dashboard" element={<Navigate to="/parent/summary" replace />} />
        <Route path="/parent" element={<Navigate to="/parent/summary" replace />} />
        <Route path="/parent/schedules" element={<PrivateRoute allowedRoles={['parent']}><Schedules /></PrivateRoute>} />
        <Route path="/parent/:section" element={<PrivateRoute allowedRoles={['parent']}><ParentDashboard /></PrivateRoute>} />
        <Route path="/students" element={<PrivateRoute allowedRoles={['parent', 'admin']}><StudentManagement /></PrivateRoute>} />
        <Route path="/assessment/:assessmentId" element={<PrivateRoute allowedRoles={['teacher', 'parent']}><AssessmentComponent /></PrivateRoute>} />
        <Route path="/lessons/:lessonId" element={<PrivateRoute allowedRoles={['teacher', 'admin']}><LessonComponent /></PrivateRoute>} />
        <Route path="/lesson/:lessonId/:studentId" element={<PrivateRoute allowedRoles={['student', 'teacher', 'parent']}><LessonComponent /></PrivateRoute>} />

        <Route element={<PrivateRoute allowedRoles={['teacher']}><TeacherLayout /></PrivateRoute>}>
          <Route path="/teacher-dashboard" element={<TeacherDashboard />} />
          <Route path="/teacher/assessments" element={<AssessmentsPage />} />
          <Route path="/teacher/students" element={<MyStudentsPage />} />
          <Route path="/teacher/students/:studentId" element={<TeacherStudentDetailPage />} />
          <Route path="/teacher/learning-paths" element={<LearningPathsPage />} />
          <Route path="/teacher/learning-paths/:pathId" element={<LearningPathsPage />} />
          <Route path="/teacher/lessons" element={<TeacherLessonsPage />} />
          <Route path="/teacher/progress" element={<TeacherProgressPage />} />
          <Route path="/teacher/activities" element={<TeacherActivitiesPage />} />
          <Route path="/teacher/schedules" element={<TeacherSchedulesPage />} />
          <Route path="/teacher/reading" element={<TeacherReadingMaterials />} />
          <Route path="/teacher/settings" element={<TeacherSettingsPage />} />
        </Route>
        <Route path="/student/lessons" element={<Navigate to="/student/modules" replace />} />
        <Route path="/student/learn" element={<PrivateRoute allowedRoles={['student']}><StudentDashboard /></PrivateRoute>} />
        <Route path="/student/assessments" element={<Navigate to="/student/modules" replace />} />
        <Route path="/student/progress" element={<PrivateRoute allowedRoles={['student']}><StudentDashboard /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;

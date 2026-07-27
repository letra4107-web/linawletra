import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function TeacherLayout() {
  return (
    <div className="teacher-dashboard-page">
      <Sidebar />
      <Outlet />
    </div>
  );
}

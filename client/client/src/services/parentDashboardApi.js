import { studentService, progressService } from './api';

export const parentDashboardApi = {
  getDashboard: async () => {
    try {
      const res = await studentService.getStudents();
      const children = Array.isArray(res.data) ? res.data : [];
      return {
        childCount: children.length,
        children,
      };
    } catch (e) {
      return {};
    }
  },

  getChildren: async () => {
    try {
      const res = await studentService.getStudents();
      return Array.isArray(res.data) ? res.data : [];
    } catch (e) {
      return [];
    }
  },

  getProgressByChildId: async (childId) => {
    try {
      const res = await studentService.getStudentDashboard(childId);
      return res?.data?.data ?? res?.data ?? {};
    } catch (e) {
      return {};
    }
  },

  getActivitiesByChildId: async (childId) => {
    try {
      const res = await progressService.getProgressByStudent(childId);
      return Array.isArray(res?.data) ? res.data : [];
    } catch (e) {
      return [];
    }
  },

  getNotifications: async () => {
    return [];
  },
};


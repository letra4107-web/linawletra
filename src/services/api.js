import axios from 'axios';

const PRODUCTION_API_URL = 'https://linawletra-production.up.railway.app/api';

const normalizeApiBaseUrl = (baseUrl) => {
  const trimmedUrl = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmedUrl) return trimmedUrl;
  return trimmedUrl.endsWith('/api') ? trimmedUrl : `${trimmedUrl}/api`;
};

const API_BASE_URL = normalizeApiBaseUrl(
  process.env.REACT_APP_API_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.API_BASE_URL ||
  (process.env.NODE_ENV === 'production' ? PRODUCTION_API_URL : 'http://localhost:5002/api')
);

if (typeof window !== 'undefined') {
  console.info('[API] Base URL:', API_BASE_URL);
}

const DEFAULT_API_TIMEOUT_MS = 10000;
const AUTH_EMAIL_TIMEOUT_MS = 20000;

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: DEFAULT_API_TIMEOUT_MS,
});

// Add Supabase Auth token to requests
axiosInstance.interceptors.request.use(async (config) => {
  try {
    const requestUrl = new URL(config.url || '', config.baseURL || API_BASE_URL).toString();
    if (requestUrl.includes('/auth/register')) {
      console.info('[API] Register request URL:', requestUrl);
    }
    const { supabase } = await import('../config/supabase');
    const { data: { session }, error } = await supabase.auth.getSession();
    if (session?.access_token && !error) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    } else {
      const storedToken = localStorage.getItem('authToken') || localStorage.getItem('token');
      if (storedToken) {
        config.headers.Authorization = `Bearer ${storedToken}`;
      }
    }
  } catch (error) {
    console.error('Error getting auth token:', error);
    const storedToken = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (storedToken) {
      config.headers.Authorization = `Bearer ${storedToken}`;
    }
  }
  return config;
});

// Response interceptor for error handling
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config || {};
    const safeUrl = (() => {
      try {
        return new URL(config.url || '', config.baseURL || API_BASE_URL).toString();
      } catch {
        return config.url || 'unknown';
      }
    })();
    console.error('API Error:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      method: config.method,
      url: safeUrl,
      response: error.response?.data,
    });
    const maxRetries = 2;
    const retryableMethods = ['get', 'head', 'options'];
    // Only retry safe idempotent requests on network failures or server errors (500+).
    // Do not retry POST sign-up requests or 400/429 client errors.
    const shouldRetry = (!error.response && error.request) || (error.response && error.response.status >= 500);

    const authRetrySkipPatterns = ['/auth', '/signup', '/login', 'auth/v1'];
    const isAuthEndpoint = config && config.url && authRetrySkipPatterns.some((pattern) => config.url.includes(pattern));

    if (
      config &&
      retryableMethods.includes(config.method?.toLowerCase()) &&
      shouldRetry &&
      (config.__retryCount || 0) < maxRetries &&
      !isAuthEndpoint
    ) {
      config.__retryCount = (config.__retryCount || 0) + 1;
      const delay = 250 * Math.pow(2, config.__retryCount - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return axiosInstance(config);
    }

    if (error.response) {
      // Server responded with error status
      const { status, data } = error.response;
      const authEndpointPatterns = ['/auth', '/signup', '/login', 'auth/v1'];
      const isAuthEndpoint = config.url && authEndpointPatterns.some((pattern) => config.url.includes(pattern));

      const createError = (message, statusCode) => {
        const err = new Error(message);
        err.status = statusCode;
        err.response = error.response;
        err.data = data;
        return err;
      };

      if (status === 429) {
        throw createError('Signup temporarily blocked due to too many attempts. Please wait 15–30 minutes or use a different email/IP.', 429);
      }

      if (status === 401) {
        if (!isAuthEndpoint) {
          localStorage.removeItem('token');
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');

          window.location.href = '/login';
          throw createError('Session expired. Please log in again.', 401);
        }

        throw createError(data?.message || 'Invalid email or password.', 401);
      }

      if (status === 403) {
        throw createError(data?.message || 'Access denied.', 403);
      }

      if (status === 404) {
        const isAuthEndpoint = config.url && authEndpointPatterns.some((pattern) => config.url.includes(pattern));
        throw createError(
          isAuthEndpoint
            ? 'Registration API route was not found. Check REACT_APP_API_URL and Railway backend deployment.'
            : 'Resource not found.',
          404
        );
      }

      if (status === 422) {
        // Validation errors
        const validationErrors = data.errors || data.message || 'Validation failed';
        throw createError(validationErrors, 422);
      }

      if (status >= 500) {
        throw createError(data?.message || data?.error || 'Server error. Please try again later.', status);
      }

      throw createError(data.message || data.error || `Request failed with status ${status}`, status);
    } else if (error.code === 'ECONNABORTED' || (error.message && error.message.toLowerCase().includes('timeout'))) {
      throw new Error('The request is taking longer than expected. Please wait a moment, then try again.');
    } else if (error.request) {
      // Network error
      throw new Error('Network error. Please check your connection and try again.');
    } else {
      // Other error
      throw new Error(error.message || 'An unexpected error occurred');
    }
  }
);

// Auth Service
export const authService = {
  register: (data) => axiosInstance.post('/auth/register', data, { timeout: AUTH_EMAIL_TIMEOUT_MS }),
  verifyEmail: (data) => axiosInstance.post('/auth/verify-email', data, { timeout: AUTH_EMAIL_TIMEOUT_MS }),
  sendEmailVerificationCode: (data) => axiosInstance.post('/auth/send-email-verification-code', data, { timeout: AUTH_EMAIL_TIMEOUT_MS }),
  sendStudentEnrollmentEmail: (data) => axiosInstance.post('/auth/send-student-enrollment-email', data, { timeout: AUTH_EMAIL_TIMEOUT_MS }),
  resendVerificationCode: (email) => axiosInstance.post('/auth/resend-verification-code', { email }, { timeout: AUTH_EMAIL_TIMEOUT_MS }),
  login: (data) => axiosInstance.post('/auth/login', data),
  sendLoginOTP: (data) => axiosInstance.post('/auth/send-login-otp', typeof data === 'string' ? { email: data } : data, { timeout: AUTH_EMAIL_TIMEOUT_MS }),
  verifyLoginOTP: (data) => axiosInstance.post('/auth/verify-login-otp', data, { timeout: AUTH_EMAIL_TIMEOUT_MS }),
  createProfile: (data) => axiosInstance.post('/auth/create-profile', data),
  resendLoginOTP: (email) => axiosInstance.post('/auth/resend-login-otp', { email }, { timeout: AUTH_EMAIL_TIMEOUT_MS }),
  forgotPassword: (email) => axiosInstance.post('/auth/forgot-password', { email }, { timeout: AUTH_EMAIL_TIMEOUT_MS }),
  verifyResetCode: (data) => axiosInstance.post('/auth/verify-reset-code', data),
  resetPassword: (data) => axiosInstance.post('/auth/reset-password', data),
  getAdminOverview: () => axiosInstance.get('/admin/overview'),
  getAssignedStudents: () => axiosInstance.get('/students/all'),
};

// Dashboard Service
export const dashboardService = {
  getStats: () => axiosInstance.get('/dashboard/stats'),
};

// Assessment Service
export const assessmentService = {
  createAssessment: (data) => axiosInstance.post('/assessments', data),
  submitAssessment: (data) => axiosInstance.post('/assessments', data),
  getAssessments: () => axiosInstance.get('/assessments'),
  getAssessmentByStudent: (studentId) => axiosInstance.get(`/assessments/student/${studentId}`),
  updateAssessmentScores: (id, data) => axiosInstance.put(`/assessments/${id}`, data),
};

// Student Service
export const studentService = {
  createStudent: (data) => axiosInstance.post('/students', data),
  getStudents: async () => {
    const res = await axiosInstance.get('/students');
    return {
      ...res,
      data: res.data?.data?.students ?? res.data?.students ?? res.data,
    };
  },
  getAllStudents: async () => {
    const res = await axiosInstance.get('/students/all');
    return {
      ...res,
      data: res.data?.data?.students ?? res.data?.students ?? res.data,
    };
  },
  getStudent: (id) => axiosInstance.get(`/students/${id}`),
  getStudentDashboard: (id) => axiosInstance.get(`/students/${id}/dashboard`),
  getDashboardData: (id) => axiosInstance.get(`/progress/${id}/stats`),
  getCanonicalStats: (id) => axiosInstance.get(`/progress/${id}/stats`),
  updateStudent: (id, data) => axiosInstance.put(`/students/${id}`, data),
  deleteStudent: (id) => axiosInstance.delete(`/students/${id}`),
  verifyChildPin: (id, pin) => axiosInstance.post(`/students/${id}/verify-pin`, { pin }),
  getPracticeLevel: (id) => axiosInstance.get(`/students/${id}/practice-level`),
  setPracticeLevel: (id, data) => axiosInstance.post(`/students/${id}/practice-level`, data),
};

// Lesson Service
export const lessonService = {
  getLessons: (params) => axiosInstance.get('/lessons', { params }),
  getAllLessons: () => axiosInstance.get('/lessons'),
  getLesson: (id) => axiosInstance.get(`/lessons/${id}`),
  createLesson: (data) => axiosInstance.post('/lessons', data),
  updateLesson: (id, data) => axiosInstance.put(`/lessons/${id}`, data),
  deleteLesson: (id) => axiosInstance.delete(`/lessons/${id}`),
};

// Progress Service
export const progressService = {
  createOrGetProgress: (data) => axiosInstance.post('/progress', data),
  updateProgress: (id, data) => axiosInstance.put(`/progress/${id}`, data),
  getProgressByStudent: (studentId) => axiosInstance.get(`/progress/student/${studentId}`),
  getDashboardData: (studentId) => axiosInstance.get(`/progress/dashboard/${studentId}`),
  getCanonicalStats: (studentId) => axiosInstance.get(`/progress/${studentId}/stats`),
  getProgressReports: () => axiosInstance.get('/progress/reports'),
};

// Schedule Service
export const scheduleService = {
  createSchedule: (data) => axiosInstance.post('/schedules', data),
  getSchedulesByStudent: (studentId) => axiosInstance.get(`/schedules/student/${studentId}`),
  getSchedulesByParent: () => axiosInstance.get('/schedules/parent/list'),
  getSchedulesByTeacher: () => axiosInstance.get('/schedules/teacher/list'),
  updateSchedule: (id, data) => axiosInstance.put(`/schedules/${id}`, data),
  deleteSchedule: (id) => axiosInstance.delete(`/schedules/${id}`),
};

// Admin Service
export const adminService = {
  getOverview: () => axiosInstance.get('/admin/overview'),
  getAnalytics: () => axiosInstance.get('/admin/analytics'),
  getUsers: (params) => axiosInstance.get('/admin/users', { params }),
  getTeachers: (params) => axiosInstance.get('/admin/teachers', { params }),
  createTeacher: (data) => axiosInstance.post('/admin/teachers/create', data),
  updateUser: (id, data) => axiosInstance.put(`/admin/users/${id}`, data),
  deleteUser: (id) => axiosInstance.delete(`/admin/users/${id}`),
  getPendingUsers: () => axiosInstance.get('/admin/pending-users'),
  updatePendingUser: (id, data) => axiosInstance.put(`/admin/pending-users/${id}`, data),
  getReports: () => axiosInstance.get('/admin/reports'),
  getFeedback: () => axiosInstance.get('/admin/feedback'),
  updateFeedback: (id, data) => axiosInstance.put(`/admin/feedback/${id}`, data),
  getHealth: () => axiosInstance.get('/admin/health'),
  deleteFeedback: (id) => axiosInstance.delete(`/admin/feedback/${id}`),
  getSettings: () => axiosInstance.get('/admin/settings'),
  updateSettings: (data) => axiosInstance.put('/admin/settings', data),
  getContent: (params) => axiosInstance.get('/admin/content', { params }),
  getNotifications: (params) => axiosInstance.get('/admin/notifications', { params }),
  getLogs: (params) => axiosInstance.get('/admin/logs', { params }),
};

// User Service
export const userService = {
  deleteUser: (userId) => axiosInstance.delete(`/users/${userId}`),
  getAllTeachers: () => axiosInstance.get('/users/teachers'),
  getAllUsers: () => axiosInstance.get('/users'),
  getUser: (id) => axiosInstance.get(`/users/${id}`),
  updateUser: (id, data) => axiosInstance.put(`/users/${id}`, data),
  getProfile: () => axiosInstance.get('/users/profile'),
  updateProfile: (data) => axiosInstance.put('/users/profile', data),
  syncClaims: () => axiosInstance.get('/users/sync-claims'),
};

// Speech Service
export const speechService = {
  speechToText: (audioFile) => {
    const formData = new FormData();
    formData.append('audio', audioFile);
    return axiosInstance.post('/speech/stt', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  // Returns { audioUrl, timepoints, source } — audioUrl is a playable URL
  // (Storage URL, cache hit, or a data: URL for the OpenAI fallback), and
  // timepoints (per-syllable Google marks) is [] when it came from OpenAI.
  textToSpeech: (text, options = {}) => axiosInstance.post('/speech/tts', { text, ...options }),
};

// Practice Words Service
const PRACTICE_WORDS_CACHE_KEY = 'linawletra_practice_words_cache';

const toCamelCasePracticeWord = (row = {}) => ({
  id: row.id,
  word: row.word,
  accentedSpelling: row.accented_spelling ?? row.accentedSpelling ?? row.word,
  meaning: row.meaning,
  example: row.example ?? null,
  isHomograph: Boolean(row.is_homograph ?? row.isHomograph),
  homographGroup: row.homograph_group ?? row.homographGroup ?? null,
  difficulty: row.difficulty || 'madali',
  tags: row.tags || [],
});

export const practiceWordService = {
  // Fetches from Supabase (via backend); falls back to the last-known cache,
  // and otherwise returns no words. Reading content must come from the backend.
  getPracticeWords: async () => {
    try {
      const response = await axiosInstance.get('/practice-words');
      const words = (response.data?.words || []).map(toCamelCasePracticeWord);
      if (words.length > 0) {
        localStorage.setItem(PRACTICE_WORDS_CACHE_KEY, JSON.stringify(words));
        return words;
      }
      throw new Error('Empty practice word list from server');
    } catch (error) {
      console.warn('Falling back to cached/offline practice words:', error.message);
      try {
        const cached = localStorage.getItem(PRACTICE_WORDS_CACHE_KEY);
        if (cached) return JSON.parse(cached);
      } catch (cacheError) {
        console.warn('Practice word cache read failed:', cacheError.message);
      }
      return [];
    }
  },
};

// Canonical Curriculum Service
export const curriculumService = {
  getItems: (params = {}) => axiosInstance.get('/curriculum/items', { params }),
  getRequirements: () => axiosInstance.get('/curriculum/requirements'),
  getNextItem: (params = {}) => axiosInstance.get('/curriculum/next', { params }),
  getProgress: (studentId) => axiosInstance.get(`/curriculum/progress/${studentId}`),
  submitAttempt: (data) => axiosInstance.post('/curriculum/attempts', data),
};

// Reading Assistant Service
export const readingService = {
  previewMaterial: (formData) => axiosInstance.post('/reading/preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  }),
  uploadMaterial: (formData) => axiosInstance.post('/reading/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 30000,
  }),
  getMaterials: () => axiosInstance.get('/reading/materials'),
  getMaterial: (id) => axiosInstance.get(`/reading/materials/${id}`),
  saveAttempt: (data) => axiosInstance.post('/reading/attempts', data),
  getAnalytics: () => axiosInstance.get('/reading/analytics'),
  getWordMastery: (studentId) => axiosInstance.get(`/reading/mastery/${studentId}`),
  getConfusionPatterns: (studentId) => axiosInstance.get(`/reading/confusions/${studentId}`),
  getPracticeRecommendations: (studentId) => axiosInstance.get(`/reading/practice-recommendations/${studentId}`),
  checkLevelReadiness: (studentId, levelWords) => axiosInstance.post(`/reading/level-check/${studentId}`, { levelWords }),
};

export default axiosInstance;

// ===== AXIOS BASE INSTANCE =====

import axios from 'axios';
import { API_BASE_URL, LOGGED_IN_USER_ID_KEY, DEFAULT_USER_ID } from '../constants/index.js';

// ---- Resolve the active user ID ----
// Priority: localStorage value → fallback to seeded DEFAULT_USER_ID
// This is evaluated once at module load and then kept live via the interceptor below.
function getActiveUserId() {
  return localStorage.getItem(LOGGED_IN_USER_ID_KEY) || DEFAULT_USER_ID;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    // Set the header at instance level so it is always present — even before
    // the interceptor runs (e.g. during module initialization or edge cases).
    'X-User-Id': getActiveUserId(),
  },
});

// ---- Request Interceptor ----
// Re-reads the active user from localStorage on every request so that
// switching users (future feature) is reflected immediately without
// re-creating the Axios instance.
api.interceptors.request.use(
  (config) => {
    config.headers['X-User-Id'] = getActiveUserId();
    return config;
  },
  (error) => Promise.reject(error)
);

// ---- Response Interceptor ----
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const data = error.response?.data;

    // Extract FluentValidation errors (RFC-7807 structure: { errors: { field: [messages] } })
    let message;
    if (data?.errors && typeof data.errors === 'object') {
      const validationMessages = Object.values(data.errors)
        .flat()
        .filter(Boolean);
      if (validationMessages.length > 0) {
        message = validationMessages.join(' | ');
      }
    }

    if (!message) {
      message =
        data?.error ||
        data?.title ||
        error.message ||
        'An unexpected error occurred';
    }

    // Re-throw with a clean message
    const enhancedError = new Error(message);
    enhancedError.status = error.response?.status;
    enhancedError.original = error;
    return Promise.reject(enhancedError);
  }
);

export default api;

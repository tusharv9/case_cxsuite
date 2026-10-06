// ===== AXIOS BASE INSTANCE =====

import axios from 'axios';
import { getApiBaseUrl, getAuthHeaders, notifyUnauthorized } from './hostBridge.js';

// No identity is baked in here: every request asks the host bridge who the caller is, so a token
// refreshed by the Host App (or a different dev user) is picked up immediately.
const api = axios.create({
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ---- Request Interceptor ----
api.interceptors.request.use(
  async (config) => {
    config.baseURL = getApiBaseUrl();
    const auth = await getAuthHeaders();
    for (const [name, value] of Object.entries(auth)) config.headers.set(name, value);
    return config;
  },
  (error) => Promise.reject(error)
);

// ---- Response Interceptor ----
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
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

    if (status === 401) {
      notifyUnauthorized();
    } else if (status === 403 && !data?.error) {
      message = 'You do not have permission to do that.';
    }

    // Re-throw with a clean message
    const enhancedError = new Error(message);
    enhancedError.status = status;
    enhancedError.original = error;
    return Promise.reject(enhancedError);
  }
);

export default api;

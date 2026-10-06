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
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const STARTUP_RETRIES = 6;
const STARTUP_RETRY_DELAY_MS = 2500;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    const status = error.response?.status;
    const data = error.response?.data;

    // A read that failed because the server or network blinked is tried once more: it is safe to repeat.
    const isRead = config && (config.method || 'get').toLowerCase() === 'get';
    const transient = !error.response && error.code !== 'ERR_CANCELED' || RETRYABLE_STATUS.has(status);
    if (isRead && transient && !config.__retried) {
      config.__retried = true;
      await wait(400);
      return api.request(config);
    }

    // While the server restarts (a deploy, or waking up) it answers 503 "Initializing" to everything BEFORE running the
    // request, so even a write is safe to send again. Give it a few short chances instead of failing the user's action.
    const stillStarting = status === 503 && data?.status === 'Initializing';
    if (config && stillStarting && (config.__startupRetries || 0) < STARTUP_RETRIES) {
      config.__startupRetries = (config.__startupRetries || 0) + 1;
      await wait(STARTUP_RETRY_DELAY_MS);
      return api.request(config);
    }

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
      message = data?.error || data?.title || error.message || 'An unexpected error occurred';
    }

    // Say something a person can act on, instead of axios' technical wording.
    if (!error.response) {
      message = error.code === 'ECONNABORTED' ? 'The server took too long to answer. Please try again.' : 'Cannot reach the server. Check your connection and try again.';
    } else if (stillStarting || status === 502 || status === 503 || status === 504) {
      message = 'The server is restarting or temporarily unavailable. Please wait a few seconds and try again.';
    } else if (status === 401) {
      notifyUnauthorized();
    } else if (status === 403 && !data?.error) {
      message = 'You do not have permission to do that.';
    } else if (status === 429) {
      const seconds = Number(error.response.headers?.['retry-after']);
      message = seconds > 0 ? `Too many requests. Please wait ${seconds} second${seconds === 1 ? '' : 's'} and try again.` : 'Too many requests. Please slow down and try again shortly.';
    } else if (status >= 500 && data?.correlationId) {
      message = `${message} (reference ${String(data.correlationId).slice(0, 8)})`;   // support can find exactly this failure in the logs
    }

    // Re-throw with a clean message
    const enhancedError = new Error(message);
    enhancedError.status = status;
    enhancedError.correlationId = data?.correlationId;
    enhancedError.original = error;
    return Promise.reject(enhancedError);
  }
);

export default api;

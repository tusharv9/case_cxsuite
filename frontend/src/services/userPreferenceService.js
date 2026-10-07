// ===== USER PREFERENCE SERVICE =====
// A person's own UI preferences (e.g. which view the customer directory opens in), stored on the SERVER per user so they follow
// the user to any browser or device. The browser's localStorage is only a cache: it makes the saved choice apply instantly on load
// (no flash of the default view) and keeps working if the server cannot be reached. The server value wins whenever it is known.

import api from './api.js';

const CACHE_PREFIX = 'csm_pref:';

function readCache(key) {
  try { return localStorage.getItem(CACHE_PREFIX + key); } catch { return null; }
}
function writeCache(key, value) {
  try { localStorage.setItem(CACHE_PREFIX + key, value); } catch { /* storage unavailable: the server copy still holds */ }
}

export const userPreferenceService = {
  /** The cached value, available synchronously. */
  getCached(key) {
    return readCache(key);
  },

  /** The server's value (also refreshes the cache). Resolves null when none is saved or the server is unreachable. */
  async get(key) {
    try {
      const { data } = await api.get(`/api/preferences/${encodeURIComponent(key)}`);
      if (data?.value) writeCache(key, data.value);
      return data?.value || null;
    } catch {
      return null;
    }
  },

  /** Saves to the cache immediately and to the server in the background. Never throws: a preference must not break the screen. */
  async set(key, value) {
    writeCache(key, value);
    try {
      await api.put(`/api/preferences/${encodeURIComponent(key)}`, { value });
      return true;
    } catch {
      return false;
    }
  },
};

// ===== USER SERVICE =====
// Users are owned by the Host App. This service only reads them (and the caller's own operational
// status); Case Management has no way to create, edit or delete a user.

import api from './api.js';

// The picker list is wanted by several components at once (app shell, drawers, filters). They share one request, and a result is
// reused for a few seconds, instead of each asking the server again.
const USERS_TTL_MS = 10_000;
let usersCache = null;   // { at, promise }

export const userService = {
  /** Active users, for pickers (assign, co-worker, team lead…). Concurrent callers share one request. */
  getAllUsers() {
    const now = Date.now();
    if (usersCache && now - usersCache.at < USERS_TTL_MS) return usersCache.promise;
    const promise = api.get('/api/users').then((r) => r.data);
    usersCache = { at: now, promise };
    promise.catch(() => { if (usersCache?.promise === promise) usersCache = null; });
    return promise;
  },

  /** The signed-in user as Case Management knows them, plus their permissions: { user, permissions }. */
  getMe() {
    return api.get('/api/users/me').then((r) => r.data);
  },

  /** Own operational status: Available | Busy | Away | Offline. */
  updateStatus(status) {
    return api.put('/api/users/me/status', { status }).then((r) => r.data);
  },
};

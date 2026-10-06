// ===== USER SERVICE =====
// Users are owned by the Host App. This service only reads them (and the caller's own operational
// status); Case Management has no way to create, edit or delete a user.

import api from './api.js';

export const userService = {
  /** Active users, for pickers (assign, co-worker, team lead…). */
  getAllUsers() {
    return api.get('/api/users').then((r) => r.data);
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

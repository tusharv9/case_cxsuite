// ===== ASSIGN & REASSIGN SETTINGS =====
import api from './api.js';

export const assignmentSettingsService = {
  /** Policy, default routing strategy and every team with its lead and members (from the database). */
  get() {
    return api.get('/api/assignment-settings').then((r) => r.data);
  },

  /** Saves everything at once; 409 when someone else saved since `expectedVersion` was loaded. */
  save(dto) {
    return api.put('/api/assignment-settings', dto).then((r) => r.data);
  },
};

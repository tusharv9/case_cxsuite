// ===== USER SERVICE =====

import api from './api.js';

export const userService = {
  getAllUsers() {
    return api.get('/api/users').then((r) => r.data);
  },

  createUser(dto) {
    return api.post('/api/users', dto).then((r) => r.data);
  },

  updateStatus(status) {
    // We send status as a query string or body depending on backend.
    // The backend signature says: POST or PUT /api/users/me/status
    // Assuming JSON body `{"status": "..."}` or maybe a query string?
    // Let's pass it as a query parameter or simple string, but usually it's a DTO.
    // Actually the user said "PUT /api/users/me/status" "change status (Available, Break, Offline)".
    // A standard string payload usually requires quotes: '"Available"' or we can pass an object.
    // Let's send `{ status }`.
    return api.put('/api/users/me/status', { status }).then((r) => r.data);
  }
};

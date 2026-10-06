// ===== TEAM SERVICE =====

import api from './api.js';

export const teamService = {
  getAllTeams() {
    return api.get('/api/teams').then((r) => r.data);
  },

  createTeam(dto) {
    return api.post('/api/teams', dto).then((r) => r.data);
  },

  updateTeam(id, dto) {
    return api.put(`/api/teams/${id}`, dto).then((r) => r.data);
  },

  removeMember(teamId, userId) {
    return api.delete(`/api/teams/${teamId}/members/${userId}`).then((r) => r.data);
  },

  toggleStatus(id) {
    return api.post(`/api/teams/${id}/toggle`).then((r) => r.data);
  },

  getAvailableUsers() {
    return api.get('/api/users').then((r) => r.data);
  },
};

// ===== TEAM MONITORING SERVICE =====

import api from './api.js';

export const teamMonitoringService = {
  /** The whole monitor in one request, for every team or one. */
  getOverview(teamId) {
    return api.get('/api/team-monitoring/overview', { params: teamId ? { teamId } : {} }).then((r) => r.data);
  },

  nudgeAgent(agentId, reason) {
    return api.post(`/api/team-monitoring/nudge/${agentId}`, { reason }).then((r) => r.data);
  },
};

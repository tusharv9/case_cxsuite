// ===== TEAM MONITORING SERVICE =====

import api from './api.js';

export const teamMonitoringService = {
  getSummary() {
    return api.get('/api/team-monitoring/summary').then((r) => r.data);
  },

  getAgentBoard() {
    return api.get('/api/team-monitoring/agent-board').then((r) => r.data);
  },

  getQueueHealth() {
    return api.get('/api/team-monitoring/queue-health').then((r) => r.data);
  },

  getSlaAtRisk() {
    return api.get('/api/team-monitoring/sla-at-risk').then((r) => r.data);
  },

  nudgeAgent(agentId, reason) {
    return api.post(`/api/team-monitoring/nudge/${agentId}`, { reason }).then((r) => r.data);
  },
};

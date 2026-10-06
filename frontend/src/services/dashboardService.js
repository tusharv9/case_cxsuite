// ===== DASHBOARD SERVICE =====

import api from './api.js';

export const dashboardService = {
  /**
   * Every option the dashboard filter bar offers (teams, case types, statuses, priorities, SLA statuses, date ranges,
   * quick actions), in one request.
   */
  getFilters() {
    return api.get('/api/dashboard/filters').then((r) => r.data);
  },
};

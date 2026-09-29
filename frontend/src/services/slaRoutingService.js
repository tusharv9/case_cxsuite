// ===== CASES SLA & ROUTING SERVICE =====

import api from './api.js';

export const slaRoutingService = {
  /**
   * Fetch the complete configuration:
   * - PrioritySlaRules & Category Mappings
   * - Available Categories (with Department)
   * - Business Hours (7 Days)
   * - Public Holidays
   * - Escalation Levels
   * - Available Roles & Users
   */
  async getConfiguration() {
    const response = await api.get('/api/sla-routing/configuration');
    return response.data;
  },

  /**
   * Save entire SLA and Escalation configuration atomically
   */
  async updateConfiguration(payload) {
    const response = await api.put('/api/sla-routing/configuration', payload);
    return response.data;
  },

  /**
   * Create a new public holiday
   */
  async createHoliday(holidayDto) {
    const response = await api.post('/api/sla-routing/holidays', holidayDto);
    return response.data;
  },

  /**
   * Update an existing public holiday
   */
  async updateHoliday(id, holidayDto) {
    const response = await api.put(`/api/sla-routing/holidays/${id}`, holidayDto);
    return response.data;
  },

  /**
   * Delete a public holiday
   */
  async deleteHoliday(id) {
    const response = await api.delete(`/api/sla-routing/holidays/${id}`);
    return response.data;
  },

  /**
   * Fetch escalation status and next target for a case
   */
  async getCaseEscalationStatus(caseId) {
    const response = await api.get(`/api/sla-routing/cases/${caseId}/escalation-status`);
    return response.data;
  },
};

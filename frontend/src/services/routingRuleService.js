// ===== ROUTING RULES & CASE ASSIGNMENT ENGINE SERVICE =====

import api from './api.js';

export const routingRuleService = {
  /**
   * Get all routing rules ordered by evaluation sequence
   */
  async getRules() {
    const response = await api.get('/api/routing-rules');
    return response.data;
  },

  /**
   * Create a new routing rule
   */
  async createRule(payload) {
    const response = await api.post('/api/routing-rules', payload);
    return response.data;
  },

  /**
   * Update an existing routing rule
   */
  async updateRule(id, payload) {
    const response = await api.put(`/api/routing-rules/${id}`, payload);
    return response.data;
  },

  /**
   * Toggle active state of a routing rule
   */
  async toggleRule(id) {
    const response = await api.patch(`/api/routing-rules/${id}/toggle`);
    return response.data;
  },

  /**
   * Delete a routing rule
   */
  async deleteRule(id) {
    const response = await api.delete(`/api/routing-rules/${id}`);
    return response.data;
  },

  /**
   * Reorder rules by providing an ordered array of Rule IDs
   */
  async reorderRules(ruleIds) {
    const response = await api.put('/api/routing-rules/reorder', { ruleIds });
    return response.data;
  },

  /**
   * The assignment settings in force: global, or for one team (its own, or the global ones it follows).
   */
  async getAssignmentConfig(departmentId) {
    const response = await api.get('/api/routing-rules/assignment-config', { params: departmentId ? { departmentId } : {} });
    return response.data;
  },

  /**
   * Update the global assignment algorithm and capacity (or a team's own, when departmentId is given)
   */
  async updateAssignmentConfig(payload, departmentId) {
    const response = await api.put('/api/routing-rules/assignment-config', payload, { params: departmentId ? { departmentId } : {} });
    return response.data;
  },

  /**
   * What a rule can look at and the valid values for each (teams, sub-categories, case types, priorities, channels,
   * customer segments, algorithms). Editors use this instead of hard-coded lists.
   */
  async getVocabulary() {
    const response = await api.get('/api/routing-rules/vocabulary');
    return response.data;
  }
};

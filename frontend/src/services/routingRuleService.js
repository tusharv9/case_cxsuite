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
   * Get a single routing rule by ID
   */
  async getRuleById(id) {
    const response = await api.get(`/api/routing-rules/${id}`);
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
   * Get current assignment algorithm configuration
   */
  async getAssignmentConfig() {
    const response = await api.get('/api/routing-rules/assignment-config');
    return response.data;
  },

  /**
   * Update assignment algorithm and capacity
   */
  async updateAssignmentConfig(payload) {
    const response = await api.put('/api/routing-rules/assignment-config', payload);
    return response.data;
  }
};

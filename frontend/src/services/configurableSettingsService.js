// ===== CONFIGURABLE SETTINGS SERVICE =====

import api from './api.js';

let fieldsCache = {};
let lookupsCache = {};

export const configurableSettingsService = {
  /**
   * Get all field configurations for a module and optional section
   */
  async getFields(moduleKey = 'Customer360', sectionKey = null, forceRefresh = false) {
    const cacheKey = `${moduleKey}:${sectionKey || 'all'}`;
    if (!forceRefresh && fieldsCache[cacheKey]) {
      return fieldsCache[cacheKey];
    }
    let url = `/api/ConfigurableSettings/fields?moduleKey=${encodeURIComponent(moduleKey)}`;
    if (sectionKey) {
      url += `&sectionKey=${encodeURIComponent(sectionKey)}`;
    }
    const response = await api.get(url);
    fieldsCache[cacheKey] = response.data;
    return response.data;
  },

  /**
   * Batch update field configurations (Save Changes)
   */
  async saveFields(moduleKey, sectionKey, fields) {
    const payload = {
      moduleKey,
      sectionKey,
      fields,
    };
    const response = await api.put('/api/ConfigurableSettings/fields', payload);
    fieldsCache = {}; // invalidate cache
    return response.data;
  },

  /**
   * Add a new dynamic custom field definition
   */
  async addCustomField(fieldDto) {
    const response = await api.post('/api/ConfigurableSettings/fields', fieldDto);
    fieldsCache = {}; // invalidate cache
    return response.data;
  },

  /**
   * Edit a single field configuration (Edit drawer)
   */
  async updateField(id, fieldDto) {
    const response = await api.put(`/api/ConfigurableSettings/fields/${id}`, fieldDto);
    fieldsCache = {}; // invalidate cache
    return response.data;
  },

  /**
   * Delete a custom field definition
   */
  async deleteField(id) {
    const response = await api.delete(`/api/ConfigurableSettings/fields/${id}`);
    fieldsCache = {}; // invalidate cache
    return response.data;
  },

  /**
   * Get master lookup values by type code (e.g. PREFERRED_LANGUAGE, HOME_BRANCH, ID_TYPE)
   */
  async getLookupValues(typeCode, forceRefresh = false, activeOnly = true) {
    const cacheKey = `${typeCode}:${activeOnly}`;
    if (!forceRefresh && lookupsCache[cacheKey]) {
      return lookupsCache[cacheKey];
    }
    const response = await api.get(`/api/ConfigurableSettings/lookups/${encodeURIComponent(typeCode)}?activeOnly=${activeOnly}`);
    lookupsCache[cacheKey] = response.data;
    return response.data;
  },

  /**
   * Create a new lookup option (e.g. Tamil, Penang Branch)
   */
  async addLookupValue(typeCode, value, label = null, displayOrder = 0) {
    const payload = {
      typeCode,
      value,
      label: label || value,
      displayOrder,
    };
    const response = await api.post('/api/ConfigurableSettings/lookups', payload);
    lookupsCache = {}; // invalidate cache
    return response.data;
  },

  /**
   * Edit an existing lookup option
   */
  async updateLookupValue(id, typeCode, value, label = null, displayOrder = 0, isActive = true) {
    const payload = {
      value,
      label: label || value,
      displayOrder,
      isActive,
    };
    const response = await api.put(`/api/ConfigurableSettings/lookups/${id}`, payload);
    lookupsCache = {}; // invalidate cache
    return response.data;
  },

  /**
   * Delete a lookup option
   */
  async deleteLookupValue(id, typeCode) {
    const response = await api.delete(`/api/ConfigurableSettings/lookups/${id}`);
    lookupsCache = {}; // invalidate cache
    return response.data;
  },

  // ===== CASE MANAGEMENT CONFIGURATION APIS =====
  async getCaseTypes(activeOnly = false) {
    const response = await api.get(`/api/ConfigurableSettings/casetypes?activeOnly=${activeOnly}`);
    return response.data;
  },

  async addCaseType(code, name, prefix = 'C-', displayOrder = 1) {
    const payload = { code, name: name || code, prefix: prefix.toUpperCase(), displayOrder };
    const response = await api.post('/api/ConfigurableSettings/casetypes', payload);
    return response.data;
  },

  async updateCaseType(id, { code, name, prefix, displayOrder = 1, isActive = true }) {
    const payload = { code, name: name || code, prefix: (prefix || 'C-').toUpperCase(), displayOrder, isActive };
    const response = await api.put(`/api/ConfigurableSettings/casetypes/${id}`, payload);
    return response.data;
  },

  async deleteCaseType(id) {
    const response = await api.delete(`/api/ConfigurableSettings/casetypes/${id}`);
    return response.data;
  },

  async getSubCategories(departmentId = null, activeOnly = false) {
    let url = `/api/ConfigurableSettings/subcategories?activeOnly=${activeOnly}`;
    if (departmentId) url += `&departmentId=${encodeURIComponent(departmentId)}`;
    const response = await api.get(url);
    return response.data;
  },

  async addSubCategory(departmentId, name, code = null, displayOrder = 1) {
    const payload = { departmentId, name, code: code || name, displayOrder };
    const response = await api.post('/api/ConfigurableSettings/subcategories', payload);
    return response.data;
  },

  async updateSubCategory(id, { name, code = null, displayOrder = 1, isActive = true }) {
    const payload = { name, code: code || name, displayOrder, isActive };
    const response = await api.put(`/api/ConfigurableSettings/subcategories/${id}`, payload);
    return response.data;
  },

  async deleteSubCategory(id) {
    const response = await api.delete(`/api/ConfigurableSettings/subcategories/${id}`);
    return response.data;
  },

  async getSlaConfigurations() {
    const response = await api.get('/api/ConfigurableSettings/sla');
    return response.data;
  },

  async saveSlaConfiguration(severity, internalHours, externalHours, firstResponseMinutes) {
    const payload = {
      severity,
      internalHours: Number(internalHours),
      externalHours: Number(externalHours),
      firstResponseMinutes: firstResponseMinutes !== undefined ? Number(firstResponseMinutes) : 240,
    };
    const response = await api.post('/api/ConfigurableSettings/sla', payload);
    return response.data;
  },

  // ===== SEVERITY MASTER DATA =====
  // A severity carries its own SLA hours: the API writes the master value and the SLA row
  // together, so the two can never drift apart.
  async getSeverities() {
    const response = await api.get('/api/ConfigurableSettings/severities');
    return response.data;
  },

  async addSeverity(name, internalHours = 22, externalHours = 24, displayOrder = 0) {
    const payload = {
      name,
      internalHours: Number(internalHours),
      externalHours: Number(externalHours),
      displayOrder,
    };
    const response = await api.post('/api/ConfigurableSettings/severities', payload);
    return response.data;
  },

  async updateSeverity(id, nameOrDto, displayOrder = 0, isActive = true) {
    const payload = typeof nameOrDto === 'object' && nameOrDto !== null
      ? { name: nameOrDto.name, displayOrder: nameOrDto.displayOrder ?? 0, isActive: nameOrDto.isActive !== false }
      : { name: nameOrDto, displayOrder, isActive };
    const response = await api.put(`/api/ConfigurableSettings/severities/${id}`, payload);
    return response.data;
  },

  async deleteSeverity(id) {
    const response = await api.delete(`/api/ConfigurableSettings/severities/${id}`);
    return response.data;
  },

  async getEscalationTemplates(departmentId = null, reason = null) {
    let url = '/api/ConfigurableSettings/escalation-templates';
    const params = [];
    if (departmentId) params.push(`departmentId=${encodeURIComponent(departmentId)}`);
    if (reason) params.push(`reason=${encodeURIComponent(reason)}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    const response = await api.get(url);
    return response.data;
  },

  async saveEscalationTemplate(departmentId, reason, subjectTemplate, bodyTemplate) {
    const payload = {
      departmentId,
      escalationReason: reason,
      subjectTemplate: subjectTemplate || '',
      bodyTemplate: bodyTemplate || '',
    };
    const response = await api.post('/api/ConfigurableSettings/escalation-templates', payload);
    return response.data;
  },

  async deleteEscalationTemplate(id) {
    const response = await api.delete(`/api/ConfigurableSettings/escalation-templates/${id}`);
    return response.data;
  },

  // ===== NOTIFICATION RULES APIS =====
  async getNotificationRules() {
    const response = await api.get('/api/ConfigurableSettings/notification-rules');
    return response.data;
  },

  async updateNotificationRule(id, ruleDto) {
    const response = await api.put(`/api/ConfigurableSettings/notification-rules/${id}`, ruleDto);
    return response.data;
  },

  async toggleNotificationRule(id) {
    const response = await api.patch(`/api/ConfigurableSettings/notification-rules/${id}/toggle`);
    return response.data;
  },

  clearCache() {
    fieldsCache = {};
    lookupsCache = {};
  },
};

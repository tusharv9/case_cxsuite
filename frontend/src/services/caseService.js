// ===== CASE SERVICE =====

import api from './api.js';

export const caseService = {
  /**
   * Get all cases for the board, optionally filtered by departmentId and caseType.
   *
   * Note: there is no client-side cache here. A `boardCasesCache` variable used to exist
   * alongside `hasBoardCasesCache()` and `clearCache()`, but nothing ever wrote to it — the
   * cache was always empty, the "has cache" check always returned false, and every
   * `clearCache()` call was a no-op. They have been removed rather than left as misleading
   * scaffolding; every call below already hits the API.
   */
  getBoardCases(departmentId, caseType) {
    if (typeof caseType === 'boolean') {
      caseType = null;
    }

    const params = {};
    if (departmentId && departmentId !== 'all') params.departmentId = departmentId;
    if (caseType && caseType !== 'all' && typeof caseType === 'string') params.caseType = caseType;
    
    return api.get('/api/cases', { params }).then((r) => r.data);
  },

  /**
   * Get full case details including events, participants, linked cases
   */
  getCaseDetails(caseId) {
    return api.get(`/api/cases/${caseId}`).then((r) => r.data);
  },

  /**
   * Create a new case
   */
  createCase(dto) {
    return api.post('/api/cases', dto).then((r) => r.data);
  },

  /**
   * Assign / Reassign the owner of a case
   * dto: { ownerId: guid }
   */
  assignCase(caseId, dto) {
    return api.put(`/api/cases/${caseId}/assign`, dto).then((r) => r.data);
  },

  /**
   * Update case status (Resolve, Escalate, etc.)
   * dto: { status: string, note?: string }
   */
  updateCaseStatus(caseId, dto) {
    return api.put(`/api/cases/${caseId}/status`, dto).then((r) => r.data);
  },

  /**
   * Add a note to a case
   * dto: { message: string }
   */
  addNote(caseId, dto) {
    return api.post(`/api/cases/${caseId}/notes`, dto).then((r) => r.data);
  },

  /**
   * Add co-workers to a case
   * dto: { coworkerIds: guid[] }
   */
  addCoworkers(caseId, dto) {
    return api.post(`/api/cases/${caseId}/coworkers`, dto).then((r) => r.data);
  },

  /**
   * Remove a co-worker from a case
   */
  removeCoworker(caseId, coworkerId) {
    return api.delete(`/api/cases/${caseId}/coworkers/${coworkerId}`).then((r) => r.data);
  },

  /**
   * Transfer case to a new department
   * dto: { departmentId: guid }
   */
  transferDepartment(caseId, dto) {
    return api.put(`/api/cases/${caseId}/transfer`, dto).then((r) => r.data);
  },

  /**
   * Link the current case to another case
   * dto: { relationshipType: string, targetCaseNumber: string }
   */
  linkCase(caseId, dto) {
    return api.post(`/api/cases/${caseId}/link`, dto).then((r) => r.data);
  },

  /**
   * Unlink a case from another case
   * dto: { targetCaseNumber: string }
   */
  unlinkCase(caseId, dto) {
    return api.post(`/api/cases/${caseId}/unlink`, dto).then((r) => r.data);
  },

  /**
   * Resolve a case with a disposition and resolution note
   * dto: { disposition: string, resolutionNote: string }
   */
  resolveCase(caseId, dto) {
    return api.put(`/api/cases/${caseId}/resolve`, dto).then((r) => r.data);
  },

  /**
   * Reopen a resolved case
   * dto: { message: string }
   */
  reopenCase(caseId, dto) {
    return api.put(`/api/cases/${caseId}/reopen`, dto).then((r) => r.data);
  },

  /**
   * Get case audit trail logs
   */
  getAuditLogs(params = {}) {
    return api.get('/api/cases/audit', { params })
      .catch((err) => {
        if (err.response && err.response.status === 404) {
          return api.get('/api/audit', { params });
        }
        throw err;
      })
      .then((r) => r.data);
  },
};

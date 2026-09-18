// ===== DEPARTMENT SERVICE =====

import api from './api.js';

let departmentsCache = null;
// Request in flight, if any. Without this, two components mounting at the same time both miss
// the (not-yet-populated) cache and each fire their own identical request.
let departmentsRequest = null;

export const departmentService = {
  getAllDepartments(forceRefresh = false) {
    if (departmentsCache && !forceRefresh) {
      return Promise.resolve(departmentsCache);
    }
    if (departmentsRequest && !forceRefresh) {
      return departmentsRequest;
    }
    departmentsRequest = api
      .get('/api/departments')
      .then((r) => {
        departmentsCache = r.data;
        return departmentsCache;
      })
      .finally(() => {
        departmentsRequest = null;
      });
    return departmentsRequest;
  },

  /** Invalidate the in-memory cache (call after creating or editing a department) */
  invalidateCache() {
    departmentsCache = null;
  },

  createDepartment(dto) {
    return api.post('/api/departments', dto).then((r) => {
      departmentsCache = null; // invalidate after mutation
      return r.data;
    });
  },

  /** Rename a department (Configurable Settings -> Department Management) */
  updateDepartment(id, dto) {
    return api.put(`/api/departments/${id}`, dto).then((r) => {
      departmentsCache = null; // invalidate after mutation
      return r.data;
    });
  },

  /** Delete a department. The API refuses departments still referenced by cases or users. */
  deleteDepartment(id) {
    return api.delete(`/api/departments/${id}`).then((r) => {
      departmentsCache = null;
      return r.data;
    });
  },

  /**
   * Set or update the owner of a department
   * dto: { ownerId: guid }
   */
  setDepartmentOwner(id, dto) {
    return api.put(`/api/departments/${id}/owner`, dto).then((r) => {
      // Owner name is part of the cached department list, so it has to be dropped here too.
      // Previously only createDepartment invalidated, leaving the UI showing the previous owner
      // until a full reload.
      departmentsCache = null;
      return r.data;
    });
  },
};

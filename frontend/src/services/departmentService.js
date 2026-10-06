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

};

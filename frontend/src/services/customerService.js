// ===== CUSTOMER SERVICE =====

import api from './api.js';

let allCustomersCache = null;
// Request in flight, if any — see departmentService for why this matters.
let allCustomersRequest = null;
const customer360Cache = {};
const customer360Requests = {};

export const customerService = {
  hasCustomer360Cache(customerId) {
    return !!customer360Cache[customerId];
  },
  
  /**
   * Get all customers (for list / search)
   */
  getAllCustomers(forceRefresh = false) {
    if (!forceRefresh && allCustomersCache) {
      return Promise.resolve(allCustomersCache);
    }
    if (!forceRefresh && allCustomersRequest) {
      return allCustomersRequest;
    }
    allCustomersRequest = api
      .get('/api/customers')
      .then((r) => {
        allCustomersCache = r.data;
        return r.data;
      })
      .finally(() => {
        allCustomersRequest = null;
      });
    return allCustomersRequest;
  },

  /**
   * Get full Customer 360 profile
   */
  getCustomer360(customerId, forceRefresh = false) {
    if (!forceRefresh && customer360Cache[customerId]) {
      return Promise.resolve(customer360Cache[customerId]);
    }
    if (!forceRefresh && customer360Requests[customerId]) {
      return customer360Requests[customerId];
    }
    customer360Requests[customerId] = api
      .get(`/api/customers/${customerId}/360`)
      .then((r) => {
        customer360Cache[customerId] = r.data;
        return r.data;
      })
      .finally(() => {
        delete customer360Requests[customerId];
      });
    return customer360Requests[customerId];
  },

  clearCache() {
    allCustomersCache = null;
    allCustomersRequest = null;
    // We could clear customer360Cache as well if needed
    for (const key in customer360Cache) delete customer360Cache[key];
  },

  /**
   * Create a new customer
   */
  createCustomer(dto) {
    this.clearCache();
    return api.post('/api/customers', dto).then((r) => r.data);
  },

  /**
   * Search existing customer by ID, Phone, DOB
   */
  searchCustomer(dto) {
    return api.post('/api/customers/search', dto).then((r) => r.data);
  },
};

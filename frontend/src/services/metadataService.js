// ===== METADATA SERVICE =====
// One request per form: its field configuration plus the options of every list those fields use.
// (The Create Case drawer used to make eight, one of which downloaded the entire SLA configuration.)
// The server caches this and clears the cache when an administrator changes configuration, so no client-side
// caching is needed — and none can go stale.

import api from './api.js';

export const metadataService = {
  getCaseForm() {
    return api.get('/api/metadata/case-form').then((r) => r.data);
  },

  getCustomerForm() {
    return api.get('/api/metadata/customer-form').then((r) => r.data);
  },
};

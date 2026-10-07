// ===== METADATA SERVICE =====
// One request per form: its field configuration plus the options of every list those fields use.
// (The Create Case drawer used to make eight, one of which downloaded the entire SLA configuration.)
// The server caches this and clears the cache when an administrator changes configuration, so no client-side
// caching is needed — and none can go stale.

import api from './api.js';

let countriesPromise = null;
let fieldTypesPromise = null;

export const metadataService = {
  /** Countries for phone numbers. Reference data that changes rarely: fetched once per page load. */
  getCountries() {
    if (!countriesPromise) {
      countriesPromise = api.get('/api/metadata/countries').then((r) => r.data).catch((err) => {
        countriesPromise = null;   // let the next attempt retry
        throw err;
      });
    }
    return countriesPromise;
  },

  /** What each field type lets an administrator configure (length, pattern, range, lookup, masking). */
  getFieldTypes() {
    if (!fieldTypesPromise) {
      fieldTypesPromise = api.get('/api/metadata/field-types').then((r) => r.data).catch((err) => {
        fieldTypesPromise = null;
        throw err;
      });
    }
    return fieldTypesPromise;
  },

  getCaseForm() {
    return api.get('/api/metadata/case-form').then((r) => r.data);
  },

  getCustomerForm() {
    return api.get('/api/metadata/customer-form').then((r) => r.data);
  },
};

// ===== GLOBAL SEARCH SERVICE =====

import api from './api.js';

export const searchService = {
  /**
   * Global "smart search" across customers and cases.
   *
   * The backend does the matching and returns only the fields the suggestion dropdown
   * renders, so a keystroke costs a few hundred bytes rather than the whole customer and
   * case tables.
   *
   * @param {string} query    Search term.
   * @param {Object} [opts]
   * @param {AbortSignal} [opts.signal] Aborts the request when a newer keystroke supersedes it.
   * @param {number} [opts.limit]       Max hits per group; the server clamps this.
   * @returns {Promise<{customers: Array, cases: Array}>}
   */
  search(query, { signal, limit } = {}) {
    const params = { q: query };
    if (limit) params.limit = limit;

    return api
      .get('/api/search', { params, signal })
      .then((r) => ({
        customers: r.data?.customers || [],
        cases: r.data?.cases || [],
      }));
  },
};

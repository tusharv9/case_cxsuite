// ===== SKILLS SERVICE =====
// Which skills a case needs (rules) and which skills each agent has — used by skill-based assignment.

import api from './api.js';

export const skillService = {
  /** { rules, matchFields, matchTypes, knownSkills } */
  getRules() {
    return api.get('/api/skills/rules').then((r) => r.data);
  },

  replaceRules(rules) {
    return api.put('/api/skills/rules', rules).then((r) => r.data);
  },

  getAgentSkills(userId) {
    return api.get(`/api/skills/agents/${userId}`).then((r) => r.data);
  },

  replaceAgentSkills(userId, skills) {
    return api.put(`/api/skills/agents/${userId}`, skills).then((r) => r.data);
  },
};

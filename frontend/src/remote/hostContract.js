// ===== HOST ↔ REMOTE CONTRACT =====
// Case Management is a Module Federation *Remote*. The Host App owns login, tokens, users and
// roles; this Remote only consumes what the Host hands it. This file is the single place that
// describes what the Host may pass in, so the other team has one reference and the Remote has
// one place to change if that contract evolves.
//
// Every prop is OPTIONAL. When the Remote runs standalone (no Host) it falls back to the
// defaults below, which keeps local development working.
//
// @typedef {Object} HostUser
// @property {string}   id           Opaque, Host-owned user identifier (string: may be GUID/int/etc.)
// @property {string}   name
// @property {string}   [email]
// @property {string[]} [roles]
//
// @typedef {Object} CaseManagementHostProps
// @property {string}   [basename]         Route prefix the Host mounts the Remote under, e.g. "/case-management".
// @property {() => (string|Promise<string>)} [getAccessToken]  Returns the current bearer token (called per request).
// @property {HostUser} [currentUser]      The signed-in Host user.
// @property {string[]} [permissions]      Permission keys granted to the current user.
// @property {string}   [apiBaseUrl]       Overrides the backend base URL.
// @property {string}   [locale]           e.g. "en-MY".
// @property {string}   [timezone]         IANA zone, e.g. "Asia/Kuala_Lumpur".
// @property {(path: string) => void} [onNavigate]  Lets the Host observe/handle navigation requests.
// @property {() => void} [onUnauthorized]  Called when the backend rejects the Host token (401), so the Host can refresh it or sign the user out.

/** Values used when no Host is present (standalone / local development). */
export const STANDALONE_DEFAULTS = Object.freeze({
  basename: '',
  getAccessToken: null,
  currentUser: null,
  permissions: [],
  apiBaseUrl: undefined,
  locale: 'en-MY',
  timezone: undefined,
  onNavigate: null,
  onUnauthorized: null,
});

/** Merges whatever the Host passed over the standalone defaults, ignoring unknown props. */
export function resolveHostProps(props = {}) {
  const resolved = { ...STANDALONE_DEFAULTS };
  for (const key of Object.keys(STANDALONE_DEFAULTS)) {
    if (props[key] !== undefined && props[key] !== null) resolved[key] = props[key];
  }
  return Object.freeze(resolved);
}

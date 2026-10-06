// ===== HOST BRIDGE (non-React) =====
// The place where "who is the user and how do we prove it" lives for non-React code such as the
// axios client. App.jsx hands it whatever the Host App passed in (src/remote/hostContract.js).
//
//   Host-managed  (Host passed getAccessToken): requests carry `Authorization: Bearer <token>`.
//                 Case Management stores no identity of its own.
//   Standalone    (no Host): a development user picked in the dev picker is sent as `X-User-Id`.
//                 The backend refuses this mode outside development unless explicitly allowed.

import { API_BASE_URL, LOGGED_IN_USER_ID_KEY } from '../constants/index.js';

let host = { getAccessToken: null, onUnauthorized: null, apiBaseUrl: undefined };

/** Called by App with the resolved Host props. Safe to call repeatedly (props can be updated). */
export function configureHost(resolved) {
  host = {
    getAccessToken: typeof resolved?.getAccessToken === 'function' ? resolved.getAccessToken : null,
    onUnauthorized: typeof resolved?.onUnauthorized === 'function' ? resolved.onUnauthorized : null,
    apiBaseUrl: resolved?.apiBaseUrl,
  };
}

export function isHostManaged() {
  return host.getAccessToken !== null;
}

export function getApiBaseUrl() {
  return host.apiBaseUrl ?? API_BASE_URL;
}

// Browser storage can be unavailable (private mode, embedded contexts); identity must still work.
export function getStandaloneUserId() {
  try { return localStorage.getItem(LOGGED_IN_USER_ID_KEY); } catch { return null; }
}
export function setStandaloneUserId(id) {
  try { id ? localStorage.setItem(LOGGED_IN_USER_ID_KEY, id) : localStorage.removeItem(LOGGED_IN_USER_ID_KEY); } catch { /* ignore */ }
}

/** Headers that identify the caller to the backend. Never throws. */
export async function getAuthHeaders() {
  if (isHostManaged()) {
    const token = await host.getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  const id = getStandaloneUserId();
  return id ? { 'X-User-Id': id } : {};
}

/** The backend rejected our credentials. Tell the Host (it owns the session) and the UI. */
export function notifyUnauthorized() {
  try { host.onUnauthorized?.(); } catch (e) { console.error('Host onUnauthorized handler failed', e); }
  window.dispatchEvent(new CustomEvent('cm:unauthorized'));
}

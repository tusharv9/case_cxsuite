// ===== STANDALONE SESSION =====
// When Case Management runs as its own site (no Host App around it), the person signs in with the SAME
// OmniConnect account they use in the Host. We call the Host's AuthService directly, so the backend receives
// exactly the kind of token it gets inside the Host and there is one identity, one set of users.
//
//   - The access token lives in memory only (like the Host does); it is never written to storage.
//   - The refresh token is AuthService's httpOnly cookie. A reload restores the session through it, which needs
//     AuthService to list this site in its CORS origins (with credentials) and a SameSite=None cookie.
//
// Not used inside a Host App: there the Host passes getAccessToken and owns the session.

import { AUTH_SERVICE_URL } from '../constants/index.js';

const REFRESH_MARGIN_MS = 60_000;   // renew a minute before expiry so no request goes out with a dying token

let session = null;          // { token, expiresAt (ms), user }
let refreshing = null;       // one refresh at a time, shared by every caller

export function isStandaloneSignInConfigured() {
  return Boolean(AUTH_SERVICE_URL);
}

export function hasStandaloneSession() {
  return session !== null;
}

async function call(path, body) {
  let response;
  try {
    response = await fetch(`${AUTH_SERVICE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',   // the refresh cookie
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    const error = new Error('Cannot reach the sign-in service. Check your connection and try again.');
    error.network = true;
    throw error;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.title || data?.error || 'Sign-in failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function remember(data) {
  if (!data?.accessToken) throw new Error('The sign-in service did not return a token.');
  const expiresAt = Date.parse(data.expiresAt);
  session = {
    token: data.accessToken,
    expiresAt: Number.isFinite(expiresAt) ? expiresAt : Date.now() + 5 * 60_000,
    user: data.user ?? null,
  };
}

/** Email + password against AuthService. Throws with a message a person can act on. */
export async function signIn(email, password) {
  try {
    remember(await call('/api/auth/login', { email, password }));
  } catch (error) {
    if (error.status === 401) error.message = 'Incorrect email or password.';
    throw error;
  }
}

/** Renews the access token from the refresh cookie. Resolves false when there is no session to renew. Never rejects. */
export function restoreSession() {
  if (!isStandaloneSignInConfigured()) return Promise.resolve(false);
  if (!refreshing) {
    refreshing = call('/api/auth/refresh')
      .then((data) => { remember(data); return true; })
      // No session, or AuthService unreachable: either way the sign-in screen shows, and signing in there
      // reports an unreachable service itself (the demo picker, if offered, still works meanwhile).
      .catch(() => { session = null; return false; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

/** A token good for at least another minute, or null when signed out. */
export async function getStandaloneToken() {
  if (!session) return null;
  if (session.expiresAt - Date.now() < REFRESH_MARGIN_MS) {
    const renewed = await restoreSession();
    if (!renewed) return null;
  }
  return session?.token ?? null;
}

/** Ends the session here and at AuthService (clears the refresh cookie). Never throws. */
export async function signOut() {
  session = null;
  if (!isStandaloneSignInConfigured()) return;
  try { await call('/api/auth/logout'); } catch { /* already signed out locally */ }
}

/** The backend refused the token: forget it so the sign-in screen shows. */
export function clearStandaloneSession() {
  session = null;
}

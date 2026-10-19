import { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { userService } from '../services/userService.js';
import {
  getApiBaseUrl,
  isHostManaged,
  getStandaloneUserId,
  setStandaloneUserId,
} from '../services/hostBridge.js';
import {
  isStandaloneSignInConfigured,
  hasStandaloneSession,
  restoreSession,
  signIn as signInToAuthService,
  signOut as signOutOfAuthService,
  clearStandaloneSession,
} from '../services/standaloneSession.js';

// How long to wait for the backend to finish starting (migrations, cold database) before giving up.
const BACKEND_READY_TIMEOUT_MS = 150_000;

// --- State Shape ---
const initialState = {
  // Startup/identity gate: connecting → identifying → ready | error, or signin (standalone site, nobody signed in yet)
  bootstrap: { phase: 'connecting', message: 'Connecting to the server…', error: null, elapsedMs: 0 },
  // Standalone only: which ways of signing in this deployment offers (see loadSignInOptions).
  signInOptions: null,
  currentUser: null,
  permissions: [],
  users: [],
  toasts: [],
  isLoadingUser: true,
  isSidebarOpen: true,
};

// --- Reducer ---
function appReducer(state, action) {
  switch (action.type) {
    case 'BOOTSTRAP':
      return { ...state, bootstrap: { ...state.bootstrap, ...action.payload } };
    case 'SET_IDENTITY':
      return {
        ...state,
        currentUser: action.payload.user,
        permissions: action.payload.permissions || [],
        isLoadingUser: false,
        bootstrap: { phase: 'ready', message: '', error: null, elapsedMs: state.bootstrap.elapsedMs },
      };
    case 'SET_SIGN_IN_OPTIONS':
      return { ...state, signInOptions: action.payload };
    case 'SIGNED_OUT':
      return {
        ...state,
        currentUser: null,
        permissions: [],
        users: [],
        isLoadingUser: false,
        bootstrap: { phase: 'signin', message: '', error: action.payload || null, elapsedMs: 0 },
      };
    case 'SET_USERS':
      return { ...state, users: action.payload };
    case 'SET_CURRENT_USER':
      return { ...state, currentUser: action.payload, isLoadingUser: false };
    case 'SET_LOADING_USER':
      return { ...state, isLoadingUser: action.payload };
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.payload] };
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.payload) };
    case 'SET_SIDEBAR_OPEN':
      return { ...state, isSidebarOpen: action.payload };
    default:
      return state;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Waits until the backend reports it is ready (database migrated and seeded). Until then API calls
 * would fail with 503, which previously showed up as an empty dashboard on first load.
 * A backend without /ready (404) is treated as ready, so older deployments keep working.
 */
async function waitForBackend(isCancelled, onProgress) {
  const started = Date.now();
  let attempt = 0;

  while (!isCancelled()) {
    attempt += 1;
    try {
      const response = await fetch(`${getApiBaseUrl()}/ready`, { cache: 'no-store' });
      if (response.ok || response.status === 404) return;
      const body = await response.json().catch(() => null);
      onProgress(body?.message || 'The server is starting up…', Date.now() - started);
      if (body?.status === 'Failed' || body?.status === 'MigrationRequired') {
        throw new Error(body.message || 'The server could not start.');
      }
    } catch (error) {
      if (error.message && !(error instanceof TypeError)) throw error;     // a definitive failure from /ready
      onProgress('Waiting for the server to respond…', Date.now() - started);   // network error: keep trying
    }

    if (Date.now() - started > BACKEND_READY_TIMEOUT_MS) {
      throw new Error('The server is taking too long to start. Please try again in a moment.');
    }
    await sleep(Math.min(3000, 500 + attempt * 500));
  }
}

/**
 * Standalone only: how this deployment lets someone sign in.
 *   account   — OmniConnect email + password (needs VITE_AUTH_SERVICE_URL and a backend that accepts Host tokens)
 *   demoUsers — pick a user without a password (only where the backend allows the development header)
 * A backend from before /api/session/options (404) only knew the development header.
 */
async function loadSignInOptions() {
  let backend = { hostTokens: false, demoUsers: true };
  const response = await fetch(`${getApiBaseUrl()}/api/session/options`, { cache: 'no-store' });
  if (response.ok) backend = await response.json();
  else if (response.status !== 404) throw new Error('Could not load the sign-in options. Please try again.');

  return {
    account: isStandaloneSignInConfigured() && Boolean(backend.hostTokens),
    demoUsers: Boolean(backend.demoUsers),
  };
}

/**
 * Standalone only: is there an identity to try? Restores an account session from AuthService's refresh cookie,
 * or uses the demo user remembered from last time. False means "show the sign-in screen".
 */
async function hasStandaloneIdentity(options) {
  if (options.account && !hasStandaloneSession() && await restoreSession()) return true;
  if (hasStandaloneSession()) return true;
  return options.demoUsers && Boolean(getStandaloneUserId());
}

/** Standalone: forget whoever was signed in here (account session and demo user). */
function forgetStandaloneIdentity() {
  clearStandaloneSession();
  setStandaloneUserId(null);
}

// --- Context ---
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [attempt, setAttempt] = useRetryCounter();
  const identified = useRef(false);

  // Startup gate + identity. Nothing else in the app fetches until this reaches "ready".
  useEffect(() => {
    let cancelled = false;
    identified.current = false;
    dispatch({ type: 'BOOTSTRAP', payload: { phase: 'connecting', message: 'Connecting to the server…', error: null } });

    (async () => {
      try {
        await waitForBackend(
          () => cancelled,
          (message, elapsedMs) => !cancelled && dispatch({ type: 'BOOTSTRAP', payload: { message, elapsedMs } })
        );
        if (cancelled) return;

        dispatch({ type: 'BOOTSTRAP', payload: { phase: 'identifying', message: 'Signing you in…' } });

        if (!isHostManaged()) {
          const options = await loadSignInOptions();
          if (cancelled) return;
          dispatch({ type: 'SET_SIGN_IN_OPTIONS', payload: options });
          if (!(await hasStandaloneIdentity(options))) {
            if (!cancelled) dispatch({ type: 'SIGNED_OUT' });
            return;
          }
          if (cancelled) return;
        }

        const me = await userService.getMe();
        if (cancelled) return;

        identified.current = true;
        dispatch({ type: 'SET_IDENTITY', payload: { user: me.user, permissions: me.permissions } });

        // Secondary data: failures here must not block the app.
        userService.getAllUsers().then((users) => !cancelled && dispatch({ type: 'SET_USERS', payload: users })).catch(() => {});
        // (SLA state — holidays, working hours, pauses — is computed by the server and arrives on each case.)
      } catch (error) {
        if (cancelled) return;
        // Standalone: a refused identity (expired session, removed or deactivated user) means "sign in again",
        // not a dead end. This is what used to leave a stale demo user stuck on "does not have access".
        if (!isHostManaged() && (error?.status === 401 || error?.status === 403)) {
          forgetStandaloneIdentity();
          dispatch({ type: 'SIGNED_OUT', payload: friendlyBootstrapError(error) });
          return;
        }
        dispatch({
          type: 'BOOTSTRAP',
          payload: { phase: 'error', error: friendlyBootstrapError(error), message: '' },
        });
      }
    })();

    return () => { cancelled = true; };
  }, [attempt]);

  // The backend rejected our credentials after sign-in (expired Host token, deactivated user…).
  useEffect(() => {
    const onUnauthorized = () => {
      if (!identified.current) return;
      identified.current = false;
      if (!isHostManaged()) {
        forgetStandaloneIdentity();
        dispatch({ type: 'SIGNED_OUT', payload: 'Your session has expired. Please sign in again.' });
        return;
      }
      dispatch({
        type: 'BOOTSTRAP',
        payload: { phase: 'error', error: 'Your session has expired or is no longer valid. Please sign in again.', message: '' },
      });
    };
    window.addEventListener('cm:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cm:unauthorized', onUnauthorized);
  }, []);

  const addToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    dispatch({ type: 'ADD_TOAST', payload: { id, message, type, duration } });
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    dispatch({ type: 'REMOVE_TOAST', payload: id });
  }, []);

  /** True when the signed-in user holds `permission` (the server enforces this too; this only shapes the UI). */
  const can = useCallback(
    (permission) => !permission || state.permissions.includes('*') || state.permissions.includes(permission),
    [state.permissions]
  );

  // Standalone sign-in. Each starts the startup sequence again, which identifies the new person.
  const signInWithAccount = useCallback(async (email, password) => {
    setStandaloneUserId(null);
    await signInToAuthService(email, password);
    setAttempt();
  }, [setAttempt]);

  const signInAsDemoUser = useCallback((externalUserId) => {
    clearStandaloneSession();
    setStandaloneUserId(externalUserId);
    setAttempt();
  }, [setAttempt]);

  const signOut = useCallback(async () => {
    identified.current = false;
    setStandaloneUserId(null);
    await signOutOfAuthService();
    dispatch({ type: 'SIGNED_OUT' });
  }, []);

  const value = {
    ...state,
    can,
    isStandalone: !isHostManaged(),
    signInWithAccount,
    signInAsDemoUser,
    signOut,
    retryBootstrap: setAttempt,
    addToast,
    removeToast,
    dispatch,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function useRetryCounter() {
  const [count, setCount] = useReducer((c) => c + 1, 0);
  return [count, setCount];
}

function friendlyBootstrapError(error) {
  if (error?.status === 401) return 'You are not signed in, or your session is no longer valid.';
  if (error?.status === 403) return error?.message && !/permission to do that/i.test(error.message)
    ? error.message
    : 'Your account does not have access to Case Management.';
  return error?.message || 'Could not connect to the server.';
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

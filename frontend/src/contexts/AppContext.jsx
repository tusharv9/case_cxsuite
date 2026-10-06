import { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { userService } from '../services/userService.js';
import { slaRoutingService } from '../services/slaRoutingService.js';
import { checkIsPublicHolidayToday, checkIsBusinessHoursActive } from '../utils/slaUtils.js';
import {
  getApiBaseUrl,
  isHostManaged,
  getStandaloneUserId,
  setStandaloneUserId,
} from '../services/hostBridge.js';

// How long to wait for the backend to finish starting (migrations, cold database) before giving up.
const BACKEND_READY_TIMEOUT_MS = 150_000;

// --- State Shape ---
const initialState = {
  // Startup/identity gate: connecting → identifying → ready | error
  bootstrap: { phase: 'connecting', message: 'Connecting to the server…', error: null, elapsedMs: 0 },
  currentUser: null,
  permissions: [],
  users: [],
  toasts: [],
  isLoadingUser: true,
  isSidebarOpen: true,
  publicHolidays: [],
  isHolidayToday: false,
  todayHolidayName: null,
  businessHours: [],
  isBusinessHoursActive: true,
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
    case 'SET_USERS':
      return { ...state, users: action.payload };
    case 'SET_CURRENT_USER':
      return { ...state, currentUser: action.payload, isLoadingUser: false };
    case 'SET_LOADING_USER':
      return { ...state, isLoadingUser: action.payload };
    case 'SET_PUBLIC_HOLIDAYS': {
      const holidays = action.payload || [];
      const { isHoliday, holidayName } = checkIsPublicHolidayToday(holidays);
      return {
        ...state,
        publicHolidays: holidays,
        isHolidayToday: isHoliday,
        todayHolidayName: holidayName,
      };
    }
    case 'SET_BUSINESS_HOURS': {
      const hours = action.payload || [];
      const isActive = checkIsBusinessHoursActive(hours);
      return {
        ...state,
        businessHours: hours,
        isBusinessHoursActive: isActive,
      };
    }
    case 'EVALUATE_BUSINESS_HOURS': {
      const isActive = checkIsBusinessHoursActive(state.businessHours);
      if (isActive === state.isBusinessHoursActive) return state;
      return { ...state, isBusinessHoursActive: isActive };
    }
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

/** Resolves who the caller is. Standalone mode first has to choose a development user. */
async function identify() {
  if (!isHostManaged() && !getStandaloneUserId()) {
    const users = await userService.getAllUsers();
    if (!users?.length) throw new Error('No users exist yet. Seed the database or connect the Host App.');
    setStandaloneUserId(users[0].id);
  }

  try {
    return await userService.getMe();
  } catch (error) {
    // A remembered development user that no longer exists: pick again once.
    if (!isHostManaged() && error.status === 401) {
      setStandaloneUserId(null);
      const users = await userService.getAllUsers();
      if (!users?.length) throw error;
      setStandaloneUserId(users[0].id);
      return userService.getMe();
    }
    throw error;
  }
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
        const me = await identify();
        if (cancelled) return;

        identified.current = true;
        dispatch({ type: 'SET_IDENTITY', payload: { user: me.user, permissions: me.permissions } });

        // Secondary data: failures here must not block the app.
        userService.getAllUsers().then((users) => !cancelled && dispatch({ type: 'SET_USERS', payload: users })).catch(() => {});
        slaRoutingService.getConfiguration()
          .then((cfg) => {
            if (cancelled) return;
            if (cfg?.publicHolidays) dispatch({ type: 'SET_PUBLIC_HOLIDAYS', payload: cfg.publicHolidays });
            if (cfg?.businessHours) dispatch({ type: 'SET_BUSINESS_HOURS', payload: cfg.businessHours });
          })
          .catch(() => {});
      } catch (error) {
        if (cancelled) return;
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
      if (!identified.current || !isHostManaged()) return;
      identified.current = false;
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

  const value = {
    ...state,
    can,
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
  if (error?.status === 403) return 'Your account does not have access to Case Management.';
  return error?.message || 'Could not connect to the server.';
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

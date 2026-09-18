// ===== APP CONTEXT =====
// Global context: logged-in user, toast notifications

import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { userService } from '../services/userService.js';
import { LOGGED_IN_USER_ID_KEY, DEFAULT_USER_ID } from '../constants/index.js';

// Bootstrap: ensure localStorage always has a valid X-User-Id before first fetch
if (!localStorage.getItem(LOGGED_IN_USER_ID_KEY)) {
  localStorage.setItem(LOGGED_IN_USER_ID_KEY, DEFAULT_USER_ID);
}

// --- State Shape ---
const initialState = {
  currentUser: null,
  users: [],
  toasts: [],
  isLoadingUser: true,
  isAIOpen: false,
  isSidebarOpen: true,
};

// --- Reducer ---
function appReducer(state, action) {
  switch (action.type) {
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
    case 'SET_AI_OPEN':
      return { ...state, isAIOpen: action.payload };
    case 'SET_SIDEBAR_OPEN':
      return { ...state, isSidebarOpen: action.payload };
    default:
      return state;
  }
}

// --- Context ---
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Load users and set current user from localStorage
  useEffect(() => {
    userService.getAllUsers()
      .then((users) => {
        dispatch({ type: 'SET_USERS', payload: users });

        const storedId = localStorage.getItem(LOGGED_IN_USER_ID_KEY);
        const found = storedId ? users.find((u) => u.id === storedId) : null;
        const currentUser = found || users[0] || null;

        if (currentUser) {
          localStorage.setItem(LOGGED_IN_USER_ID_KEY, currentUser.id);
        }
        dispatch({ type: 'SET_CURRENT_USER', payload: currentUser });
      })
      .catch(() => {
        dispatch({ type: 'SET_LOADING_USER', payload: false });
      });
  }, []);

  const addToast = useCallback((message, type = 'success', duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    dispatch({ type: 'ADD_TOAST', payload: { id, message, type, duration } });
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    dispatch({ type: 'REMOVE_TOAST', payload: id });
  }, []);

  const value = {
    ...state,
    addToast,
    removeToast,
    dispatch,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

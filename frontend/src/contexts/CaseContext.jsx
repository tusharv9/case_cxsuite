// ===== CASE CONTEXT =====
// Board state, selected case, department filter

import { createContext, useContext, useReducer, useCallback } from 'react';

const initialState = {
  boardCases: [],
  selectedCase: null,
  isLoadingBoard: false,
  isLoadingCase: false,
  boardError: null,
  selectedDeptId: null, // null = All
  searchQuery: '',
};

function caseReducer(state, action) {
  switch (action.type) {
    case 'SET_BOARD_LOADING':
      return { ...state, isLoadingBoard: action.payload };
    case 'SET_CASE_LOADING':
      return { ...state, isLoadingCase: action.payload };
    case 'SET_BOARD_CASES':
      return { ...state, boardCases: action.payload, boardError: null, isLoadingBoard: false };
    case 'SET_BOARD_ERROR':
      return { ...state, boardError: action.payload, isLoadingBoard: false };
    case 'SET_SELECTED_CASE':
      return { ...state, selectedCase: action.payload, isLoadingCase: false };
    case 'UPDATE_SELECTED_CASE':
      return {
        ...state,
        selectedCase: state.selectedCase?.id === action.payload.id
          ? action.payload
          : state.selectedCase,
        boardCases: state.boardCases.map((c) =>
          c.id === action.payload.id ? { ...c, ...action.payload } : c
        ),
      };
    case 'SET_SELECTED_DEPT':
      return { ...state, selectedDeptId: action.payload };
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };
    case 'CLOSE_DRAWER':
      return { ...state, selectedCase: null };
    default:
      return state;
  }
}

const CaseContext = createContext(null);

export function CaseProvider({ children }) {
  const [state, dispatch] = useReducer(caseReducer, initialState);

  const closeDrawer = useCallback(() => {
    dispatch({ type: 'CLOSE_DRAWER' });
  }, []);

  const value = { ...state, dispatch, closeDrawer };

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>;
}

export function useCase() {
  const ctx = useContext(CaseContext);
  if (!ctx) throw new Error('useCase must be used within CaseProvider');
  return ctx;
}

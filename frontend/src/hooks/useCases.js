// ===== useCases HOOK =====

import { useCallback, useEffect } from 'react';
import { caseService } from '../services/caseService.js';
import { useCase } from '../contexts/CaseContext.jsx';
import { useApp } from '../contexts/AppContext.jsx';

export function useCases() {
  const { selectedDeptId, dispatch } = useCase();
  const { addToast } = useApp();

  const loadBoard = useCallback(
    (deptId) => {
      dispatch({ type: 'SET_BOARD_LOADING', payload: true });
      caseService
        .getBoardCases(deptId || null)
        .then((cases) => dispatch({ type: 'SET_BOARD_CASES', payload: cases }))
        .catch((err) => dispatch({ type: 'SET_BOARD_ERROR', payload: err.message }));
    },
    [dispatch]
  );

  useEffect(() => {
    loadBoard(selectedDeptId);
  }, [selectedDeptId, loadBoard]);

  const loadCaseDetails = useCallback(
    async (caseId) => {
      dispatch({ type: 'SET_CASE_LOADING', payload: true });
      try {
        const data = await caseService.getCaseDetails(caseId);
        dispatch({ type: 'SET_SELECTED_CASE', payload: data });
      } catch (err) {
        addToast(err.message, 'error');
        dispatch({ type: 'SET_CASE_LOADING', payload: false });
      }
    },
    [dispatch, addToast]
  );

  const refreshBoard = useCallback(() => {
    loadBoard(selectedDeptId);
  }, [selectedDeptId, loadBoard]);

  const refreshSelectedCase = useCallback(
    async (caseId) => {
      if (!caseId) return;
      try {
        const data = await caseService.getCaseDetails(caseId);
        dispatch({ type: 'SET_SELECTED_CASE', payload: data });
      } catch {
        // silently ignore refresh failures
      }
    },
    [dispatch]
  );

  return { loadBoard, loadCaseDetails, refreshBoard, refreshSelectedCase };
}

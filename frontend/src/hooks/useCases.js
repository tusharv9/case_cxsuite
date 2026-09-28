// ===== useCases HOOK =====
//
// Case Management no longer downloads every case into the browser. The List View and the
// Board page their data from the server (useCaseListPage / useInfiniteColumnCases); this hook
// only loads the header counts (open / SLA breached), opens case details and broadcasts
// refreshes so every paged view reloads itself.

import { useCallback, useEffect } from 'react';
import { caseService } from '../services/caseService.js';
import { useCase } from '../contexts/CaseContext.jsx';
import { useApp } from '../contexts/AppContext.jsx';

export function useCases({ autoLoadStats = false } = {}) {
  const { selectedDeptId, dispatch } = useCase();
  const { addToast } = useApp();

  const loadStats = useCallback(
    (deptId) =>
      caseService
        .getCaseStats(deptId || null)
        .then((stats) => dispatch({ type: 'SET_CASE_STATS', payload: stats }))
        .catch(() => {
          // Header counts are informational; a failure must not block the page.
        }),
    [dispatch]
  );

  useEffect(() => {
    if (autoLoadStats) loadStats(selectedDeptId);
  }, [autoLoadStats, selectedDeptId, loadStats]);

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

  // Tells every paged view (List page, Board columns) to reload, and refreshes the counts.
  const refreshBoard = useCallback(() => {
    dispatch({ type: 'REFRESH_BOARD' });
    loadStats(selectedDeptId);
  }, [selectedDeptId, loadStats, dispatch]);

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

  return { loadStats, loadCaseDetails, refreshBoard, refreshSelectedCase };
}

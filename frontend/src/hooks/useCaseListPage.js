// ===== useCaseListPage HOOK =====
// Server-side (database-level) pagination for the Case Management List View.
// Only the requested page is fetched: GET /api/cases?page=&pageSize=&status=&priority=&channel=&search=

import { useState, useEffect, useRef, useCallback } from 'react';
import { caseService } from '../services/caseService.js';
import { useCase } from '../contexts/CaseContext.jsx';

export function useCaseListPage({
  page,
  pageSize,
  departmentId,
  search = '',
  status = 'all',
  priority = 'all',
  channel = 'all',
  enabled = true,
}) {
  const { boardRefreshKey, lastStatusChange } = useCase();

  const [items, setItems] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const fetchPage = useCallback(async () => {
    if (!enabled) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    try {
      const res = await caseService.getPaginatedBoardCases({
        page,
        pageSize,
        departmentId,
        search,
        status,
        priority,
        channel,
        signal: controller.signal,
      });
      setItems(res.items || []);
      setTotalCount(res.totalCount ?? 0);
      setTotalPages(res.totalPages ?? Math.ceil((res.totalCount ?? 0) / pageSize));
      setIsLoading(false);
    } catch (err) {
      if (err?.original?.name === 'CanceledError' || err?.name === 'CanceledError' || err?.name === 'AbortError') {
        return; // superseded by a newer request
      }
      setError(err.message || 'Failed to load cases');
      setIsLoading(false);
    }
  }, [enabled, page, pageSize, departmentId, search, status, priority, channel]);

  useEffect(() => {
    fetchPage();
    return () => abortRef.current?.abort();
  }, [fetchPage, boardRefreshKey, lastStatusChange]);

  return { items, totalCount, totalPages, isLoading, error, refresh: fetchPage };
}

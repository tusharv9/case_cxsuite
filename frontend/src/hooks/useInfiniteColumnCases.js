// ===== useInfiniteColumnCases HOOK =====
// Independent column-level pagination and infinite loading for Kanban columns

import { useState, useEffect, useRef, useCallback } from 'react';
import { caseService } from '../services/caseService.js';
import { useCase } from '../contexts/CaseContext.jsx';

/**
 * Normalizes status strings for safe comparison across formats (e.g. 'Waiting on Customer' vs 'WaitingOnCustomer')
 */
function normalizeStatus(s) {
  return (s || '').toLowerCase().replace(/[\s_]/g, '');
}

/**
 * Reusable hook providing isolated pagination, server-side filtering,
 * debounced search, and status synchronization for a single Kanban column.
 */
export function useInfiniteColumnCases({
  status,
  departmentId,
  caseType,
  search = '',
  priority = 'all',
  channel = 'all',
  pageSize = 30,
}) {
  const { lastStatusChange, boardRefreshKey } = useCase();

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Debounced search query
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Track in-flight abort controllers
  const abortControllerRef = useRef(null);
  // Track last handled status change timestamp to avoid double handling
  const lastHandledStatusChangeRef = useRef(null);
  // Ref for current pagination state to prevent stale closures in async callbacks
  const stateRef = useRef({ page, hasNextPage, isLoadingInitial, isLoadingMore });
  stateRef.current = { page, hasNextPage, isLoadingInitial, isLoadingMore };

  /**
   * Fetch a specific page for this column
   */
  const fetchPage = useCallback(
    async (pageToFetch, isInitial = false) => {
      // Abort previous in-flight request if starting a fresh initial load
      if (isInitial && abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      if (isInitial) {
        abortControllerRef.current = controller;
      }

      if (isInitial) {
        setIsLoadingInitial(true);
        setError(null);
      } else {
        setIsLoadingMore(true);
        setError(null);
      }

      try {
        const response = await caseService.getPaginatedBoardCases({
          status,
          page: pageToFetch,
          pageSize,
          departmentId,
          caseType,
          search: debouncedSearch,
          priority,
          channel,
          signal: controller.signal,
        });

        const fetchedItems = response.items || [];
        const reportedTotal = response.totalCount ?? 0;
        const reportedHasNext = response.hasNextPage ?? (pageToFetch * pageSize < reportedTotal);

        setItems((prevItems) => {
          if (isInitial) {
            return fetchedItems;
          }
          // Deduplicate items by ID
          const existingIds = new Set(prevItems.map((c) => c.id));
          const newUnique = fetchedItems.filter((c) => !existingIds.has(c.id));
          return [...prevItems, ...newUnique];
        });

        setPage(pageToFetch);
        setTotalCount(reportedTotal);
        setHasNextPage(reportedHasNext);
        setError(null);
      } catch (err) {
        // api.js wraps Axios errors, so the cancel marker lives on err.original
        if (err.name === 'CanceledError' || err.name === 'AbortError' || err.original?.name === 'CanceledError') {
          return; // Request was aborted by user or new filter
        }
        setError(err.message || 'Failed to load cases');
      } finally {
        if (isInitial) {
          setIsLoadingInitial(false);
        } else {
          setIsLoadingMore(false);
        }
      }
    },
    [status, pageSize, departmentId, caseType, debouncedSearch, priority, channel]
  );

  /**
   * Initial load & filter change handler:
   * Whenever filters, debounced search, or department changes, reset to page 1
   */
  useEffect(() => {
    fetchPage(1, true);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchPage, boardRefreshKey]);

  /**
   * Status change synchronization:
   * When a case changes status anywhere in the app, update only affected columns
   */
  useEffect(() => {
    if (!lastStatusChange || lastStatusChange.timestamp === lastHandledStatusChangeRef.current) {
      return;
    }
    lastHandledStatusChangeRef.current = lastStatusChange.timestamp;

    const { caseId, fromStatus, toStatus, updatedCase } = lastStatusChange;
    const colNorm = normalizeStatus(status);
    const fromNorm = normalizeStatus(fromStatus);
    const toNorm = normalizeStatus(toStatus);

    // 1. If this column was the source status, remove the case and decrement count
    if (fromNorm === colNorm && toNorm !== colNorm) {
      setItems((prev) => prev.filter((c) => c.id !== caseId));
      setTotalCount((cnt) => Math.max(0, cnt - 1));
    }

    // 2. If this column was the destination status, add the case and increment count
    if (toNorm === colNorm && fromNorm !== colNorm) {
      if (updatedCase) {
        setItems((prev) => {
          if (prev.some((c) => c.id === caseId)) {
            return prev.map((c) => (c.id === caseId ? { ...c, ...updatedCase, status } : c));
          }
          return [{ ...updatedCase, status }, ...prev];
        });
        setTotalCount((cnt) => cnt + 1);
      } else {
        // If full case data not provided in payload, fetch page 1 to stay fresh
        fetchPage(1, true);
      }
    }
  }, [lastStatusChange, status, fetchPage]);

  /**
   * Load next page on scroll
   */
  const loadMore = useCallback(() => {
    const { page: currentPage, hasNextPage: canLoadNext, isLoadingInitial: loadingInit, isLoadingMore: loadingNext } = stateRef.current;
    if (!canLoadNext || loadingInit || loadingNext) {
      return;
    }
    fetchPage(currentPage + 1, false);
  }, [fetchPage]);

  /**
   * Refresh current column
   */
  const refresh = useCallback(() => {
    fetchPage(1, true);
  }, [fetchPage]);

  return {
    items,
    page,
    totalCount,
    hasNextPage,
    isLoadingInitial,
    isLoadingMore,
    error,
    loadMore,
    refresh,
  };
}

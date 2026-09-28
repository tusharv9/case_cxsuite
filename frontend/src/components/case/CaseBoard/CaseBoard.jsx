// ===== CASE BOARD — OmniConnect Reference System =====
// Scalable Kanban Board with independent column pagination and react-window virtualization

import { useMemo } from 'react';
import { BOARD_COLUMNS } from '../../../constants/index.js';
import { useInfiniteColumnCases } from '../../../hooks/useInfiniteColumnCases.js';
import { VirtualizedCaseList } from './VirtualizedCaseList.jsx';
import './CaseBoard.css';

function normalizeStatus(s) {
  return (s || '').toLowerCase().replace(/[\s_]/g, '');
}

// --- Single Kanban Column with Isolated Pagination & Virtualization ---
function KanbanColumn({
  column,
  departmentId,
  caseType,
  search,
  priority,
  channel,
  isFilteredOut,
  selectedCaseId,
  onCardClick,
}) {
  const {
    items,
    totalCount,
    hasNextPage,
    isLoadingInitial,
    isLoadingMore,
    error,
    loadMore,
    refresh,
  } = useInfiniteColumnCases({
    status: column.key,
    departmentId,
    caseType,
    search,
    priority,
    channel,
  });

  const statusKey = column.key.toLowerCase();
  const displayItems = isFilteredOut ? [] : items;
  const displayTotal = isFilteredOut ? 0 : totalCount;

  return (
    <div
      className={`case-column case-column--${statusKey}`}
      role="region"
      aria-label={`${column.label} cases`}
    >
      {/* 1. Fixed Header (Always visible at top of column) */}
      <div className="case-column__header">
        <span className="case-column__indicator" aria-hidden="true" />
        <span className="case-column__title">{column.label}</span>
        <span className="case-column__count">
          {isLoadingInitial && !isFilteredOut ? '-' : displayTotal}
        </span>
      </div>

      {/* 2. Virtualized List (Owns the single vertical scroll area for this column) */}
      <div className="case-column__body-virtualized">
        <VirtualizedCaseList
          items={displayItems}
          totalCount={displayTotal}
          hasNextPage={isFilteredOut ? false : hasNextPage}
          isLoadingInitial={isFilteredOut ? false : isLoadingInitial}
          isLoadingMore={isFilteredOut ? false : isLoadingMore}
          error={isFilteredOut ? null : error}
          selectedCaseId={selectedCaseId}
          onCardClick={onCardClick}
          onLoadMore={loadMore}
          onRetry={refresh}
        />
      </div>
    </div>
  );
}

// --- Board ---
export function CaseBoard({
  selectedCaseId,
  onCardClick,
  departmentId,
  caseType,
  searchQuery = '',
  selectedStatusFilter = 'all',
  selectedPriorityFilter = 'all',
  selectedChannelFilter = 'all',
}) {
  return (
    <div className="case-board" role="main">
      {BOARD_COLUMNS.map((col) => {
        const isFilteredOut =
          selectedStatusFilter !== 'all' &&
          normalizeStatus(selectedStatusFilter) !== normalizeStatus(col.key);

        return (
          <KanbanColumn
            key={col.key}
            column={col}
            departmentId={departmentId}
            caseType={caseType}
            search={searchQuery}
            priority={selectedPriorityFilter}
            channel={selectedChannelFilter}
            isFilteredOut={isFilteredOut}
            selectedCaseId={selectedCaseId}
            onCardClick={onCardClick}
          />
        );
      })}
    </div>
  );
}

// ===== VIRTUALIZED CASE LIST — OmniConnect Reference System =====
// Reusable virtualization component for Kanban columns using react-window 2.x

import { memo, useCallback, useMemo } from 'react';
import { List } from 'react-window';
import { Package, RefreshCw, AlertCircle } from 'lucide-react';
import { CaseCard } from '../CaseCard/CaseCard.jsx';
import { Skeleton } from '../../common/Skeleton/Skeleton.jsx';

// Predictable row height based on measured DOM bounds:
// Maximum 3-line card is ~186px + 12px bottom spacing = 198px
const ROW_HEIGHT = 198;

// Memoized individual row component
const CaseRow = memo(function CaseRow({
  ariaAttributes,
  index,
  style,
  items,
  selectedCaseId,
  onCardClick,
}) {
  const caseData = items[index];
  if (!caseData) return null;

  return (
    <div
      {...ariaAttributes}
      style={{
        ...style,
        padding: '0 12px 12px 12px',
        boxSizing: 'border-box',
      }}
    >
      <CaseCard
        caseData={caseData}
        isSelected={caseData.id === selectedCaseId}
        onClick={() => onCardClick?.(caseData)}
      />
    </div>
  );
});

export function VirtualizedCaseList({
  items = [],
  totalCount = 0,
  hasNextPage = false,
  isLoadingInitial = false,
  isLoadingMore = false,
  error = null,
  selectedCaseId,
  onCardClick,
  onLoadMore,
  onRetry,
}) {
  // Stable key extractor using stable Case ID
  const rowKey = useCallback((index) => {
    return items[index]?.id || `case-${index}`;
  }, [items]);

  // Pass necessary props down to rowComponent
  const rowProps = useMemo(() => ({
    items,
    selectedCaseId,
    onCardClick,
  }), [items, selectedCaseId, onCardClick]);

  // Trigger loading next page when user scrolls near the bottom of loaded cases
  const handleRowsRendered = useCallback(
    ({ stopIndex: visibleStopIndex }, { stopIndex: overscanStopIndex }) => {
      const currentStop = Math.max(visibleStopIndex, overscanStopIndex ?? visibleStopIndex);
      const nearBottom = currentStop >= items.length - 2;

      if (nearBottom && hasNextPage && !isLoadingMore && !isLoadingInitial) {
        onLoadMore?.();
      }
    },
    [items.length, hasNextPage, isLoadingMore, isLoadingInitial, onLoadMore]
  );

  // 1. Initial Loading State: Column Skeletons
  if (isLoadingInitial && items.length === 0) {
    return (
      <div className="case-column__skeleton-wrapper">
        <Skeleton.Card style={{ marginBottom: 12, padding: 14, borderRadius: 12 }}>
          <Skeleton.Text lines={3} style={{ marginBottom: 10 }} />
        </Skeleton.Card>
        <Skeleton.Card style={{ marginBottom: 12, padding: 14, borderRadius: 12 }}>
          <Skeleton.Text lines={3} style={{ marginBottom: 10 }} />
        </Skeleton.Card>
        <Skeleton.Card style={{ marginBottom: 12, padding: 14, borderRadius: 12 }}>
          <Skeleton.Text lines={2} style={{ marginBottom: 10 }} />
        </Skeleton.Card>
      </div>
    );
  }

  // 2. Initial Error State (if initial fetch failed with zero items)
  if (error && items.length === 0) {
    return (
      <div className="case-column__error-state">
        <AlertCircle size={22} className="case-column__error-icon" />
        <span className="case-column__error-text">{error}</span>
        <button type="button" className="case-column__retry-btn" onClick={onRetry}>
          <RefreshCw size={13} />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  // 3. Empty State: No cases matching column/filters
  if (items.length === 0) {
    return (
      <div className="case-column__empty">
        <Package size={24} strokeWidth={1.2} />
        <span>No cases</span>
      </div>
    );
  }

  // 4. Virtualized List (Owns the single vertical scroll area for the column)
  return (
    <div className="case-column__virtualized-container">
      <List
        className="case-column__virtual-list scrollbar-thin"
        style={{
          height: '100%',
          width: '100%',
          outline: 'none',
          paddingTop: 12,
          boxSizing: 'border-box',
        }}
        rowCount={items.length}
        rowHeight={ROW_HEIGHT}
        rowKey={rowKey}
        rowProps={rowProps}
        rowComponent={CaseRow}
        onRowsRendered={handleRowsRendered}
        overscanCount={0}
      />

      {/* Inline Bottom Loading Indicator */}
      {isLoadingMore && (
        <div className="case-column__footer-status case-column__footer-status--loading">
          <div className="case-column__mini-spinner" aria-hidden="true" />
          <span>Loading more cases...</span>
        </div>
      )}

      {/* Pagination Error Retry Banner (Keeps loaded items visible) */}
      {error && (
        <div className="case-column__footer-status case-column__footer-status--error">
          <span>Failed to load more</span>
          <button type="button" className="case-column__footer-retry-btn" onClick={onRetry}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

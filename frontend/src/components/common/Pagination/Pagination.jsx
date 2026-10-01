// ===== PAGINATION =====
// Previous / numbered pages / Next, with a "Showing x–y of n" summary and page-size selector.

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './Pagination.css';

function buildPageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 1, total - 2, total - 3].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push('…' + p);
    result.push(p);
  });
  return result;
}

export function Pagination({
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  isLoading = false,
  itemLabel = 'cases',
}) {
  const numericOptions = pageSizeOptions.filter((n) => typeof n === 'number');
  const hasCustomOption = pageSizeOptions.some(
    (opt) => String(opt).toLowerCase() === 'custom'
  );

  const [isCustomMode, setIsCustomMode] = useState(
    hasCustomOption && !numericOptions.includes(pageSize)
  );
  const [customInputValue, setCustomInputValue] = useState(String(pageSize));

  useEffect(() => {
    if (numericOptions.includes(pageSize)) {
      setIsCustomMode(false);
      setCustomInputValue(String(pageSize));
    } else if (hasCustomOption) {
      setIsCustomMode(true);
      setCustomInputValue(String(pageSize));
    }
  }, [pageSize, numericOptions, hasCustomOption]);

  if (!totalCount) return null;

  const safeTotalPages = Math.max(1, totalPages || Math.ceil(totalCount / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);
  const go = (p) => {
    if (p < 1 || p > safeTotalPages || p === page || isLoading) return;
    onPageChange(p);
  };

  const handleSelectChange = (e) => {
    const val = e.target.value;
    if (val === 'custom') {
      setIsCustomMode(true);
      const parsed = parseInt(customInputValue, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 100) {
        onPageSizeChange(parsed);
      }
    } else {
      setIsCustomMode(false);
      onPageSizeChange(Number(val));
    }
  };

  const handleCustomInputChange = (e) => {
    const raw = e.target.value;
    setCustomInputValue(raw);
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 1 && num <= 100) {
      onPageSizeChange(num);
    }
  };

  return (
    <nav className="pagination" aria-label={`${itemLabel} list pages`}>
      <span className="pagination__summary">
        Showing <strong>{from.toLocaleString()}–{to.toLocaleString()}</strong> of{' '}
        <strong>{totalCount.toLocaleString()}</strong> {itemLabel}
      </span>

      <div className="pagination__controls">
        <button
          type="button"
          className="pagination__btn"
          onClick={() => go(page - 1)}
          disabled={page <= 1 || isLoading}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
          <span>Previous</span>
        </button>

        {buildPageList(page, safeTotalPages).map((p) =>
          typeof p === 'string' ? (
            <span key={p} className="pagination__ellipsis" aria-hidden="true">…</span>
          ) : (
            <button
              key={p}
              type="button"
              className={`pagination__page ${p === page ? 'pagination__page--active' : ''}`}
              onClick={() => go(p)}
              aria-current={p === page ? 'page' : undefined}
              disabled={isLoading && p !== page}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          className="pagination__btn"
          onClick={() => go(page + 1)}
          disabled={page >= safeTotalPages || isLoading}
          aria-label="Next page"
        >
          <span>Next</span>
          <ChevronRight size={14} />
        </button>
      </div>

      {onPageSizeChange && (
        <div className="pagination__size">
          <span>Rows per page</span>
          <select
            value={isCustomMode ? 'custom' : pageSize}
            onChange={handleSelectChange}
            aria-label="Rows per page"
          >
            {numericOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
            {hasCustomOption && <option value="custom">Custom</option>}
          </select>

          {isCustomMode && (
            <input
              type="number"
              min="1"
              max="100"
              className="pagination__custom-input"
              value={customInputValue}
              onChange={handleCustomInputChange}
              placeholder="1–100"
              title="Enter custom rows per page (1–100)"
              aria-label="Custom rows per page"
            />
          )}
        </div>
      )}
    </nav>
  );
}

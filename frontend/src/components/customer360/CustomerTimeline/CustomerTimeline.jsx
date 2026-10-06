// ===== CUSTOMER TIMELINE =====
// What actually happened across this customer's cases: case milestones (opened, assigned, transferred, escalated, resolved)
// and the messages that were visible to the customer. Internal working notes are not part of it. All of it comes from the
// server; nothing here is decorative.

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { customerService } from '../../../services/customerService.js';
import { EmptyState, ErrorState, Loader } from '../../common/Loader/Loader.jsx';
import { formatDateTime } from '../../../utils/dateUtils.js';
import './CustomerTimeline.css';

export function CustomerTimeline({ customerId, pageSize = 20, compact = false }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (nextPage) => {
    setLoading(true);
    setError(null);
    try {
      const result = await customerService.getCustomerTimeline(customerId, { page: nextPage, pageSize });
      setItems((prev) => (nextPage === 1 ? result.items : [...prev, ...result.items]));
      setTotal(result.totalCount);
      setPage(nextPage);
    } catch (err) {
      setError(err?.message || 'The timeline could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [customerId, pageSize]);

  useEffect(() => { load(1); }, [load]);

  if (error && items.length === 0) return <ErrorState title="Couldn't load the timeline" message={error} onRetry={() => load(1)} />;
  if (loading && items.length === 0) return <Loader text="Loading timeline…" />;
  if (items.length === 0) return <EmptyState title="Nothing on the timeline yet" description="Activity appears here as this customer's cases progress." />;

  return (
    <div className="customer-timeline">
      <ol className="customer-timeline__list">
        {items.map((item) => (
          <li key={item.id} className={`customer-timeline__item customer-timeline__item--${item.type.toLowerCase()}`}>
            <span className="customer-timeline__dot" aria-hidden="true" />
            <div className="customer-timeline__body">
              <div className="customer-timeline__head">
                <span className="customer-timeline__type">{item.type}</span>
                <Link className="customer-timeline__case" to={`/case-management/${item.caseId}`}>{item.caseNumber}</Link>
                <span className="customer-timeline__title">{item.caseTitle}</span>
              </div>
              <p className="customer-timeline__message">{item.message}</p>
              <span className="customer-timeline__meta">{item.actorName ? `${item.actorName} · ` : ''}{formatDateTime(item.createdAt)}</span>
            </div>
          </li>
        ))}
      </ol>

      {!compact && items.length < total && (
        <button type="button" className="customer-timeline__more" onClick={() => load(page + 1)} disabled={loading}>
          {loading ? 'Loading…' : `Show more (${total - items.length} older)`}
        </button>
      )}
    </div>
  );
}

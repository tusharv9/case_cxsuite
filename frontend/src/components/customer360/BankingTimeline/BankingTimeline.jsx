// ===== BANKING TIMELINE COMPONENT =====

import { formatDate } from '../../../utils/dateUtils.js';
import './BankingTimeline.css';

export function BankingTimeline({ events = [] }) {
  const items = Array.isArray(events) ? events : [];

  if (items.length === 0) {
    return (
      <div className="banking-timeline-empty" style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', background: 'var(--color-surface, #ffffff)', borderRadius: 'var(--radius-md, 8px)', border: '1px dashed var(--color-border, #e2e8f0)' }}>
        <p style={{ fontWeight: 600, color: 'var(--color-text-primary, #0f172a)' }}>No timeline activity available</p>
        <p style={{ fontSize: '13px', marginTop: 4, color: 'var(--color-text-tertiary, #64748b)' }}>No timeline activity recorded for this customer.</p>
      </div>
    );
  }

  return (
    <div className="banking-timeline-compact">
      {items.map((item, idx) => {
        const metaText = item.meta || (item.timestamp ? formatDate(item.timestamp) : 'Recent');
        const titleText = item.title || item.eventType || 'Activity';
        const descText = item.description || item.notes || '';
        const color = item.dotColor || '#2563eb';

        return (
          <div key={item.id || idx} className="banking-timeline-compact__item">
            {/* Left dot & line */}
            <div className="banking-timeline-compact__left">
              <span className="banking-timeline-compact__dot" style={{ backgroundColor: color }} />
              {idx < items.length - 1 && <span className="banking-timeline-compact__line" />}
            </div>

            {/* Right content */}
            <div className="banking-timeline-compact__right">
              <span className="banking-timeline-compact__meta">{metaText}</span>
              <h4 className="banking-timeline-compact__title">{titleText}</h4>
              {descText && <p className="banking-timeline-compact__desc">{descText}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

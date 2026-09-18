// ===== DASHBOARD: RECENT ACTIVITY FEED =====

import { memo } from 'react';
import { FileText, CheckCircle2, AlertTriangle, Plus } from 'lucide-react';

/**
 * Extracted from DashboardPage and memoized. The dashboard re-renders on a 10s clock so that
 * SLA countdowns stay live; this list does not depend on the clock, so memoizing it keeps that
 * tick from reconciling one row per case every time.
 *
 * Markup and behaviour are unchanged from the inline version.
 */
export const ActivityFeed = memo(function ActivityFeed({ activities, onSelectCase }) {
  return (
    <div className="operational-card">
      <div className="chart-card__header">
        <h4 className="chart-card__title">
          <FileText size={16} /> Recent Activity Feed
        </h4>
      </div>
      <div className="activity-stream">
        {activities.length === 0 ? (
          <span style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>
            No recent activity
          </span>
        ) : (
          activities.map((act) => (
            <div
              key={act.id}
              className="activity-item"
              onClick={() => onSelectCase(act.caseId)}
              style={{ cursor: 'pointer' }}
            >
              <div
                className="activity-icon-badge"
                style={{
                  backgroundColor:
                    act.type === 'resolved'
                      ? '#dcfce7'
                      : act.type === 'escalated'
                      ? '#fee2e2'
                      : '#e0f2fe',
                  color:
                    act.type === 'resolved'
                      ? '#15803d'
                      : act.type === 'escalated'
                      ? '#dc2626'
                      : '#0284c7',
                }}
              >
                {act.type === 'resolved' ? (
                  <CheckCircle2 size={15} />
                ) : act.type === 'escalated' ? (
                  <AlertTriangle size={15} />
                ) : (
                  <Plus size={15} />
                )}
              </div>
              <div className="activity-content">
                <p className="activity-text">{act.title}</p>
                <div className="activity-meta">
                  <span>{act.sub}</span>
                  <span>&middot;</span>
                  <span>{act.time}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>

  );
});

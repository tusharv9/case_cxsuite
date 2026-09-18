// ===== DASHBOARD: CASES REQUIRING SLA ATTENTION =====

import { memo } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { SeverityBadge, StatusBadge } from '../../../components/common/Badge/Badge.jsx';

/**
 * Extracted from DashboardPage and memoized. This list is genuinely time-dependent, so it does
 * re-render when SLA state changes — but only then, rather than as part of a whole-page tick.
 *
 * Markup and behaviour are unchanged from the inline version.
 */
export const AttentionCasesList = memo(function AttentionCasesList({ cases, onSelectCase }) {
  return (
    <div className="operational-card">
      <div className="chart-card__header">
        <h4 className="chart-card__title">
          <AlertTriangle size={16} color="#dc2626" /> Cases Requiring SLA Attention
        </h4>
      </div>
      <div className="attention-cases-list">
        {cases.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-text-tertiary)', fontSize: '13px' }}>
            <ShieldCheck size={32} color="#15803d" style={{ marginBottom: '8px' }} />
            <p>All active cases are healthy and within SLA!</p>
          </div>
        ) : (
          cases.map((c) => (
            <div
              key={c.id}
              className="attention-case-card"
              onClick={() => onSelectCase(c.id)}
            >
              <div className="attention-case-info">
                <span className="attention-case-title">
                  {c.caseNumber} &middot; {c.title}
                </span>
                <span className="attention-case-sub">
                  Customer: {c.customerName || 'Standard'} &middot; {c.departmentName}
                </span>
              </div>
              <div className="attention-case-right">
                <SeverityBadge severity={c.severity} size="sm" />
                <StatusBadge status={c.status} size="sm" />
              </div>
            </div>
          ))
        )}
      </div>
    </div>

  );
});

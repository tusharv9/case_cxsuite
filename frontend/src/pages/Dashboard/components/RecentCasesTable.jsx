// ===== DASHBOARD: RECENT CASES OVERVIEW TABLE =====

import { memo } from 'react';
import { FolderOpen } from 'lucide-react';
import { DeptBadge, SeverityBadge, StatusBadge } from '../../../components/common/Badge/Badge.jsx';

/**
 * Extracted from DashboardPage and memoized. This is the largest list on the page — one row per
 * filtered case — and none of it depends on the 10s clock, so memoizing removes the bulk of the
 * periodic reconciliation work.
 *
 * Markup and behaviour are unchanged from the inline version.
 */
export const RecentCasesTable = memo(function RecentCasesTable({ cases, onSelectCase, onViewBoard }) {
  return (
    <div className="operational-card operational-grid-full">
      <div className="chart-card__header">
        <h4 className="chart-card__title">
          <FolderOpen size={16} /> Recent Cases Overview
        </h4>
        <button
          className="cases-list-board-btn"
          onClick={onViewBoard}
        >
          View All Board Cases
        </button>
      </div>
      <div className="recent-cases-table-wrapper">
        <table className="recent-cases-table">
          <thead>
            <tr>
              <th>Case #</th>
              <th>Title / Description</th>
              <th>Customer</th>
              <th>Department</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Owner</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr
                key={c.id}
                className="recent-cases-row"
                onClick={() => onSelectCase(c.id)}
              >
                <td className="recent-case-id">{c.caseNumber}</td>
                <td className="recent-case-title-cell">{c.title}</td>
                <td>{c.customerName || 'Customer'}</td>
                <td>
                  <DeptBadge name={c.departmentName} size="sm" />
                </td>
                <td>
                  <SeverityBadge severity={c.severity} size="sm" />
                </td>
                <td>
                  <StatusBadge status={c.status} size="sm" />
                </td>
                <td>{c.ownerName || 'Unassigned'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

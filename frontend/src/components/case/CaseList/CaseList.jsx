// ===== CASE LIST TABLE VIEW — OmniConnect Reference System =====

import { useState } from 'react';
import { Clock, AlertTriangle, CheckCircle2, Pause, Inbox } from 'lucide-react';
import { getSlaDisplay, getSlaConfig } from '../../../utils/slaUtils.js';
import { useNow } from '../../../hooks/useNow.js';
import { getInitials, getAvatarColor } from '../../../utils/avatarUtils.js';
import { ChannelBadge } from '../ChannelBadge/ChannelBadge.jsx';
import { CASE_STATUS_COLORS, CASE_STATUS_LABELS } from '../../../constants/index.js';
import './CaseList.css';

function SlaBadgeList({ status, severity, slaStartTime, slaTargetHours, slaPausedAt, slaTotalPausedMinutes }) {
  const now = useNow(1000);
  const { internalHours } = getSlaConfig(severity, slaTargetHours);
  const sla = getSlaDisplay(slaStartTime, internalHours, status, now, slaPausedAt, slaTotalPausedMinutes);

  if (sla.status === 'within') {
    return (
      <span className="case-list-sla case-list-sla--met">
        <CheckCircle2 size={12} strokeWidth={2.5} />
        <span>{sla.label}</span>
      </span>
    );
  }

  if (sla.status === 'paused') {
    return (
      <span className="case-list-sla case-list-sla--paused">
        <Pause size={11} strokeWidth={2.5} />
        <span>{sla.label}</span>
      </span>
    );
  }

  if (sla.status === 'breached') {
    return (
      <span className="case-list-sla case-list-sla--breached">
        <Clock size={12} strokeWidth={2.5} />
        <span>{sla.label}</span>
      </span>
    );
  }

  return (
    <span className="case-list-sla case-list-sla--active">
      <Clock size={12} strokeWidth={2.5} />
      <span>{sla.label}</span>
    </span>
  );
}

function PriorityBadgeList({ severity }) {
  const norm = (severity || 'Medium').trim();
  const lower = norm.toLowerCase();

  let className = 'case-list-priority--medium';
  let label = norm;

  if (lower === 'critical' || lower === 'bad') {
    className = 'case-list-priority--critical';
    label = 'Critical';
  } else if (lower === 'high' || lower === 'warn') {
    className = 'case-list-priority--high';
    label = 'High';
  } else if (lower === 'low' || lower === 'ok') {
    className = 'case-list-priority--low';
    label = 'Low';
  } else if (lower === 'medium' || lower === 'info') {
    className = 'case-list-priority--medium';
    label = 'Medium';
  }

  return (
    <span className={`case-list-priority ${className}`}>
      {label}
    </span>
  );
}

function StatusBadgeList({ status }) {
  const label = CASE_STATUS_LABELS[status] || status;
  const colors = CASE_STATUS_COLORS[status] || {
    color: '#475569',
    bg: '#f1f5f9',
    border: '#cbd5e1',
  };

  return (
    <span
      className="case-list-status"
      style={{
        color: colors.color,
        backgroundColor: colors.bg,
        borderColor: colors.border,
      }}
    >
      {label}
    </span>
  );
}

function formatCreatedDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    return `${day} ${month}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
  } catch {
    return dateStr;
  }
}

export function CaseList({ cases = [], selectedCaseId, onCaseClick }) {
  const [selectedIds, setSelectedIds] = useState(new Set());

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(new Set(cases.map((c) => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectRow = (e, id) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  if (cases.length === 0) {
    return (
      <div className="case-list-empty">
        <Inbox size={40} strokeWidth={1.3} className="case-list-empty__icon" />
        <h3 className="case-list-empty__title">No cases found</h3>
        <p className="case-list-empty__desc">No case records match your current filter or search criteria.</p>
      </div>
    );
  }

  const allSelected = cases.length > 0 && selectedIds.size === cases.length;

  return (
    <div className="case-list-container scrollbar-thin">
      <table className="case-list-table">
        <thead>
          <tr>
            <th className="th-checkbox">
              <input
                type="checkbox"
                className="case-list-checkbox"
                checked={allSelected}
                onChange={handleSelectAll}
                aria-label="Select all cases"
              />
            </th>
            <th className="th-case">CASE</th>
            <th className="th-customer">CUSTOMER</th>
            <th className="th-channel">CHANNEL</th>
            <th className="th-priority">PRIORITY</th>
            <th className="th-status">STATUS</th>
            <th className="th-assignee">ASSIGNEE</th>
            <th className="th-sla">RESOLUTION SLA</th>
            <th className="th-created">CREATED</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => {
            const isRowSelected = selectedIds.has(c.id);
            const isCurrentCase = c.id === selectedCaseId;

            const custInitials = c.customerName ? getInitials(c.customerName) : 'CU';
            const custColor = c.customerName ? getAvatarColor(c.customerName) : { bg: '#64748b', text: '#ffffff' };

            const agentInitials = c.ownerName ? getInitials(c.ownerName) : '?';
            const agentColor = c.ownerName ? getAvatarColor(c.ownerName) : { bg: '#94a3af', text: '#ffffff' };
            const agentFirstName = c.ownerName ? c.ownerName.split(' ')[0] : 'Unassigned';

            const resolvedSlaStartTime = c.slaStartTime || c.createdAt;

            return (
              <tr
                key={c.id}
                className={`case-list-row ${isCurrentCase ? 'case-list-row--active' : ''} ${isRowSelected ? 'case-list-row--selected' : ''}`}
                onClick={() => onCaseClick?.(c)}
              >
                {/* Checkbox */}
                <td className="td-checkbox" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="case-list-checkbox"
                    checked={isRowSelected}
                    onChange={(e) => handleSelectRow(e, c.id)}
                    aria-label={`Select case ${c.caseNumber}`}
                  />
                </td>

                {/* Case ID & Title */}
                <td className="td-case">
                  <div className="case-cell">
                    <span className="case-cell__number">{c.caseNumber}</span>
                    <span className="case-cell__title" title={c.title}>{c.title}</span>
                  </div>
                </td>

                {/* Customer */}
                <td className="td-customer">
                  <div className="customer-cell">
                    <span
                      className="customer-cell__avatar"
                      style={{ backgroundColor: custColor.bg, color: custColor.text }}
                    >
                      {custInitials}
                    </span>
                    <div className="customer-cell__info">
                      <span className="customer-cell__name">{c.customerName || 'Walk-in Customer'}</span>
                      <span className="customer-cell__segment">{c.caseType || 'Standard'}</span>
                    </div>
                  </div>
                </td>

                {/* Channel */}
                <td className="td-channel">
                  <ChannelBadge channel={c.sourceChannel || c.communicationChannel || 'Voice'} />
                </td>

                {/* Priority */}
                <td className="td-priority">
                  <PriorityBadgeList severity={c.severity} />
                </td>

                {/* Status */}
                <td className="td-status">
                  <StatusBadgeList status={c.status} />
                </td>

                {/* Assignee / Agent */}
                <td className="td-assignee">
                  <div className="assignee-cell" title={`Assigned Agent: ${c.ownerName || 'Unassigned'}`}>
                    <span
                      className="assignee-cell__avatar"
                      style={{ backgroundColor: agentColor.bg, color: agentColor.text }}
                    >
                      {agentInitials}
                    </span>
                    <span className="assignee-cell__name">{agentFirstName}</span>
                  </div>
                </td>

                {/* Resolution SLA */}
                <td className="td-sla">
                  <SlaBadgeList
                    status={c.status}
                    severity={c.severity}
                    slaStartTime={resolvedSlaStartTime}
                    slaTargetHours={c.slaTargetHours}
                    slaPausedAt={c.slaPausedAt}
                    slaTotalPausedMinutes={c.slaTotalPausedMinutes}
                  />
                </td>

                {/* Created */}
                <td className="td-created">
                  <span className="created-cell">{formatCreatedDate(c.createdAt)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

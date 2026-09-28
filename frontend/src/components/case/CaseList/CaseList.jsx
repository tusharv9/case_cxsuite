// ===== CASE LIST TABLE VIEW — Clean Enterprise CRM Reference System =====

import { useState } from 'react';
import { Clock, AlertTriangle, CheckCircle2, Pause, Inbox } from 'lucide-react';
import { getSlaDisplay, getSlaConfig } from '../../../utils/slaUtils.js';
import { useNow } from '../../../hooks/useNow.js';
import { getInitials, getAvatarColor } from '../../../utils/avatarUtils.js';
import { ChannelBadge } from '../ChannelBadge/ChannelBadge.jsx';
import './CaseList.css';

function SlaBadgeList({ status, severity, slaStartTime, slaTargetHours, slaPausedAt, slaTotalPausedMinutes }) {
  const now = useNow(1000);
  const { internalHours } = getSlaConfig(severity, slaTargetHours);
  const sla = getSlaDisplay(slaStartTime, internalHours, status, now, slaPausedAt, slaTotalPausedMinutes);

  if (sla.status === 'within') {
    return (
      <span className="case-list-sla case-list-sla--met">
        <CheckCircle2 size={11} strokeWidth={2.5} />
        <span>{sla.label}</span>
      </span>
    );
  }

  if (sla.status === 'paused') {
    return (
      <span className="case-list-sla case-list-sla--paused">
        <Pause size={10} strokeWidth={2.5} />
        <span>{sla.label}</span>
      </span>
    );
  }

  if (sla.status === 'breached') {
    return (
      <span className="case-list-sla case-list-sla--breached">
        <Clock size={11} strokeWidth={2.2} />
        <span>{sla.label}</span>
      </span>
    );
  }

  return (
    <span className="case-list-sla case-list-sla--active">
      <Clock size={11} strokeWidth={2.2} />
      <span>{sla.label}</span>
    </span>
  );
}

function PriorityBadgeList({ severity }) {
  const norm = (severity || 'Medium').trim();
  const lower = norm.toLowerCase();

  let className = 'case-list-priority--medium';
  let label = 'Medium';

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
  } else {
    label = norm;
  }

  return (
    <span className={`case-list-priority ${className}`}>
      {label}
    </span>
  );
}

function StatusBadgeList({ status, escalationLevel }) {
  const norm = (status || 'Open').trim();
  const lower = norm.toLowerCase();

  let className = 'case-list-status--open';
  let label = norm;

  if (lower === 'open') {
    className = 'case-list-status--open';
    label = 'Open';
  } else if (lower === 'in progress' || lower === 'inprogress') {
    className = 'case-list-status--inprogress';
    label = 'In Progress';
  } else if (lower === 'waiting on customer' || lower === 'waitingoncustomer') {
    className = 'case-list-status--waiting';
    label = 'Waiting on Customer';
  } else if (lower === 'escalated') {
    className = 'case-list-status--escalated';
    label = 'Escalated';
  } else if (lower === 'resolved') {
    className = 'case-list-status--resolved';
    label = 'Resolved';
  }

  return (
    <div className="status-badge-container">
      <span className={`case-list-status ${className}`}>
        {label}
      </span>
      {lower === 'escalated' && escalationLevel ? (
        <span className="case-list-esc-badge" title={`Escalation Level ${escalationLevel}`}>
          {typeof escalationLevel === 'number' ? `L${escalationLevel}` : escalationLevel.startsWith('L') ? escalationLevel : `L${escalationLevel}`}
        </span>
      ) : null}
    </div>
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
        <Inbox size={38} strokeWidth={1.4} className="case-list-empty__icon" />
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

            const isAssigned = Boolean(c.ownerName && c.ownerName.trim() && c.ownerName.toLowerCase() !== 'unassigned');
            const agentInitials = isAssigned ? getInitials(c.ownerName) : '';
            const agentColor = isAssigned ? getAvatarColor(c.ownerName) : null;
            const agentFirstName = isAssigned ? c.ownerName.split(' ')[0] : '';

            const resolvedSlaStartTime = c.slaStartTime || c.createdAt;

            // Escalation level comes only from the case's escalationLevel. (A "-L01" suffix in
            // a case number marks a linked sub-case, not an escalation level.)
            const escLvl = c.escalationLevel || null;

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

                {/* Case ID & Subject */}
                <td className="td-case">
                  <div className="case-cell">
                    <span className="case-cell__number">{c.caseNumber}</span>
                    <span className="case-cell__title" title={c.title}>{c.title}</span>
                  </div>
                </td>

                {/* Customer with Avatar & Subtitle */}
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
                      <span className="customer-cell__segment">{c.caseType || 'Priority'}</span>
                    </div>
                  </div>
                </td>

                {/* Channel Badge */}
                <td className="td-channel">
                  <ChannelBadge channel={c.sourceChannel || c.communicationChannel || 'Voice'} />
                </td>

                {/* Priority Pill */}
                <td className="td-priority">
                  <PriorityBadgeList severity={c.severity} />
                </td>

                {/* Status Pill (+ optional escalation level badge) */}
                <td className="td-status">
                  <StatusBadgeList status={c.status} escalationLevel={escLvl} />
                </td>

                {/* Assignee / Queue */}
                <td className="td-assignee">
                  {isAssigned ? (
                    <div className="assignee-cell" title={`Assigned Agent: ${c.ownerName}`}>
                      <span
                        className="assignee-cell__avatar"
                        style={{ backgroundColor: agentColor.bg, color: agentColor.text }}
                      >
                        {agentInitials}
                      </span>
                      <span className="assignee-cell__name">{agentFirstName}</span>
                    </div>
                  ) : (
                    <span className="assignee-unassigned-tag">Queue</span>
                  )}
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

                {/* Created Date */}
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

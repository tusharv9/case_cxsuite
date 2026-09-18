// ===== CASE CARD =====

import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getSlaDisplay, getSlaConfig } from '../../../utils/slaUtils.js';
import { useNow } from '../../../hooks/useNow.js';
import { getInitials, getAvatarColor } from '../../../utils/avatarUtils.js';
import { DeptBadge } from '../../common/Badge/Badge.jsx';
import './CaseCard.css';

function SlaSection({ status, severity, slaStartTime, slaTargetHours, caseNumber }) {
  const now = useNow(1000);
  const isResolved = status === 'Resolved';
  const isEscalated = status === 'Escalated';
  const { internalHours } = getSlaConfig(severity, slaTargetHours);
  const sla = getSlaDisplay(slaStartTime, internalHours, status, now);
  const remainingTimeStr = sla.label;

  if (isResolved) {
    return (
      <div className="case-card__sla case-card__sla--resolved">
        <CheckCircle2 size={12} strokeWidth={2.5} className="sla-icon" />
        <span className="sla-label">Within SLA</span>
      </div>
    );
  }

  if (isEscalated) {
    return (
      <div className="case-card__sla case-card__sla--breached">
        <AlertTriangle size={12} strokeWidth={2.5} className="sla-icon" />
        <span className="sla-label">Breached</span>
        {caseNumber === 'C-10301' && (
          <span className="sla-breached-ref">{caseNumber}</span>
        )}
      </div>
    );
  }

  // Active cases (Open or InProgress)
  let severityLabel = 'Info';
  let severityClass = 'info';
  let icon = <Clock size={12} strokeWidth={2.5} />;

  if (severity === 'Warn') {
    severityLabel = 'At risk';
    severityClass = 'warn';
  } else if (severity === 'Bad') {
    severityLabel = 'Critical';
    severityClass = 'bad';
    icon = <AlertTriangle size={12} strokeWidth={2.5} />;
  } else if (severity === 'Ok') {
    severityLabel = 'Within SLA';
    severityClass = 'ok';
    icon = <CheckCircle2 size={12} strokeWidth={2.5} />;
  }

  return (
    <div className={`case-card__sla case-card__sla--active case-card__sla--${severityClass}`}>
      <div className="case-card__sla-left">
        {icon}
        <span className="sla-sev-label">{severityLabel}</span>
      </div>
      <span className="sla-time-val">{remainingTimeStr}</span>
    </div>
  );
}

export function CaseCard({ caseData, isSelected, onClick, onHandleClick }) {
  const now = useNow(1000);
  const { title, departmentName, severity, status, ownerName, caseNumber, createdAt, slaStartTime, slaTargetHours } = caseData;

  const resolvedSlaStartTime = slaStartTime || createdAt;
  const { internalHours } = getSlaConfig(severity, slaTargetHours);
  const sla = getSlaDisplay(resolvedSlaStartTime, internalHours, status, now);
  const isResolved = status === 'Resolved';
  const slaClass = isResolved ? 'sla-resolved' : `sla-${sla.status}`;
  const ownerInitials = ownerName ? getInitials(ownerName) : '?';
  const ownerColor = ownerName ? getAvatarColor(ownerName) : { bg: '#9ca3af', text: '#fff' };

  return (
    <article
      className={`case-card case-card--${slaClass}${isSelected ? ' case-card--selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Case ${caseNumber}: ${title}`}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {/* Department capsule top left */}
      <div className="case-card__dept">
        <DeptBadge name={departmentName} />
      </div>

      {/* Title */}
      <h3 className="case-card__title">{title}</h3>

      {/* SLA section */}
      <div className="case-card__meta">
        <SlaSection
          status={status}
          severity={severity}
          slaStartTime={resolvedSlaStartTime}
          slaTargetHours={slaTargetHours}
          caseNumber={caseNumber}
        />
      </div>

      {/* Footer: Owner avatar + Case ID right next to it */}
      <div className="case-card__footer">
        <span
          className="case-card__owner-initials"
          style={{ backgroundColor: ownerColor.bg, color: ownerColor.text }}
          aria-label={ownerName}
          title={ownerName}
        >
          {ownerInitials}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span className="case-card__case-id">{caseNumber}</span>
          {(caseData.isSubcase || caseData.parentCaseNumber) && (
            <span style={{ fontSize: '10px', color: '#6b7280', fontWeight: 500 }}>
              Parent: {caseData.parentCaseNumber || 'Parent Case'}
            </span>
          )}
        </div>
        {status === 'Open' ? (
          <span className="case-card__open-cta">
            <button type="button" className="case-card__handle-btn" onClick={(e) => { e.stopPropagation(); onHandleClick?.(); }}>Handle</button> &rarr;
          </span>
        ) : (
          <span className="case-card__open-cta">Open &rarr;</span>
        )}
      </div>
    </article>
  );
}

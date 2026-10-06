// ===== CASE CARD — OmniConnect Reference System =====

import { Clock, AlertTriangle, CheckCircle2, Pause } from 'lucide-react';
import { getSlaDisplay } from '../../../utils/slaUtils.js';
import { useNow } from '../../../hooks/useNow.js';
import { getInitials, getAvatarColor } from '../../../utils/avatarUtils.js';
import { ChannelBadge } from '../ChannelBadge/ChannelBadge.jsx';
import './CaseCard.css';

function SlaBadge({ caseItem }) {
  const now = useNow(1000);
  const sla = getSlaDisplay(caseItem, now);

  if (sla.status === 'within') {
    return (
      <span className="case-card-sla-badge case-card-sla-badge--met">
        <CheckCircle2 size={11} strokeWidth={2.5} />
        <span>{sla.label}</span>
      </span>
    );
  }

  if (sla.status === 'holiday-paused' || (sla.status === 'paused' && sla.isHoliday)) {
    return (
      <span
        className="case-card-sla-badge case-card-sla-badge--holiday-paused"
        title={sla.tooltip || `Today is a public holiday (${sla.holidayName || 'Holiday'}). SLA clock is paused.`}
      >
        <Pause size={10} strokeWidth={2.5} />
        <span>{sla.label}</span>
      </span>
    );
  }

  if (sla.status === 'bh-paused') {
    return (
      <span
        className="case-card-sla-badge case-card-sla-badge--holiday-paused"
        title={sla.tooltip || 'SLA clock is paused (Outside Business Hours / Business Hours Disabled)'}
      >
        <Pause size={10} strokeWidth={2.5} />
        <span>{sla.label}</span>
      </span>
    );
  }

  if (sla.status === 'paused') {
    return (
      <span
        className="case-card-sla-badge case-card-sla-badge--paused"
        title={sla.tooltip || 'SLA clock is paused (Waiting on Customer)'}
      >
        <Pause size={10} strokeWidth={2.5} />
        <span>{sla.label}</span>
      </span>
    );
  }

  if (sla.status === 'breached') {
    return (
      <span className="case-card-sla-badge case-card-sla-badge--breached">
        <Clock size={11} strokeWidth={2.5} />
        <span>{sla.label}</span>
      </span>
    );
  }

  return (
    <span className="case-card-sla-badge case-card-sla-badge--active">
      <Clock size={11} strokeWidth={2.5} />
      <span>{sla.label}</span>
    </span>
  );
}

function PriorityBadge({ severity }) {
  const norm = (severity || 'Medium').trim();
  const lower = norm.toLowerCase();

  let className = 'case-card-priority-badge--medium';
  let label = norm;

  if (lower === 'critical' || lower === 'bad') {
    className = 'case-card-priority-badge--critical';
    label = 'Critical';
  } else if (lower === 'high' || lower === 'warn') {
    className = 'case-card-priority-badge--high';
    label = 'High';
  } else if (lower === 'low' || lower === 'ok') {
    className = 'case-card-priority-badge--low';
    label = 'Low';
  } else if (lower === 'medium' || lower === 'info') {
    className = 'case-card-priority-badge--medium';
    label = 'Medium';
  }

  return (
    <span className={`case-card-priority-badge ${className}`}>
      {label}
    </span>
  );
}

export function CaseCard({ caseData, isSelected, onClick }) {
  const {
    title,
    severity,
    status,
    ownerName,
    caseNumber,
    createdAt,
    sourceChannel,
    communicationChannel,
  } = caseData;

  const isAssigned = Boolean(ownerName && ownerName.trim() && ownerName.toLowerCase() !== 'unassigned');
  const ownerInitials = isAssigned ? getInitials(ownerName) : '';
  const ownerColor = isAssigned ? getAvatarColor(ownerName) : null;

  return (
    <article
      className={`case-card${isSelected ? ' case-card--selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Case ${caseNumber}: ${title}`}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {/* 1. Header: Priority & SLA Status */}
      <div className="case-card__header">
        <PriorityBadge severity={severity} />
        <SlaBadge caseItem={caseData} />
      </div>

      {/* 2. Body: Case ID & Title */}
      <div className="case-card__body">
        <span className="case-card__id">{caseNumber}</span>
        <h4 className="case-card__title" title={title}>{title}</h4>
      </div>

      {/* 3. Footer: Channel Pill + Dynamic Agent Avatar or Unassigned Badge */}
      <div className="case-card__footer">
        <ChannelBadge channel={sourceChannel || communicationChannel || 'Voice'} />
        
        <div className="case-card__agent-wrapper">
          {isAssigned ? (
            <span
              className="case-card__agent-avatar"
              style={{ backgroundColor: ownerColor.bg, color: ownerColor.text }}
              title={`Assigned Agent: ${ownerName}`}
              aria-label={`Assigned Agent: ${ownerName}`}
            >
              {ownerInitials}
            </span>
          ) : (
            <span className="case-card__unassigned-badge" title="Unassigned">
              Unassigned
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

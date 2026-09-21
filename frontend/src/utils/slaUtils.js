// ===== SLA UTILS =====

import { SEVERITY_SLA_MAPPING } from '../constants/index.js';

/**
 * Get SLA configuration based on severity
 */
export function getSlaConfig(severity, customExternalHours) {
  const normalized = severity ? (severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase()) : 'Low';
  const mapping = SEVERITY_SLA_MAPPING[normalized] || SEVERITY_SLA_MAPPING[severity];

  // Severities are administrator-configurable, so anything outside the built-in map takes its
  // hours from the case's own stored SLA target rather than silently inheriting "Low".
  if (!mapping) {
    const externalHours = customExternalHours > 0 ? customExternalHours : SEVERITY_SLA_MAPPING.Low.external;
    return { externalHours, internalHours: Math.max(1, externalHours - 2) };
  }

  return { externalHours: mapping.external, internalHours: mapping.internal };
}

/**
 * SLA Display Helper for CaseCard, CaseList & CaseDrawer
 */
export function getSlaDisplay(
  slaStartTime,
  slaTargetHours = 24,
  status = 'Open',
  currentTimestamp,
  slaPausedAt = null,
  slaTotalPausedMinutes = 0
) {
  if (status === 'Resolved') {
    return { status: 'within', label: 'SLA Met', color: '#16a34a' };
  }

  if (status === 'WaitingOnCustomer' || status === 'Waiting on Customer' || Boolean(slaPausedAt)) {
    return { status: 'paused', label: 'Clock paused', color: '#64748b' };
  }

  const start = new Date(slaStartTime || Date.now()).getTime();
  const targetMs = (slaTargetHours || 24) * 3600 * 1000;
  const pausedMs = (slaTotalPausedMinutes || 0) * 60 * 1000;
  const effectiveDeadline = start + targetMs + pausedMs;
  const now = currentTimestamp || Date.now();
  const remainingMs = effectiveDeadline - now;

  if (remainingMs <= 0) {
    const absMs = Math.abs(remainingMs);
    const totalHours = Math.floor(absMs / 3600000);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const minutes = Math.floor((absMs % 3600000) / 60000);
    
    const label = days > 0 
      ? `-${days}d ${hours}h over`
      : `-${hours}h ${String(minutes).padStart(2, '0')}m over`;

    return { 
      status: 'breached', 
      label, 
      color: '#dc2626' 
    };
  }

  const totalHours = Math.floor(remainingMs / 3600000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = Math.floor((remainingMs % 3600000) / 60000);

  const label = days > 0
    ? `${days}d ${hours}h`
    : `${hours}h ${String(minutes).padStart(2, '0')}m`;

  return { 
    status: 'normal', 
    label, 
    color: '#d97706' 
  };
}

export function formatSlaRemaining(slaStartTime, slaTargetHours = 24, currentTimestamp, status = 'Open', slaPausedAt = null, slaTotalPausedMinutes = 0) {
  const display = getSlaDisplay(slaStartTime, slaTargetHours, status, currentTimestamp, slaPausedAt, slaTotalPausedMinutes);
  return display.label;
}

/**
 * Calculate Dual SLA status for a case
 * @param {Object} caseItem
 * @param {number} [currentTimestamp]
 * @returns {Object} { external, internal, isInternalBreached, isExternalBreached, isPaused }
 */
export function calculateDualSla(caseItem, currentTimestamp) {
  if (!caseItem) return null;
  const isResolved = caseItem.status === 'Resolved';
  const isPaused = caseItem.status === 'WaitingOnCustomer' || caseItem.status === 'Waiting on Customer' || Boolean(caseItem.slaPausedAt);

  if (isPaused) {
    return {
      externalTargetHours: 0,
      internalTargetHours: 0,
      externalRemainingFormatted: 'Clock paused',
      internalRemainingFormatted: 'Clock paused',
      isExternalBreached: false,
      isInternalBreached: false,
      isPaused: true,
      internalLabel: 'SLA Clock Paused (Waiting on Customer)',
      externalLabel: 'SLA Clock Paused (Waiting on Customer)',
    };
  }

  const startTime = new Date(caseItem.slaStartTime || caseItem.createdAt || Date.now()).getTime();
  const now = currentTimestamp || Date.now();
  const pausedMs = (caseItem.slaTotalPausedMinutes || 0) * 60 * 1000;
  const elapsedMs = (isResolved ? (new Date(caseItem.resolvedAt || now).getTime() - startTime) : (now - startTime)) - pausedMs;

  const { externalHours, internalHours } = getSlaConfig(caseItem.severity, caseItem.slaTargetHours);

  const externalTargetMs = externalHours * 3600 * 1000;
  const internalTargetMs = internalHours * 3600 * 1000;

  const externalRemainingMs = externalTargetMs - elapsedMs;
  const internalRemainingMs = internalTargetMs - elapsedMs;

  const isExternalBreached = externalRemainingMs < 0 && !isResolved;
  const isInternalBreached = internalRemainingMs < 0 && !isResolved;

  const formatRemaining = (ms) => {
    if (isResolved) return 'SLA Met';
    const isNegative = ms < 0;
    const absMs = Math.abs(ms);
    const totalHours = Math.floor(absMs / 3600000);
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    const minutes = String(Math.floor((absMs % 3600000) / 60000)).padStart(2, '0');
    if (days > 0) {
      return `${isNegative ? '-' : ''}${days}d ${hours}h`;
    }
    return `${isNegative ? '-' : ''}${hours}h ${minutes}m`;
  };

  return {
    externalTargetHours: externalHours,
    internalTargetHours: internalHours,
    externalRemainingFormatted: formatRemaining(externalRemainingMs),
    internalRemainingFormatted: formatRemaining(internalRemainingMs),
    isExternalBreached,
    isInternalBreached,
    isPaused: false,
    internalLabel: `${internalHours} Hours (Internal · Agent)`,
    externalLabel: `${externalHours} Hours (External · Customer)`,
  };
}

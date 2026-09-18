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
 * Legacy SLA Display Helper for CaseCard & CaseDrawer
 */
export function getSlaDisplay(slaStartTime, slaTargetHours = 24, status = 'Open', currentTimestamp) {
  if (status === 'Resolved') {
    return { status: 'within', label: 'WITHIN', color: '#16a34a' };
  }

  const start = new Date(slaStartTime || Date.now()).getTime();
  const targetMs = (slaTargetHours || 24) * 3600 * 1000;
  const now = currentTimestamp || Date.now();
  const remainingMs = start + targetMs - now;

  if (remainingMs <= 0) {
    const absMs = Math.abs(remainingMs);
    const hours = Math.floor(absMs / 3600000);
    const minutes = Math.floor((absMs % 3600000) / 60000);
    const seconds = Math.floor((absMs % 60000) / 1000);
    return { 
      status: 'breached', 
      label: `-${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s overdue`, 
      color: '#dc2626' 
    };
  }

  const hours = Math.floor(remainingMs / 3600000);
  const minutes = Math.floor((remainingMs % 3600000) / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  return { 
    status: 'normal', 
    label: `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s remaining`, 
    color: '#d97706' 
  };
}

export function formatSlaRemaining(slaStartTime, slaTargetHours = 24, currentTimestamp) {
  const display = getSlaDisplay(slaStartTime, slaTargetHours, 'Open', currentTimestamp);
  return display.label;
}

/**
 * Calculate Dual SLA status for a case
 * @param {Object} caseItem
 * @param {number} [currentTimestamp]
 * @returns {Object} { external, internal, isInternalBreached, isExternalBreached }
 */
export function calculateDualSla(caseItem, currentTimestamp) {
  if (!caseItem) return null;
  const isResolved = caseItem.status === 'Resolved';
  const startTime = new Date(caseItem.slaStartTime || caseItem.createdAt || Date.now()).getTime();
  const now = currentTimestamp || Date.now();
  const elapsedMs = isResolved ? (new Date(caseItem.resolvedAt || now).getTime() - startTime) : (now - startTime);

  const { externalHours, internalHours } = getSlaConfig(caseItem.severity, caseItem.slaTargetHours);

  const externalTargetMs = externalHours * 3600 * 1000;
  const internalTargetMs = internalHours * 3600 * 1000;

  const externalRemainingMs = externalTargetMs - elapsedMs;
  const internalRemainingMs = internalTargetMs - elapsedMs;

  const isExternalBreached = externalRemainingMs < 0 && !isResolved;
  const isInternalBreached = internalRemainingMs < 0 && !isResolved;

  const formatRemaining = (ms) => {
    if (isResolved) return 'WITHIN';
    const isNegative = ms < 0;
    const absMs = Math.abs(ms);
    const hours = String(Math.floor(absMs / 3600000)).padStart(2, '0');
    const minutes = String(Math.floor((absMs % 3600000) / 60000)).padStart(2, '0');
    const seconds = String(Math.floor((absMs % 60000) / 1000)).padStart(2, '0');
    return `${isNegative ? '-' : ''}${hours}h ${minutes}m ${seconds}s`;
  };

  return {
    externalTargetHours: externalHours,
    internalTargetHours: internalHours,
    externalRemainingFormatted: formatRemaining(externalRemainingMs),
    internalRemainingFormatted: formatRemaining(internalRemainingMs),
    isExternalBreached,
    isInternalBreached,
    // Human friendly labels
    internalLabel: `${internalHours} Hours (Internal · Agent)`,
    externalLabel: `${externalHours} Hours (External · Customer)`,
  };
}

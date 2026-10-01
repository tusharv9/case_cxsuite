// ===== SLA UTILS =====

import { SEVERITY_SLA_MAPPING } from '../constants/index.js';

/**
 * Get SLA configuration based on severity
 */
export function getSlaConfig(severity, customExternalHours) {
  // Prioritize server-provided SLA target hours if present
  if (customExternalHours !== undefined && customExternalHours !== null && Number(customExternalHours) > 0) {
    const hours = Number(customExternalHours);
    return { externalHours: hours, internalHours: Math.max(1, hours - 2) };
  }

  const normalized = severity ? (severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase()) : 'Low';
  const mapping = SEVERITY_SLA_MAPPING[normalized] || SEVERITY_SLA_MAPPING[severity];

  if (!mapping) {
    const externalHours = customExternalHours > 0 ? customExternalHours : (SEVERITY_SLA_MAPPING.Low?.external || 24);
    return { externalHours, internalHours: Math.max(1, externalHours - 2) };
  }

  return { externalHours: mapping.external, internalHours: mapping.internal };
}

/**
 * Helper to check if a specific date or today is an active public holiday
 */
export function checkIsPublicHolidayToday(publicHolidays, targetDate = new Date()) {
  if (!Array.isArray(publicHolidays) || publicHolidays.length === 0) return { isHoliday: false, holidayName: null };
  const d = new Date(targetDate);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${day}`;

  for (const h of publicHolidays) {
    if (!h.isActive) continue;
    const hDateStr = typeof h.holidayDate === 'string' ? h.holidayDate.substring(0, 10) : '';
    if (hDateStr === dateStr) {
      return { isHoliday: true, holidayName: h.name };
    }
  }
  return { isHoliday: false, holidayName: null };
}

/**
 * Helper to check if current time is within active business hours window in MYT
 * @param {Array} businessHours
 * @param {Date|number} [targetDate]
 * @returns {boolean}
 */
export function checkIsBusinessHoursActive(businessHours, targetDate = new Date()) {
  if (!Array.isArray(businessHours) || businessHours.length === 0) return true;
  
  // Convert targetDate to Malaysia Standard Time (UTC+8)
  const d = new Date(targetDate);
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const mytDate = new Date(utc + (3600000 * 8));

  const dayOfWeek = mytDate.getDay(); // 0 is Sunday, 1 is Monday...
  const bh = businessHours.find((b) => b.dayOfWeek === dayOfWeek);
  if (!bh || !bh.isEnabled) {
    return false;
  }

  // Parse start and end time (format "HH:mm" or "HH:mm:ss")
  const currentMinutes = mytDate.getHours() * 60 + mytDate.getMinutes();
  
  const parseTimeMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  };

  const startMinutes = parseTimeMinutes(bh.startTime || '09:00');
  const endMinutes = parseTimeMinutes(bh.endTime || '17:00');

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
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
  slaTotalPausedMinutes = 0,
  isHolidayToday = false,
  holidayName = null,
  isBusinessHoursActive = true
) {
  if (status === 'Resolved' || status === 'Closed') {
    return { status: 'within', label: 'SLA Met', color: '#16a34a' };
  }

  if (isHolidayToday) {
    const hName = holidayName || 'Public Holiday';
    return {
      status: 'holiday-paused',
      isHoliday: true,
      label: 'Clock paused (Holiday)',
      shortLabel: 'Holiday Paused',
      tooltip: `SLA Clock Paused: Today is a Public Holiday (${hName})`,
      holidayName: hName,
      color: '#b45309',
    };
  }

  if (isBusinessHoursActive === false) {
    return {
      status: 'bh-paused',
      isHoliday: false,
      isBusinessHoursOff: true,
      label: 'Clock paused (Business Hours)',
      shortLabel: 'BH Paused',
      tooltip: 'SLA Clock Paused: Outside configured business hours schedule',
      color: '#b45309',
    };
  }

  if (status === 'WaitingOnCustomer' || status === 'Waiting on Customer' || Boolean(slaPausedAt)) {
    return {
      status: 'paused',
      isHoliday: false,
      label: 'Clock paused',
      shortLabel: 'Clock paused',
      tooltip: 'SLA Clock Paused (Waiting on Customer)',
      color: '#64748b',
    };
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

export function formatSlaRemaining(slaStartTime, slaTargetHours = 24, currentTimestamp, status = 'Open', slaPausedAt = null, slaTotalPausedMinutes = 0, isHolidayToday = false, holidayName = null) {
  const display = getSlaDisplay(slaStartTime, slaTargetHours, status, currentTimestamp, slaPausedAt, slaTotalPausedMinutes, isHolidayToday, holidayName);
  return display.label;
}

/**
 * Calculate Dual SLA status for a case
 * @param {Object} caseItem
 * @param {number} [currentTimestamp]
 * @param {boolean} [isHolidayToday]
 * @param {string} [holidayName]
 * @returns {Object} { external, internal, isInternalBreached, isExternalBreached, isPaused, isHoliday }
 */
export function calculateDualSla(caseItem, currentTimestamp, isHolidayToday = null, holidayName = null, isBusinessHoursActive = null) {
  if (!caseItem) return null;
  const isResolved = caseItem.status === 'Resolved' || caseItem.status === 'Closed';

  if (isResolved) {
    return {
      externalTargetHours: 0,
      internalTargetHours: 0,
      externalRemainingFormatted: 'SLA Met',
      internalRemainingFormatted: 'SLA Met',
      isExternalBreached: false,
      isInternalBreached: false,
      isPaused: false,
      isHoliday: false,
      internalLabel: 'SLA Met',
      externalLabel: 'SLA Met',
    };
  }

  const holidayActive = isHolidayToday !== null && isHolidayToday !== undefined
    ? Boolean(isHolidayToday)
    : Boolean(caseItem.isHolidayToday);
  const activeHolidayName = holidayName || caseItem.holidayName || 'Public Holiday';

  if (holidayActive) {
    return {
      externalTargetHours: 0,
      internalTargetHours: 0,
      externalRemainingFormatted: 'Clock paused (Holiday)',
      internalRemainingFormatted: 'Clock paused (Holiday)',
      isExternalBreached: false,
      isInternalBreached: false,
      isPaused: true,
      isHoliday: true,
      holidayName: activeHolidayName,
      internalLabel: `SLA Clock Paused (Public Holiday: ${activeHolidayName})`,
      externalLabel: `SLA Clock Paused (Public Holiday: ${activeHolidayName})`,
    };
  }

  const bhActive = isBusinessHoursActive !== null && isBusinessHoursActive !== undefined
    ? Boolean(isBusinessHoursActive)
    : (caseItem.isBusinessHoursActive !== undefined ? Boolean(caseItem.isBusinessHoursActive) : true);

  if (!bhActive) {
    return {
      externalTargetHours: 0,
      internalTargetHours: 0,
      externalRemainingFormatted: 'Clock paused (Business Hours)',
      internalRemainingFormatted: 'Clock paused (Business Hours)',
      isExternalBreached: false,
      isInternalBreached: false,
      isPaused: true,
      isHoliday: false,
      isBusinessHoursOff: true,
      internalLabel: 'SLA Clock Paused (Outside / Disabled Business Hours)',
      externalLabel: 'SLA Clock Paused (Outside / Disabled Business Hours)',
    };
  }

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
      isHoliday: false,
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

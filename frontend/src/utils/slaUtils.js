// ===== SLA DISPLAY =====
// The server decides how a case stands against its SLA (case.sla, computed by the one backend SLA clock in BUSINESS
// minutes: working hours, holidays, pauses). This file only turns that verdict into text and ticks it down between
// refreshes. It contains no SLA rules, targets or calendar of its own.

/** How long the display keeps counting down on its own before it stops and waits for fresh data from the server. */
const MAX_LOCAL_TICK_MINUTES = 10;

/** "2h 05m", "3d 4h" for a number of minutes (sign ignored). */
export function formatMinutes(minutes) {
  const total = Math.floor(Math.abs(minutes));
  const days = Math.floor(total / (60 * 24));
  const hours = Math.floor(total / 60) % 24;
  const mins = total % 60;
  return days > 0 ? `${days}d ${hours}h` : `${Math.floor(total / 60)}h ${String(mins).padStart(2, '0')}m`;
}

/**
 * Minutes left on one target (negative once breached), as of `nowMs`. Between server refreshes the number keeps moving
 * only while the server said the clock was running, and never for longer than MAX_LOCAL_TICK_MINUTES.
 */
export function remainingMinutes(target, sla, nowMs = Date.now()) {
  if (!target || !sla) return 0;
  if (!sla.isClockRunning) return target.remainingMinutes;
  const sinceComputed = (nowMs - Date.parse(sla.computedAt)) / 60000;
  return target.remainingMinutes - Math.min(MAX_LOCAL_TICK_MINUTES, Math.max(0, sinceComputed));
}

/**
 * What to show for a case's resolution SLA.
 * @returns {{ status: 'within'|'breached'|'paused'|'holiday-paused'|'bh-paused'|'normal'|'unknown', label: string, tooltip?: string, color: string, isBreached: boolean }}
 */
export function getSlaDisplay(caseItem, nowMs = Date.now()) {
  const sla = caseItem?.sla;
  if (!sla) return { status: 'unknown', label: '—', color: '#64748b', isBreached: false };

  // Resolved: the verdict is final.
  if (sla.isStopped) {
    return sla.health === 'Breached'
      ? { status: 'breached', label: 'SLA Breached', color: '#dc2626', isBreached: true }
      : { status: 'within', label: 'SLA Met', color: '#16a34a', isBreached: false };
  }

  const target = sla.internal;
  if (!target || target.targetMinutes <= 0) {
    return { status: 'unknown', label: 'No SLA target', tooltip: 'This case has no SLA target recorded.', color: '#64748b', isBreached: false };
  }
  const left = remainingMinutes(target, sla, nowMs);
  const text = left < 0 ? `-${formatMinutes(left)} over` : formatMinutes(left);

  if (sla.isPaused) {
    return { status: 'paused', label: 'Clock paused', tooltip: 'SLA clock paused (Waiting on Customer)', color: '#64748b', isBreached: false };
  }

  if (left < 0) return { status: 'breached', label: text, color: '#dc2626', isBreached: true };

  if (!sla.isClockRunning) {
    // Not paused by anything about the case: it is simply outside working time right now.
    if (caseItem.isHolidayToday) {
      const name = caseItem.holidayName || 'Public Holiday';
      return { status: 'holiday-paused', label: `${text} · holiday`, tooltip: `SLA clock paused today for ${name}`, holidayName: name, color: '#b45309', isBreached: false };
    }
    return { status: 'bh-paused', label: `${text} · closed`, tooltip: 'SLA clock stopped: outside working hours', color: '#b45309', isBreached: false };
  }

  return { status: 'normal', label: text, color: '#d97706', isBreached: false };
}

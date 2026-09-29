import { calculateDualSla } from '../../../utils/slaUtils.js';
import { useNow } from '../../../hooks/useNow.js';
import { useApp } from '../../../contexts/AppContext.jsx';
import { Clock, ShieldAlert, Pause } from 'lucide-react';
import './SlaDisplay.css';

/**
 * Dual SLA Display
 * @param {Object} props
 * @param {Object} props.caseItem - Case object
 * @param {string} props.size - 'sm' | 'md' | 'lg'
 */
export function SlaDisplay({ caseItem, size = 'md' }) {
  const now = useNow(1000);
  const appContext = useApp();
  const effectiveHolidayToday = caseItem?.isHolidayToday ?? appContext?.isHolidayToday ?? false;
  const effectiveHolidayName = caseItem?.holidayName || appContext?.todayHolidayName || null;
  const sla = calculateDualSla(caseItem, now, effectiveHolidayToday, effectiveHolidayName);
  if (!sla) return null;

  const isResolved = caseItem?.status === 'Resolved' || caseItem?.status === 'Closed';

  let badgeVariant = 'sla-badge--internal';
  if (sla.isInternalBreached) {
    badgeVariant = 'sla-badge--breached';
  } else if (sla.isHoliday) {
    badgeVariant = 'sla-badge--holiday-paused';
  } else if (sla.isPaused) {
    badgeVariant = 'sla-badge--paused';
  }

  return (
    <div className={`sla-display sla-display--${size}`}>
      <div
        className={`sla-badge ${badgeVariant}`}
        title={sla.isHoliday ? `SLA clock paused today for ${sla.holidayName || 'Public Holiday'}` : undefined}
      >
        <span className="sla-badge__value">
          {sla.isPaused ? <Pause size={11} strokeWidth={2.5} /> : <Clock size={12} />}
          {sla.internalRemainingFormatted}
        </span>
        {sla.isInternalBreached && !isResolved && (
          <span className="sla-badge__alert" title="SLA breached - Supervisor notified">
            <ShieldAlert size={12} /> Supervisor Alerted
          </span>
        )}
      </div>
    </div>
  );
}

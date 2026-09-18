import { calculateDualSla } from '../../../utils/slaUtils.js';
import { useNow } from '../../../hooks/useNow.js';
import { AlertCircle, Clock, ShieldAlert } from 'lucide-react';
import './SlaDisplay.css';

/**
 * Dual SLA Display
 * @param {Object} props
 * @param {Object} props.caseItem - Case object
 * @param {string} props.size - 'sm' | 'md' | 'lg'
 */
export function SlaDisplay({ caseItem, size = 'md' }) {
  const now = useNow(1000);
  const sla = calculateDualSla(caseItem, now);
  if (!sla) return null;

  const isResolved = caseItem?.status === 'Resolved';

  return (
    <div className={`sla-display sla-display--${size}`}>
      <div className={`sla-badge sla-badge--internal ${sla.isInternalBreached ? 'sla-badge--breached' : ''}`}>
        <span className="sla-badge__value">
          <Clock size={12} />
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

import { getSlaDisplay } from '../../../utils/slaUtils.js';
import { useNow } from '../../../hooks/useNow.js';
import { Clock, ShieldAlert, Pause } from 'lucide-react';
import './SlaDisplay.css';

/**
 * SLA badge for a case. The numbers come from the server's SLA clock (caseItem.sla); this only formats them.
 * @param {Object} props
 * @param {Object} props.caseItem - Case object as returned by the API
 * @param {string} props.size - 'sm' | 'md' | 'lg'
 */
export function SlaDisplay({ caseItem, size = 'md' }) {
  const now = useNow(1000);
  if (!caseItem) return null;

  const view = getSlaDisplay(caseItem, now);
  const isPaused = view.status === 'paused';

  let badgeVariant = 'sla-badge--internal';
  if (view.isBreached) badgeVariant = 'sla-badge--breached';
  else if (view.status === 'holiday-paused') badgeVariant = 'sla-badge--holiday-paused';
  else if (view.status === 'bh-paused') badgeVariant = 'sla-badge--bh-paused';
  else if (isPaused) badgeVariant = 'sla-badge--paused';

  return (
    <div className={`sla-display sla-display--${size}`}>
      <div className={`sla-badge ${badgeVariant}`} title={view.tooltip}>
        <span className="sla-badge__value">
          {isPaused || view.status.endsWith('paused') ? <Pause size={11} strokeWidth={2.5} /> : <Clock size={12} />}
          {view.label}
        </span>
        {view.isBreached && caseItem.sla?.isStopped !== true && (
          <span className="sla-badge__alert" title="SLA breached - escalation applies">
            <ShieldAlert size={12} /> Escalated by SLA
          </span>
        )}
      </div>
    </div>
  );
}

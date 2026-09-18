// ===== TIMELINE COMPONENT =====

import { GitCommitHorizontal, FileText, Users, ArrowRightLeft, AlertTriangle, CheckCircle2, Plus } from 'lucide-react';
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS } from '../../constants/index.js';
import { formatDateTime } from '../../utils/dateUtils.js';
import { EmptyState } from '../common/Loader/Loader.jsx';
import './Timeline.css';

const EVENT_ICONS = {
  Create:   <Plus size={14} />,
  Assign:   <GitCommitHorizontal size={14} />,
  Note:     <FileText size={14} />,
  Cowork:   <Users size={14} />,
  Transfer: <ArrowRightLeft size={14} />,
  Escalate: <AlertTriangle size={14} />,
  Resolve:  <CheckCircle2 size={14} />,
};

export function TimelineItem({ event }) {
  const label = EVENT_TYPE_LABELS[event.eventType] || event.eventType;
  const colors = EVENT_TYPE_COLORS[event.eventType] || { color: '#4b5563', bg: '#f3f4f6' };
  const icon = EVENT_ICONS[event.eventType] || <GitCommitHorizontal size={14} />;

  return (
    <div className="timeline-item">
      <div
        className="timeline-item__dot"
        style={{ backgroundColor: colors.bg, borderColor: colors.color + '44', color: colors.color }}
      >
        {icon}
      </div>
      <div className="timeline-item__body">
        <div className="timeline-item__header">
          <span
            className="timeline-item__type-badge"
            style={{ backgroundColor: colors.bg, color: colors.color }}
          >
            {label}
          </span>
          <span className="timeline-item__time">{formatDateTime(event.createdAt)}</span>
        </div>
        <div className="timeline-item__message">{event.message}</div>
        {event.user && (
          <p className="timeline-item__actor">
            by <strong>{event.user.name}</strong>
            {event.user.role ? ` (${event.user.role})` : ''}
          </p>
        )}
      </div>
    </div>
  );
}

export function Timeline({ events = [] }) {
  if (!events.length) {
    return <EmptyState title="No events yet" description="Timeline will appear here as actions are taken." />;
  }

  const sorted = [...events].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  return (
    <div className="timeline" role="list" aria-label="Case timeline">
      {sorted.map((event) => (
        <TimelineItem key={event.id} event={event} />
      ))}
    </div>
  );
}

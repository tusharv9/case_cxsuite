// ===== UNSAVED CHANGES SUMMARY =====
// What exactly is unsaved, shown inside UnsavedChangesDialog when the caller can list it:
//   [{ id, title, type: 'modified' | 'added' | 'visibility', badgeLabel?, properties?: [{ label, oldVal, newVal, isVisibility? }], addedDetails?: { label: value } }]

import { ArrowRight, Eye, EyeOff, PlusCircle } from 'lucide-react';

const BADGE = { visibility: 'Visibility Changed', added: 'Added', modified: 'Modified' };

export function UnsavedChangesSummary({ changes }) {
  if (!changes?.length) return null;
  return (
    <div className="unsaved-summary">
      <div className="unsaved-summary__section-header">
        <span className="unsaved-summary__section-title">Changes summary</span>
        <span className="unsaved-summary__count-pill">{changes.length} {changes.length === 1 ? 'item changed' : 'items changed'}</span>
      </div>
      <div className="unsaved-summary__diff-list">
        {changes.map((item, idx) => (
          <div className="unsaved-diff-card" key={item.id || idx}>
            <div className="unsaved-diff-card__header">
              <span className="unsaved-diff-card__title">
                {item.type === 'added' && <PlusCircle size={14} color="#059669" />}
                {item.title}
              </span>
              <span className={`unsaved-diff-badge unsaved-diff-badge--${item.type === 'visibility' || item.type === 'added' ? item.type : 'modified'}`}>
                {item.badgeLabel || BADGE[item.type] || BADGE.modified}
              </span>
            </div>

            {item.type === 'added' && item.addedDetails && (
              <div className="unsaved-diff-added-grid">
                {Object.entries(item.addedDetails).map(([k, v]) => (
                  <div className="unsaved-diff-added-item" key={k}>
                    <span className="unsaved-diff-added-item__label">{k}</span>
                    <span className="unsaved-diff-added-item__value">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}

            {item.properties?.length > 0 && (
              <div className="unsaved-summary__props">
                {item.properties.map((prop, pIdx) => (
                  <div className="unsaved-diff-prop" key={pIdx}>
                    <span className="unsaved-diff-prop__label">{prop.label}</span>
                    <div className="unsaved-diff-prop__values">
                      <span className="unsaved-diff-prop__val unsaved-diff-prop__val--old">
                        {prop.isVisibility ? <>{prop.oldVal ? <Eye size={13} /> : <EyeOff size={13} />}{prop.oldVal ? 'Visible' : 'Hidden'}</> : String(prop.oldVal ?? '(Empty)')}
                      </span>
                      <ArrowRight size={13} className="unsaved-diff-prop__arrow" />
                      <span className="unsaved-diff-prop__val unsaved-diff-prop__val--new">
                        {prop.isVisibility ? <>{prop.newVal ? <Eye size={13} /> : <EyeOff size={13} />}{prop.newVal ? 'Visible' : 'Hidden'}</> : String(prop.newVal ?? '(Empty)')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

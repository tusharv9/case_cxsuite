// ===== CENTERED UNSAVED CHANGES CONFIRMATION MODAL =====

import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Eye, EyeOff, X, ArrowRight, PlusCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/common/Button/Button.jsx';
import './UnsavedChangesModal.css';

/**
 * Centered Unsaved Changes Confirmation Modal with dynamic Changes Summary
 */
export function UnsavedChangesModal({
  isOpen,
  onStay,
  onLeave,
  onSave,
  changes = [],
  isSaving = false,
}) {
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape' && !isSaving) {
        onStay();
      }
    },
    [onStay, isSaving]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const count = changes.length;

  return createPortal(
    <div
      className="unsaved-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) {
          onStay();
        }
      }}
    >
      <div className="unsaved-modal">
        {/* DRAWER HEADER */}
        <div className="unsaved-modal__header">
          <div className="unsaved-modal__title-group">
            <div>
              <h2 className="unsaved-modal__title" id="unsaved-modal-title">
                Unsaved Changes
              </h2>
              <p className="unsaved-modal__subtitle">
                You have unsaved changes. Review the changes below before leaving.
              </p>
            </div>
          </div>
          <button
            className="unsaved-modal__close-btn"
            onClick={onStay}
            disabled={isSaving}
            aria-label="Close drawer"
            title="Close (Stay on Page)"
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY: CHANGES SUMMARY */}
        <div className="unsaved-modal__body">
          <div className="unsaved-alert-banner">
            <div className="unsaved-alert-banner__icon">
              <AlertCircle size={20} />
            </div>
            <div className="unsaved-alert-banner__text">
              <strong>Pending Edits:</strong> Review the changes below. These changes will be lost if you leave without saving.
            </div>
          </div>

          <div className="unsaved-modal__section-header">
            <span className="unsaved-modal__section-title">Changes Summary</span>
            {count > 0 && (
              <span className="unsaved-modal__count-pill">
                {count} {count === 1 ? 'item changed' : 'items changed'}
              </span>
            )}
          </div>

          <div className="unsaved-modal__diff-list">
            {changes.length === 0 ? (
              <div className="unsaved-diff-card" style={{ padding: '16px', color: '#64748b', fontSize: '13.5px' }}>
                You have pending configuration modifications.
              </div>
            ) : (
              changes.map((item, idx) => (
                <div className="unsaved-diff-card" key={item.id || idx}>
                  {/* Card Header: Item Title & Type Badge */}
                  <div className="unsaved-diff-card__header">
                    <span className="unsaved-diff-card__title">
                      {item.type === 'added' ? <PlusCircle size={14} color="#059669" /> : null}
                      {item.title}
                    </span>
                    <span
                      className={`unsaved-diff-badge ${
                        item.type === 'visibility'
                          ? 'unsaved-diff-badge--visibility'
                          : item.type === 'added'
                          ? 'unsaved-diff-badge--added'
                          : 'unsaved-diff-badge--modified'
                      }`}
                    >
                      {item.badgeLabel || (item.type === 'visibility' ? 'Visibility Changed' : item.type === 'added' ? 'Added' : 'Modified')}
                    </span>
                  </div>

                  {/* Added Field Card Layout */}
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

                  {/* Modified / Visibility Property Rows */}
                  {item.properties && item.properties.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {item.properties.map((prop, pIdx) => (
                        <div className="unsaved-diff-prop" key={pIdx}>
                          <span className="unsaved-diff-prop__label">{prop.label}</span>
                          <div className="unsaved-diff-prop__values">
                            {prop.isVisibility ? (
                              <>
                                <span className="unsaved-diff-prop__val unsaved-diff-prop__val--old">
                                  {prop.oldVal ? <Eye size={13} /> : <EyeOff size={13} />}
                                  {prop.oldVal ? 'Visible' : 'Hidden'}
                                </span>
                                <ArrowRight size={13} className="unsaved-diff-prop__arrow" />
                                <span className="unsaved-diff-prop__val unsaved-diff-prop__val--new">
                                  {prop.newVal ? <Eye size={13} /> : <EyeOff size={13} />}
                                  {prop.newVal ? 'Visible' : 'Hidden'}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="unsaved-diff-prop__val unsaved-diff-prop__val--old">
                                  {String(prop.oldVal ?? '(Empty)')}
                                </span>
                                <ArrowRight size={13} className="unsaved-diff-prop__arrow" />
                                <span className="unsaved-diff-prop__val unsaved-diff-prop__val--new">
                                  {String(prop.newVal ?? '(Empty)')}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="unsaved-modal__warning-text">
            <span>These changes will be lost if you leave without saving.</span>
          </div>
        </div>

        {/* ACTIONS */}
        <div className="unsaved-modal__footer">
          <Button
            variant="secondary"
            onClick={onStay}
            id="btn-unsaved-stay"
            disabled={isSaving}
            style={{ fontWeight: 600 }}
          >
            Stay on Page
          </Button>
          <Button
            variant="danger"
            onClick={onLeave}
            id="btn-unsaved-leave"
            disabled={isSaving}
            style={{
              backgroundColor: '#dc2626',
              borderColor: '#b91c1c',
              fontWeight: 600,
            }}
          >
            Leave Without Saving
          </Button>
          <Button
            variant="primary"
            onClick={onSave}
            id="btn-unsaved-save"
            isLoading={isSaving}
            style={{ fontWeight: 600 }}
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

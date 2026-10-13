// ===== SIDE DRAWER =====
// The one drawer shell (overlay, header with close button, scrolling body, footer). Behaviour every drawer should share lives here:
// Escape closes, the overlay closes, focus moves into the drawer and returns to what opened it, the page behind does not scroll, and
// when the form is dirty the person is asked before their work is thrown away.
//
// Markup and class names match the existing `create-drawer*` styles, so a drawer can adopt this without any visual change.

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { UnsavedChangesDialog } from '../UnsavedChangesDialog/UnsavedChangesDialog.jsx';
import './SideDrawer.css';

/**
 * @param {boolean}  props.isOpen
 * @param {() => void} props.onClose
 * @param {string}   props.title
 * @param {string}  [props.subtitle]
 * @param {React.ReactNode | ((api: { requestClose: () => void }) => React.ReactNode)} [props.footer]  a function receives the guarded close (use it for Cancel)
 * @param {boolean} [props.isDirty]     ask before closing when true (compare against the saved values, so reverting an edit clears it)
 * @param {string}  [props.discardLabel] what is being edited, shown in the unsaved-changes dialog (e.g. "Field: Occupation")
 * @param {'configuration'|'form'} [props.unsavedSubject='form'] wording of the unsaved-changes dialog
 * @param {() => (Promise<boolean|void>|boolean|void)} [props.onSave] offers "Save changes" in that dialog; return false when the
 *                                      save failed (the drawer then stays open with the edits). On success the save is expected to close the drawer.
 * @param {'sm'|'md'|'lg'} [props.size='md'] width variant (tokens --drawer-width-sm/md/lg)
 * @param {boolean} [props.escapeEnabled=true] set false while another drawer is open on top, so Escape closes only the top one
 * @param {string}  [props.className]   extra class on the <aside>
 * @param {string}  [props.ariaLabel]
 * @param {'div'|'form'} [props.bodyAs] render the body as a <form> (pass id/onSubmit through bodyProps)
 * @param {object}  [props.bodyProps]
 */
export function SideDrawer({ isOpen, onClose, title, subtitle, footer, isDirty = false, discardLabel, unsavedSubject = 'form', onSave, size = 'md', escapeEnabled = true, className = '', ariaLabel, bodyAs = 'div', bodyProps = {}, children }) {
  const [confirmClose, setConfirmClose] = useState(false);
  const drawerRef = useRef(null);
  const openerRef = useRef(null);

  const requestClose = useCallback(() => {
    if (isDirty) setConfirmClose(true);
    else onClose?.();
  }, [isDirty, onClose]);

  // The key handler must always see the CURRENT close behaviour and flags without re-running the effect below: that effect
  // moves focus into the drawer, so re-running it on every parent render (a new onClose each render, a field's blur
  // validation…) would drag focus back to the first field every time someone opened a dropdown or started typing elsewhere.
  const latest = useRef({ requestClose, confirmClose, escapeEnabled });
  latest.current = { requestClose, confirmClose, escapeEnabled };

  // Focus in on open, back out on close; Escape closes; the page behind stays put.
  useEffect(() => {
    if (!isOpen) return undefined;
    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTarget = drawerRef.current?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') || drawerRef.current;
    focusTarget?.focus?.({ preventScroll: true });

    const onKey = (e) => {
      const { requestClose: close, confirmClose: confirming, escapeEnabled: enabled } = latest.current;
      if (e.key === 'Escape' && enabled && !confirming) {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus?.({ preventScroll: true });
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const Body = bodyAs;
  const { className: bodyClassName = '', ...restBodyProps } = bodyProps;

  return createPortal(
    <>
      <div className="create-drawer-overlay" onClick={requestClose} aria-hidden="true" />
      <aside ref={drawerRef} tabIndex={-1} className={`create-drawer${size !== 'md' ? ` create-drawer--${size}` : ''} ${className}`} role="dialog" aria-modal="true" aria-label={ariaLabel || title}>
        <div className="create-drawer__header">
          <div className="create-drawer__header-content">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="create-drawer__close" onClick={requestClose} aria-label="Close drawer">
            <X size={18} />
          </button>
        </div>

        <Body className={`create-drawer__body scrollbar-thin ${bodyClassName}`} {...restBodyProps}>
          {children}
        </Body>

        {footer && <div className="create-drawer__footer">{typeof footer === 'function' ? footer({ requestClose }) : footer}</div>}
      </aside>

      <UnsavedChangesDialog
        isOpen={confirmClose}
        subject={unsavedSubject}
        itemName={discardLabel}
        onContinue={() => setConfirmClose(false)}
        onDiscard={() => { setConfirmClose(false); onClose?.(); }}
        onSave={onSave}
        onSaved={() => setConfirmClose(false)}
      />
    </>,
    document.body
  );
}

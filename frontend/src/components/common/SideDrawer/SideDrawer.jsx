// ===== SIDE DRAWER =====
// The one drawer shell (overlay, header with close button, scrolling body, footer). Behaviour every drawer should share lives here:
// Escape closes, the overlay closes, focus moves into the drawer and returns to what opened it, the page behind does not scroll, and
// when the form is dirty the person is asked before their work is thrown away.
//
// Markup and class names match the existing `create-drawer*` styles, so a drawer can adopt this without any visual change.

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog.jsx';

/**
 * @param {boolean}  props.isOpen
 * @param {() => void} props.onClose
 * @param {string}   props.title
 * @param {string}  [props.subtitle]
 * @param {React.ReactNode | ((api: { requestClose: () => void }) => React.ReactNode)} [props.footer]  a function receives the guarded close (use it for Cancel)
 * @param {boolean} [props.isDirty]     ask before closing when true
 * @param {boolean} [props.escapeEnabled=true] set false while another drawer is open on top, so Escape closes only the top one
 * @param {string}  [props.className]   extra class on the <aside>
 * @param {string}  [props.ariaLabel]
 * @param {'div'|'form'} [props.bodyAs] render the body as a <form> (pass id/onSubmit through bodyProps)
 * @param {object}  [props.bodyProps]
 */
export function SideDrawer({ isOpen, onClose, title, subtitle, footer, isDirty = false, escapeEnabled = true, className = '', ariaLabel, bodyAs = 'div', bodyProps = {}, children }) {
  const [confirmClose, setConfirmClose] = useState(false);
  const drawerRef = useRef(null);
  const openerRef = useRef(null);

  const requestClose = useCallback(() => {
    if (isDirty) setConfirmClose(true);
    else onClose?.();
  }, [isDirty, onClose]);

  // Focus in on open, back out on close; Escape closes; the page behind stays put.
  useEffect(() => {
    if (!isOpen) return undefined;
    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTarget = drawerRef.current?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') || drawerRef.current;
    focusTarget?.focus?.({ preventScroll: true });

    const onKey = (e) => {
      if (e.key === 'Escape' && escapeEnabled && !confirmClose) {
        e.stopPropagation();
        requestClose();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus?.({ preventScroll: true });
    };
  }, [isOpen, requestClose, confirmClose, escapeEnabled]);

  if (!isOpen) return null;

  const Body = bodyAs;
  const { className: bodyClassName = '', ...restBodyProps } = bodyProps;

  return createPortal(
    <>
      <div className="create-drawer-overlay" onClick={requestClose} aria-hidden="true" />
      <aside ref={drawerRef} tabIndex={-1} className={`create-drawer ${className}`} role="dialog" aria-modal="true" aria-label={ariaLabel || title}>
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

      <ConfirmDialog
        isOpen={confirmClose}
        title="Discard unsaved changes?"
        message="What you have entered will be lost."
        confirmLabel="Discard"
        variant="warning"
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => { setConfirmClose(false); onClose?.(); }}
      />
    </>,
    document.body
  );
}

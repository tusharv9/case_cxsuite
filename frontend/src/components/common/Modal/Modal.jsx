// ===== MODAL COMPONENT =====

import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import './Modal.css';

/**
 * Base Modal component using React Portal
 * @param {boolean} isOpen
 * @param {Function} onClose
 * @param {string} title
 * @param {string} subtitle
 * @param {ReactNode} children
 * @param {ReactNode} footer
 * @param {string} size - 'sm' | 'md' | 'lg' | 'xl'
 */
export function Modal({ isOpen, onClose, title, subtitle, children, footer, size = 'md', variant = 'default' }) {
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
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

  const isDestructive = variant === 'destructive' || variant === 'danger';

  return createPortal(
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`modal modal--${size}`}>
        <div className={`modal__header ${isDestructive ? 'modal__header--destructive' : ''}`}>
          <div>
            <h2 className="modal__title" id="modal-title">{title}</h2>
            {subtitle && <p className="modal__subtitle">{subtitle}</p>}
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

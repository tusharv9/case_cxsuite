// ===== TOAST COMPONENT =====

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useApp } from '../../../contexts/AppContext.jsx';
import './Toast.css';

const ICONS = {
  success: <CheckCircle2 size={16} />,
  error: <XCircle size={16} />,
  info: <Info size={16} />,
  warning: <AlertTriangle size={16} />,
};

function ToastItem({ toast }) {
  const { removeToast } = useApp();
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => removeToast(toast.id), 250);
    }, toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [toast, removeToast]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => removeToast(toast.id), 250);
  };

  return (
    <div
      className={`toast toast--${toast.type}${isExiting ? ' toast--exiting' : ''}`}
      role="alert"
      aria-live="polite"
    >
      <span className="toast__icon">{ICONS[toast.type] || ICONS.info}</span>
      <div className="toast__content">
        <p className="toast__message">{toast.message}</p>
      </div>
      <button className="toast__close" onClick={handleClose} aria-label="Dismiss notification">
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useApp();

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="toast-container" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>,
    document.body
  );
}

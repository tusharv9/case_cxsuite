// ===== LOADER, SKELETON, EMPTY STATE, ERROR STATE =====

import { Inbox, AlertCircle } from 'lucide-react';
import './Loader.css';
// Import button styles so the retry button renders correctly
import '../Button/Button.css';

export function Loader({ size = 'md', text = '' }) {
  return (
    <div className="loader">
      <div className={`loader__spinner loader__spinner--${size}`} role="status" aria-label="Loading" />
      {text && <p className="loader__text">{text}</p>}
    </div>
  );
}

export function Skeleton({ width, height, className = '', variant = 'rect', style = {} }) {
  const variantClass =
    variant === 'circle' ? 'skeleton--circle' :
    variant === 'text'   ? 'skeleton--text' :
    'skeleton--rect';
  return (
    <div
      className={`skeleton ${variantClass} ${className}`}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

export function EmptyState({ title = 'No data', description = '', icon: Icon = Inbox }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">
        <Icon size={40} strokeWidth={1.5} />
      </div>
      <p className="empty-state__title">{title}</p>
      {description && <p className="empty-state__description">{description}</p>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message = '', onRetry }) {
  return (
    <div className="error-state">
      <div className="error-state__icon">
        <AlertCircle size={40} strokeWidth={1.5} />
      </div>
      <p className="error-state__title">{title}</p>
      {message && <p className="error-state__message">{message}</p>}
      {onRetry && (
        <button
          className="btn btn--outline btn--sm"
          style={{ marginTop: '12px' }}
          onClick={onRetry}
        >
          Try again
        </button>
      )}
    </div>
  );
}

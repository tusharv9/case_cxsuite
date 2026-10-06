// ===== BADGE COMPONENT =====

import { CASE_STATUS_LABELS } from '../../../constants/index.js';
import './Badge.css';

/**
 * Generic Badge
 */
export function Badge({ label, className = '', size = 'md', style = {}, dot = false, children }) {
  const sizeClass = size !== 'md' ? `badge--${size}` : '';
  return (
    <span className={`badge ${sizeClass} ${className}`} style={style}>
      {dot && <span className="badge__dot" />}
      {label ?? children}
    </span>
  );
}

/**
 * Status Badge — Open | InProgress | Escalated | Resolved
 */
export function StatusBadge({ status, size = 'md' }) {
  const normalizedStatus = status?.replace(/\s+/g, '');
  const label = CASE_STATUS_LABELS[normalizedStatus] || status;
  const sizeClass = size !== 'md' ? `badge--${size}` : '';
  const variantClass = `badge--status-${normalizedStatus?.toLowerCase()}`;
  return (
    <span className={`badge ${variantClass} ${sizeClass}`}>
      {label}
    </span>
  );
}

/**
 * Priority badge. Names are administrator-configured, so the name is shown as-is.
 */
export function SeverityBadge({ severity, size = 'md' }) {
  const label = severity;
  const sizeClass = size !== 'md' ? `badge--${size}` : '';
  // Severities are administrator-configurable, so the name is slugified rather than assumed
  // to be a single word.
  const variantClass = `badge--severity-${severity?.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <span className={`badge ${variantClass} ${sizeClass}`}>
      {label}
    </span>
  );
}

/**
 * Department Badge — colored label chip
 */
export function DeptBadge({ name, size = 'md' }) {
  const deptCodeClean = name ? name.toLowerCase().replace(/\s+/g, '-') : 'unknown';
  const sizeClass = size !== 'md' ? `badge--${size}` : '';
  
  return (
    <span className={`badge badge--dept badge--dept-${deptCodeClean} ${sizeClass}`}>
      {name?.toUpperCase() || 'UNKNOWN'}
    </span>
  );
}

// ===== AVATAR COMPONENT =====

import { getInitials, getAvatarColor } from '../../../utils/avatarUtils.js';
import './Avatar.css';

/**
 * Avatar displays initials with a deterministic color from the name
 * @param {string} name - Full name
 * @param {string} size - 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
 * @param {string} className
 */
export function Avatar({ name, size = 'md', className = '', style = {} }) {
  const initials = getInitials(name);
  const { bg, text } = getAvatarColor(name);

  return (
    <span
      className={`avatar avatar--${size} ${className}`}
      style={{ backgroundColor: bg, color: text, ...style }}
      aria-label={name}
      title={name}
    >
      {initials}
    </span>
  );
}

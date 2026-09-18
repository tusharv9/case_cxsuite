// ===== BUTTON COMPONENT =====

import { Loader2 } from 'lucide-react';
import './Button.css';

/**
 * Reusable Button component
 * @param {string} variant - 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {boolean} isLoading
 * @param {boolean} isIcon - icon-only button
 * @param {ReactNode} leftIcon
 * @param {ReactNode} rightIcon
 */
export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  isLoading = false,
  isIcon = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  type = 'button',
  ...rest
}) {
  const classes = [
    'btn',
    `btn--${variant}`,
    size !== 'md' ? `btn--${size}` : '',
    isIcon ? 'btn--icon' : '',
    isLoading ? 'btn--loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading ? (
        <span className="btn__icon">
          <Loader2 size={14} />
        </span>
      ) : leftIcon ? (
        <span className="btn__icon">{leftIcon}</span>
      ) : null}
      {!isIcon && children}
      {rightIcon && !isLoading && (
        <span className="btn__icon">{rightIcon}</span>
      )}
    </button>
  );
}

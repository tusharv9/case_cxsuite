// ===== VIEW SWITCHER =====
// A segmented control between views of the same data (e.g. Card / List). Pure presentation: the caller owns the value.

import './ViewSwitcher.css';

/**
 * @param {{ value: string, label: string, icon?: React.ReactNode }[]} props.options
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 */
export function ViewSwitcher({ options, value, onChange, ariaLabel = 'Switch view' }) {
  return (
    <div className="view-switcher" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`view-switcher__btn ${value === o.value ? 'view-switcher__btn--active' : ''}`}
          onClick={() => onChange(o.value)}
          title={o.label}
        >
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

// ===== SECTION HEADER =====
import './SectionHeader.css';

export function SectionHeader({ title, subtitle, actions, className = '' }) {
  return (
    <div className={`section-header ${className}`}>
      <div className="section-header__text">
        <h3 className="section-header__title">{title}</h3>
        {subtitle && <p className="section-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="section-header__actions">{actions}</div>}
    </div>
  );
}

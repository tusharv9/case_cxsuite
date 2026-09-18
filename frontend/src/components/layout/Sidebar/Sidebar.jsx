// ===== SIDEBAR =====

import { NavLink } from 'react-router-dom';
import { LayoutDashboard, User, Briefcase, ChevronLeft, ShieldCheck, Settings } from 'lucide-react';
import { useCase } from '../../../contexts/CaseContext.jsx';
import { useApp } from '../../../contexts/AppContext.jsx';
import './Sidebar.css';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/customer360', label: 'Customer 360', icon: User },
  { to: '/case-management', label: 'Case Management', icon: Briefcase, showBoardCount: true },
  { to: '/case-audit', label: 'Audit Logs', icon: ShieldCheck },
  { to: '/configurable-settings', label: 'Configurable Settings', icon: Settings },
];

export function Sidebar() {
  const { boardCases } = useCase();
  const { isSidebarOpen, dispatch } = useApp();
  const openCount = boardCases.filter((c) => c.status !== 'Resolved').length || null;

  if (!isSidebarOpen) return null;

  return (
    <aside className="sidebar" aria-label="Main navigation">
      {/* Logo */}
      <div className="sidebar__logo">
        <div className="sidebar__logo-mark">OS</div>
        <div className="sidebar__logo-text">
          <span className="sidebar__logo-name">Omni Suite</span>
        </div>
        <button
          className="sidebar__collapse-btn"
          onClick={() => dispatch({ type: 'SET_SIDEBAR_OPEN', payload: false })}
          title="Collapse Sidebar"
          aria-label="Collapse sidebar"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `sidebar__nav-item${isActive ? ' sidebar__nav-item--active' : ''}`
            }
          >
            <span className="sidebar__nav-icon">
              <item.icon size={17} strokeWidth={1.8} />
            </span>
            <span className="sidebar__nav-label">{item.label}</span>
            {item.showBoardCount && openCount ? (
              <span className="sidebar__nav-badge">{openCount}</span>
            ) : null}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

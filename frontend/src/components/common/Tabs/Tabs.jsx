// ===== TABS COMPONENT =====

import { useState } from 'react';
import './Tabs.css';

/**
 * Tabs component
 * @param {Array} tabs - [{ key, label, count, content }]
 * @param {string} defaultTab - key of default active tab
 * @param {string} activeTab - controlled active tab key
 * @param {Function} onChange - called when tab changes
 */
export function Tabs({ tabs = [], defaultTab, activeTab: controlledTab, onChange }) {
  const [internalTab, setInternalTab] = useState(defaultTab || tabs[0]?.key);
  const active = controlledTab ?? internalTab;

  const handleClick = (key) => {
    setInternalTab(key);
    onChange?.(key);
  };

  const activeContent = tabs.find((t) => t.key === active)?.content;

  return (
    <div className="tabs">
      <nav className="tabs__nav" role="tablist" aria-label="Tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={active === tab.key}
            aria-controls={`tabpanel-${tab.key}`}
            id={`tab-${tab.key}`}
            className={`tabs__tab${active === tab.key ? ' tabs__tab--active' : ''}`}
            onClick={() => handleClick(tab.key)}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="tabs__count">{tab.count}</span>
            )}
          </button>
        ))}
      </nav>
      <div
        className="tabs__content scrollbar-thin"
        role="tabpanel"
        id={`tabpanel-${active}`}
        aria-labelledby={`tab-${active}`}
      >
        {activeContent}
      </div>
    </div>
  );
}

// ===== HEADER =====

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Menu } from 'lucide-react';
import { useApp } from '../../../contexts/AppContext.jsx';
import { Avatar } from '../../common/Avatar/Avatar.jsx';
import { searchService } from '../../../services/searchService.js';
import { userService } from '../../../services/userService.js';
import { notificationService } from '../../../services/notificationService.js';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue.js';
import {
  SEARCH_MIN_QUERY_LENGTH,
  SEARCH_DEBOUNCE_MS,
  NOTIFICATION_POLL_INTERVAL_MS,
} from '../../../constants/index.js';
import { NotificationsPopup } from './popups/NotificationsPopup.jsx';
import './popups/HeaderPopups.css';
import './Header.css';

function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain1.gain.setValueAtTime(0.08, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.15);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
    gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.08);
    osc2.stop(ctx.currentTime + 0.25);
  } catch (e) {
    // Graceful fallback if autoplay restricted
  }
}

export function Header() {
  const { currentUser, isSidebarOpen, dispatch } = useApp();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState('');
  const [customers, setCustomers] = useState([]);
  const [cases, setCases] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  // Monotonic id of the most recently issued search, used to discard stale responses.
  const latestSearchIdRef = useRef(0);

  // Status dropdown state
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const statusRef = useRef(null);
  
  // Popup state: 'notifications' | null
  const [activePopup, setActivePopup] = useState(null);
  const popupRef = useRef(null);

  // Unread Notification Count & Sound State
  const [unreadCount, setUnreadCount] = useState(0);
  const prevCountRef = useRef(0);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const count = await notificationService.getUnreadCount();
      if (count > prevCountRef.current && prevCountRef.current > 0) {
        playNotificationChime();
      }
      prevCountRef.current = count;
      setUnreadCount(count);
    } catch (e) {
      // Quiet fallback
    }
  }, []);

  // Poll the unread badge only while the tab is actually being looked at. A hidden tab cannot
  // show a badge or play a chime, so polling it just costs requests; on becoming visible again
  // we refresh immediately, which keeps the badge as fresh as it was before.
  useEffect(() => {
    let interval = null;

    const startPolling = () => {
      if (interval) return;
      interval = setInterval(fetchUnreadCount, NOTIFICATION_POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
        startPolling();
      } else {
        stopPolling();
      }
    };

    handleVisibilityChange();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchUnreadCount]);
  
  // Status is Available by default
  const currentStatus = currentUser?.status || 'Available';

  // Search runs on the server. Previously the header downloaded every customer and every case
  // on mount and filtered them in the browser; now a debounced request asks the backend for
  // just the handful of rows the dropdown shows.
  const debouncedSearch = useDebouncedValue(searchValue.trim(), SEARCH_DEBOUNCE_MS);

  useEffect(() => {
    if (debouncedSearch.length < SEARCH_MIN_QUERY_LENGTH) {
      setCustomers([]);
      setCases([]);
      return;
    }

    // Abort the previous request and ignore any response that is not the newest one, so a slow
    // early keystroke can never overwrite the results of a later, faster one.
    const controller = new AbortController();
    const requestId = ++latestSearchIdRef.current;

    searchService
      .search(debouncedSearch, { signal: controller.signal })
      .then((results) => {
        if (requestId !== latestSearchIdRef.current) return;
        setCustomers(results.customers);
        setCases(results.cases);
      })
      .catch((err) => {
        // The api interceptor re-wraps errors, so the cancellation marker lives on `original`.
        const wasCancelled =
          controller.signal.aborted ||
          err?.name === 'CanceledError' ||
          err?.original?.name === 'CanceledError';
        if (wasCancelled) return;
        if (requestId !== latestSearchIdRef.current) return;
        setCustomers([]);
        setCases([]);
      });

    return () => controller.abort();
  }, [debouncedSearch]);

  // Close dropdowns & popups when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
      if (statusRef.current && !statusRef.current.contains(event.target)) {
        setShowStatusDropdown(false);
      }
      if (popupRef.current && !popupRef.current.contains(event.target)) {
        setActivePopup(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStatusChange = async (newStatus) => {
    setShowStatusDropdown(false);
    if (currentStatus === newStatus) return;
    try {
      await userService.updateStatus(newStatus);
      if (currentUser) {
        dispatch({
          type: 'SET_CURRENT_USER',
          payload: { ...currentUser, status: newStatus }
        });
      }
    } catch (e) {
      console.error('Failed to update status:', e);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Available': return { bg: '#f0fdf4', border: '#bbf7d0', dot: '#16a34a', text: '#15803d' };
      case 'Busy':      return { bg: '#fef2f2', border: '#fecaca', dot: '#dc2626', text: '#b91c1c' };
      case 'Away':      return { bg: '#fffbeb', border: '#fde68a', dot: '#d97706', text: '#b45309' };
      default:          return { bg: '#f0fdf4', border: '#bbf7d0', dot: '#16a34a', text: '#15803d' };
    }
  };

  const statusColors = getStatusColor(currentStatus);

  const togglePopup = (popupType) => {
    setActivePopup((prev) => (prev === popupType ? null : popupType));
  };

  // Already filtered by the backend across the same fields the client-side filter used:
  // customer name/NRIC/phone, and case number/title/sub-case child id.
  const filteredCustomers = customers;
  const filteredCases = cases;

  const handleSelectCustomer = (id) => {
    setShowDropdown(false);
    setSearchValue('');
    localStorage.setItem('csm_selected_customer_id', id);
    navigate(`/customer360/${id}`);
  };

  const handleSelectCase = (id) => {
    setShowDropdown(false);
    setSearchValue('');
    navigate(`/case-management/${id}`);
  };

  const hasSuggestions = filteredCustomers.length > 0 || filteredCases.length > 0;

  return (
    <header className="header" role="banner">
      {!isSidebarOpen && (
        <button
          className="header__menu-btn"
          onClick={() => dispatch({ type: 'SET_SIDEBAR_OPEN', payload: true })}
          title="Open Sidebar"
          aria-label="Open sidebar"
        >
          <Menu size={18} />
        </button>
      )}

      {/* Search Bar matching Reference Screenshot 1 */}
      <div className="header__search" ref={dropdownRef}>
        <span className="header__search-icon">
          <Search size={15} />
        </span>
        <input
          id="header-search"
          className="header__search-input"
          type="search"
          placeholder="Search customer, case, NRIC, phone..."
          value={searchValue}
          onChange={(e) => {
            setSearchValue(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          aria-label="Global search"
        />
        <kbd className="header__search-kbd">⌘K</kbd>

        {showDropdown && hasSuggestions && (
          <div className="header__search-dropdown scrollbar-thin">
            {filteredCustomers.length > 0 && (
              <div className="header__search-section">
                <div className="header__search-section-title">Customers</div>
                {filteredCustomers.map((c) => (
                  <div
                    key={c.id}
                    className="header__search-item"
                    onClick={() => handleSelectCustomer(c.id)}
                  >
                    <span className="header__search-item-title">{c.fullName}</span>
                    <span className="header__search-item-sub">NRIC {c.nric}</span>
                  </div>
                ))}
              </div>
            )}
            {filteredCases.length > 0 && (
              <div className="header__search-section">
                <div className="header__search-section-title">Cases</div>
                {filteredCases.map((c) => (
                  <div
                    key={c.id}
                    className="header__search-item"
                    onClick={() => handleSelectCase(c.id)}
                  >
                    <span className="header__search-item-title">{c.caseNumber}</span>
                    <span className="header__search-item-sub">{c.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right controls */}
      <div className="header__controls" ref={popupRef}>
        {/* Agent Status */}
        <div className="header__status-container" ref={statusRef}>
          <div 
            className="header__status" 
            role="button" 
            aria-label={`Agent status: ${currentStatus}`}
            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            style={{ backgroundColor: statusColors.bg, borderColor: statusColors.border }}
          >
            <span className="header__status-dot" style={{ backgroundColor: statusColors.dot, boxShadow: `0 0 0 2px ${statusColors.dot}33` }} />
            <span className="header__status-text" style={{ color: statusColors.text }}>{currentStatus}</span>
          </div>

          {showStatusDropdown && (
            <div className="header__status-dropdown">
              {['Available', 'Busy', 'Away'].map((status) => {
                const colors = getStatusColor(status);
                return (
                  <div 
                    key={status} 
                    className={`header__status-option ${currentStatus === status ? 'header__status-option--active' : ''}`}
                    onClick={() => handleStatusChange(status)}
                  >
                    <span className="header__status-dot" style={{ backgroundColor: colors.dot }} />
                    {status}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="header__divider" />

        {/* Notifications Icon Button */}
        <div style={{ position: 'relative' }}>
          <button
            className={`header__icon-btn ${activePopup === 'notifications' ? 'header__icon-btn--active' : ''}`}
            aria-label="Notifications"
            onClick={() => togglePopup('notifications')}
            style={{ position: 'relative' }}
          >
            <Bell size={17} strokeWidth={1.8} />
            {unreadCount > 0 && (
              <span className="header__bell-badge">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          {activePopup === 'notifications' && (
            <NotificationsPopup
              onClose={() => setActivePopup(null)}
              onRefreshUnread={fetchUnreadCount}
            />
          )}
        </div>

        <div className="header__divider" />

        {/* User Profile Container */}
        {currentUser && (
          <div className="header__user" aria-label={`Logged in as ${currentUser.name}`}>
            <Avatar name={currentUser.name} size="sm" style={{ backgroundColor: '#1d4ed8', color: '#ffffff' }} />
            <div className="header__user-info">
              <span className="header__user-name">{currentUser.name}</span>
              <span className="header__user-role" title={currentUser.role}>
                {currentUser.role}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

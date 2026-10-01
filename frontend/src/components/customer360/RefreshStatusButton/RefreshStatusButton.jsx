// ===== REFRESH STATUS BUTTON COMPONENT =====

import { useState } from 'react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { useToast } from '../../../hooks/useToast.js';
import './RefreshStatusButton.css';

export function RefreshStatusButton({ onRefresh }) {
  const toast = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState('refreshed just now');

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);

    try {
      if (onRefresh) {
        await onRefresh();
      }

      const timeString = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });

      setLastRefreshed(`refreshed at ${timeString}`);
      toast.success('Customer 360 data refreshed successfully.');
    } catch (e) {
      toast.error('Failed to refresh data.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="refresh-status-container">
      <button
        className={`refresh-status-btn ${isRefreshing ? 'refresh-status-btn--loading' : ''}`}
        onClick={handleRefresh}
        disabled={isRefreshing}
        title="Click to refresh Customer 360 view"
      >
        <RefreshCw size={13} className={isRefreshing ? 'spin-icon' : ''} />
        <span>{isRefreshing ? 'Refreshing data...' : 'Refresh Status'}</span>
      </button>

      <span className="refresh-status-timestamp">
        <CheckCircle2 size={12} className="check-icon" />
        {lastRefreshed}
      </span>
    </div>
  );
}

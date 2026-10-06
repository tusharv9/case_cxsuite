// ===== UNIFIED NOTIFICATIONS POPUP (WORKFLOW + AUDIT) =====

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, PlusCircle, UserCheck, AlertTriangle, CheckCircle, FileText, Check, ArrowRight, Clock, GitMerge, Link as LinkIcon, RefreshCw, X } from 'lucide-react';
import { notificationService } from '../../../../services/notificationService.js';
import { caseService } from '../../../../services/caseService.js';
import { Skeleton } from '../../../common/Skeleton/Skeleton.jsx';

function formatRelativeTime(dateString) {
  if (!dateString) return 'Just now';
  const now = new Date();
  const date = new Date(dateString);
  const diffSecs = Math.floor((now - date) / 1000);

  if (diffSecs < 60) return 'Just now';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function NotificationsPopup({ onClose, onRefreshUnread }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const unreadCount = items.filter(i => !i.isRead).length;

  const loadNotifications = async () => {
    try {
      setIsLoading(true);
      const res = await notificationService.getNotifications({ page: 1, pageSize: 15 });
      let list = res?.items || (Array.isArray(res) ? res : []);
      
      // Fallback: If no notifications exist in DB yet, query audit events safely
      if (list.length === 0) {
        try {
          const auditRes = await caseService.getAuditLogs({ page: 1, pageSize: 10 });
          const auditItems = auditRes?.items || (Array.isArray(auditRes) ? auditRes : []);
          list = auditItems.map(a => ({
            id: a?.id || Math.random().toString(),
            type: a?.actionType || 'AUDIT',
            title: a?.actionLabel || 'Audit Activity',
            message: a?.description || `Action performed on ${a?.caseNumber || 'case'}`,
            caseId: a?.caseId,
            caseNumber: a?.caseNumber,
            isRead: false,
            createdAt: a?.timestamp
          }));
        } catch (e) {
          list = [];
        }
      }

      setItems(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const renderPriorityBadge = (priority) => {
    const p = (priority || 'High').toUpperCase();
    let bg = '#ffedd5', text = '#c2410c', border = '#fed7aa';
    if (p === 'CRITICAL') { bg = '#fee2e2'; text = '#dc2626'; border = '#fca5a5'; }
    else if (p === 'MEDIUM') { bg = '#fef3c7'; text = '#b45309'; border = '#fde68a'; }
    else if (p === 'LOW' || p === 'INFO') { bg = '#eff6ff'; text = '#1d4ed8'; border = '#bfdbfe'; }
    return (
      <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: bg, color: text, border: `1px solid ${border}`, textTransform: 'uppercase', letterSpacing: '0.04em', marginLeft: 6 }}>
        {p}
      </span>
    );
  };

  const getNotificationIcon = (type) => {
    const t = (type || '').toUpperCase();
    if (t.includes('SLA_BREACH') || t.includes('ESCALAT') || t.includes('UNASSIGNED')) return <AlertTriangle size={15} color="#dc2626" />;
    if (t.includes('SLA_APPROACH') || t.includes('SLA_REMINDER')) return <Clock size={15} color="#d97706" />;
    if (t.includes('ASSIGN')) return <UserCheck size={15} color="#2563eb" />;
    if (t.includes('REOPEN')) return <RefreshCw size={15} color="#0284c7" />;
    if (t.includes('SUBCASE') || t.includes('LINK')) return <LinkIcon size={15} color="#7c3aed" />;
    if (t.includes('MERGE')) return <GitMerge size={15} color="#9333ea" />;
    if (t.includes('RESOLV')) return <CheckCircle size={15} color="#16a34a" />;
    if (t.includes('CREATE')) return <PlusCircle size={15} color="#2563eb" />;
    return <ShieldCheck size={15} color="#4b5563" />;
  };

  const handleItemClick = async (item) => {
    if (!item.isRead) {
      try {
        await notificationService.markAsRead(item.id);
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, isRead: true } : i));
        onRefreshUnread?.();
      } catch (e) {
        // Ignore API failure
      }
    }
    onClose();
    if (item.caseId) {
      navigate(`/case-management/${item.caseId}`);
    } else {
      navigate('/case-audit');
    }
  };

  const handleDeleteItem = async (e, item) => {
    e.stopPropagation();
    const previousItems = [...items];

    // Optimistically remove item from UI immediately
    setItems(prev => prev.filter(i => i.id !== item.id));
    onRefreshUnread?.();

    try {
      await notificationService.deleteNotification(item.id);
    } catch (err) {
      console.error('Failed to dismiss notification:', err);
      // Restore on API error
      setItems(previousItems);
      onRefreshUnread?.();
    }
  };

  const handleMarkAllRead = async () => {
    try {
      setIsMarkingAll(true);
      await notificationService.markAllAsRead();
      setItems(prev => prev.map(i => ({ ...i, isRead: true })));
      onRefreshUnread?.();
    } catch (e) {
      console.error('Failed to mark all as read:', e);
    } finally {
      setIsMarkingAll(false);
    }
  };

  return (
    <div className="header-popup notifications-popup animate-fadeIn">
      {/* Header Bar */}
      <div className="notifications-popup__header">
        <h4 className="notifications-popup__title">Notifications</h4>
        {unreadCount > 0 && (
          <span className="notifications-popup__count-badge">{unreadCount} unread</span>
        )}
      </div>

      {/* Body List */}
      <div className="notifications-popup__body scrollbar-thin">
        {isLoading ? (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Skeleton height="50px" borderRadius="8px" count={3} />
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: '30px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
            No notifications available.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`notifications-popup__item ${!item.isRead ? 'notifications-popup__item--unread' : ''}`}
              onClick={() => handleItemClick(item)}
              style={{ cursor: 'pointer', position: 'relative' }}
            >
              <div className="notifications-popup__icon-box">
                {getNotificationIcon(item.type)}
              </div>
              <div className="notifications-popup__content">
                <div className="notifications-popup__item-title-row">
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="notifications-popup__item-title">
                      {item.title || item.type}
                    </span>
                    {item.priority && renderPriorityBadge(item.priority)}
                  </div>
                  <span className="notifications-popup__item-time">
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>
                <p className="notifications-popup__item-desc">
                  {item.message}
                </p>
              </div>
              <button
                type="button"
                className="notifications-popup__dismiss-btn"
                onClick={(e) => handleDeleteItem(e, item)}
                title="Dismiss notification"
                aria-label="Dismiss notification"
              >
                <X size={13} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="notifications-popup__footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          className="notifications-popup__btn-mark"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0 || isMarkingAll}
        >
          {unreadCount === 0 ? <><Check size={14} /> Marked all read</> : 'Mark all read'}
        </button>
        <button
          className="notifications-popup__btn-mark"
          onClick={() => {
            onClose();
            navigate('/case-audit');
          }}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#1d4ed8', fontWeight: 600 }}
        >
          View Audit Logs <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

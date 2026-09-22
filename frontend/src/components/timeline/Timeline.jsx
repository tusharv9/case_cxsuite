// ===== TIMELINE COMPONENT WITH REAL DELIVERY TAGS & INTERACTION BOX =====

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  GitCommitHorizontal, FileText, Users, ArrowRightLeft,
  AlertTriangle, CheckCircle2, Plus, Send, AtSign,
  Lock, MessageSquare, Bot, User
} from 'lucide-react';
import { EVENT_TYPE_LABELS, EVENT_TYPE_COLORS } from '../../constants/index.js';
import { formatDateTime, formatTimeAgo } from '../../utils/dateUtils.js';
import { EmptyState } from '../common/Loader/Loader.jsx';
import { Avatar } from '../common/Avatar/Avatar.jsx';
import { caseService } from '../../services/caseService.js';
import { userService } from '../../services/userService.js';
import { useToast } from '../../hooks/useToast.js';
import './Timeline.css';

const EVENT_ICONS = {
  Create:   <Plus size={13} />,
  Assign:   <GitCommitHorizontal size={13} />,
  Note:     <FileText size={13} />,
  Cowork:   <Users size={13} />,
  Transfer: <ArrowRightLeft size={13} />,
  Escalate: <AlertTriangle size={13} />,
  Resolve:  <CheckCircle2 size={13} />,
};

/**
 * Parses and renders message text, highlighting @mentions with clickable/styled tags.
 */
export function renderMessageWithMentions(text) {
  if (!text) return null;

  // Split text by @mentions (matches @Word or @First Last up to 2 words or single tokens)
  const mentionRegex = /(@[A-Za-z0-9_]+(?:\s[A-Za-z0-9_]+)?)/g;
  const parts = text.split(mentionRegex);

  return parts.map((part, index) => {
    if (part.startsWith('@')) {
      return (
        <span key={index} className="timeline-mention">
          {part}
        </span>
      );
    }
    return part;
  });
}

export function TimelineItem({ event }) {
  const label = EVENT_TYPE_LABELS[event.eventType] || event.eventType;
  const colors = EVENT_TYPE_COLORS[event.eventType] || { color: '#4b5563', bg: '#f3f4f6' };
  const icon = EVENT_ICONS[event.eventType] || <GitCommitHorizontal size={13} />;

  // Determine delivery status/scope:
  // - "sent to customer" (if customer reply / outgoing message)
  // - "internal" (if internal note or collaboration note)
  // - "system" (if automated system event or isInternal is null)
  let scopeTag = null;
  if (event.isInternal === false) {
    scopeTag = (
      <span className="timeline-scope-pill timeline-scope-pill--customer">
        &bull; sent to customer{event.channel ? ` &middot; ${event.channel}` : ''}
      </span>
    );
  } else if (event.isInternal === true) {
    scopeTag = (
      <span className="timeline-scope-pill timeline-scope-pill--internal">
        &bull; internal
      </span>
    );
  } else {
    scopeTag = (
      <span className="timeline-scope-pill timeline-scope-pill--system">
        &bull; system
      </span>
    );
  }

  const authorName = event.user?.name || (event.eventType === 'Create' ? 'System' : 'System Automation');
  const authorRole = event.user?.role || '';
  const isSystem = !event.user && (event.isInternal === null || event.eventType === 'Create');

  return (
    <div className={`timeline-item ${event.isInternal === false ? 'timeline-item--customer' : ''}`}>
      <div
        className="timeline-item__dot"
        style={{ backgroundColor: colors.bg, borderColor: colors.color + '44', color: colors.color }}
      >
        {icon}
      </div>

      <div className="timeline-item__body">
        <div className="timeline-item__meta-row">
          <div className="timeline-item__author-info">
            {isSystem ? (
              <span className="timeline-item__system-icon">
                <Bot size={13} />
              </span>
            ) : (
              <span className="timeline-item__user-icon">
                <User size={13} />
              </span>
            )}
            <strong className="timeline-item__author-name">{authorName}</strong>
            {authorRole && (
              <span className="timeline-item__author-role">({authorRole})</span>
            )}
          </div>

          <span className="timeline-item__time-separator">&middot;</span>
          <span className="timeline-item__time" title={formatDateTime(event.createdAt)}>
            {formatTimeAgo(event.createdAt)}
          </span>

          {scopeTag}
        </div>

        <div className={`timeline-item__bubble ${event.isInternal === false ? 'timeline-item__bubble--customer' : ''}`}>
          <p className="timeline-item__bubble-text">
            {renderMessageWithMentions(event.message)}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Interactive Timeline Interaction Box:
 * Allows posting Internal Notes or Customer Replies with channel pill & @mentions
 */
export function TimelineInteractionBox({
  caseId,
  channel = 'Email',
  users = [],
  onSuccess
}) {
  const [activeTab, setActiveTab] = useState('internal'); // 'internal' | 'customer'
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allUsers, setAllUsers] = useState(users);

  // Mention suggestions state
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionPosition, setMentionPosition] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);

  const textareaRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (!users || users.length === 0) {
      userService.getAllUsers().then((res) => {
        if (Array.isArray(res)) setAllUsers(res);
      }).catch(() => {});
    } else {
      setAllUsers(users);
    }
  }, [users]);

  // Compute suggestions when @ is active
  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLowerCase();
    return allUsers
      .filter((u) => u.name && u.name.toLowerCase().includes(query))
      .slice(0, 5);
  }, [mentionQuery, allUsers]);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setMessage(val);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtMatch = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);

    if (lastAtMatch) {
      setMentionQuery(lastAtMatch[1]);
      setMentionPosition(lastAtMatch.index);
      setSelectedMentionIndex(0);
    } else {
      setMentionQuery(null);
      setMentionPosition(-1);
    }
  };

  const handleSelectMention = (user) => {
    if (mentionPosition === -1) return;
    const textBeforeMention = message.slice(0, mentionPosition);
    const textAfterCursor = message.slice(textareaRef.current?.selectionStart || message.length);
    const firstName = user.name.split(' ')[0] || user.name;
    const updated = `${textBeforeMention}@${firstName} ${textAfterCursor}`;
    setMessage(updated);
    setMentionQuery(null);
    setMentionPosition(-1);

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
  };

  const handleKeyDown = (e) => {
    if (mentionQuery !== null && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex((prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectMention(mentionSuggestions[selectedMentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const isInternal = activeTab === 'internal';
    const channelToUse = isInternal ? null : (channel || 'Voice');

    try {
      await caseService.addTimelineInteraction(caseId, {
        message: message.trim(),
        isInternal,
        channel: channelToUse,
      });

      toast.success(isInternal ? 'Internal note added' : `Customer reply sent via ${channelToUse}`);
      setMessage('');
      setMentionQuery(null);
      onSuccess?.();
    } catch (err) {
      toast.error(err.message || 'Failed to post interaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const insertAtMention = () => {
    const cursorPos = textareaRef.current?.selectionStart || message.length;
    const updated = message.slice(0, cursorPos) + '@' + message.slice(cursorPos);
    setMessage(updated);
    setMentionQuery('');
    setMentionPosition(cursorPos);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursorPos + 1, cursorPos + 1);
    }, 50);
  };

  return (
    <div className="timeline-interaction-box">
      {/* Tab Selectors */}
      <div className="timeline-interaction-box__tabs">
        <button
          type="button"
          className={`timeline-interaction-tab ${activeTab === 'internal' ? 'active' : ''}`}
          onClick={() => setActiveTab('internal')}
          id="timeline-tab-internal"
        >
          <Lock size={12} />
          <span>Internal note</span>
        </button>

        <button
          type="button"
          className={`timeline-interaction-tab ${activeTab === 'customer' ? 'active' : ''}`}
          onClick={() => setActiveTab('customer')}
          id="timeline-tab-customer"
        >
          <MessageSquare size={12} />
          <span>Customer reply &bull; {channel || 'Voice'}</span>
        </button>
      </div>

      {/* Input container with @mention popup */}
      <div className="timeline-interaction-box__input-wrapper">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={
            activeTab === 'internal'
              ? 'Write an internal note... Use @ to mention team members'
              : `Reply to customer via ${channel || 'Voice'}...`
          }
          rows={3}
          className="timeline-interaction-textarea"
          id="timeline-interaction-input"
        />

        {/* Mention Suggestions Popover */}
        {mentionQuery !== null && mentionSuggestions.length > 0 && (
          <div className="timeline-mention-popup" role="listbox">
            <div className="timeline-mention-popup__header">
              <span>Suggested Co-workers</span>
            </div>
            {mentionSuggestions.map((u, idx) => (
              <button
                key={u.id}
                type="button"
                role="option"
                aria-selected={idx === selectedMentionIndex}
                className={`timeline-mention-popup__item ${idx === selectedMentionIndex ? 'selected' : ''}`}
                onClick={() => handleSelectMention(u)}
              >
                <Avatar name={u.name} size="xs" />
                <div className="timeline-mention-popup__item-info">
                  <span className="timeline-mention-popup__name">{u.name}</span>
                  <span className="timeline-mention-popup__meta">
                    {u.role ? `${u.role} · ` : ''}{u.team || u.departmentName || 'Agent'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer controls */}
      <div className="timeline-interaction-box__footer">
        <div className="timeline-interaction-box__hints">
          <button
            type="button"
            className="timeline-interaction-mention-btn"
            onClick={insertAtMention}
            title="Mention a co-worker (@)"
          >
            <AtSign size={13} />
            <span>Mention</span>
          </button>
          <span className="timeline-interaction-shortcut">Ctrl+Enter to send</span>
        </div>

        <button
          type="button"
          className="timeline-interaction-send-btn"
          onClick={handleSubmit}
          disabled={!message.trim() || isSubmitting}
          id="timeline-send-button"
        >
          <Send size={13} />
          <span>{isSubmitting ? 'Sending...' : 'Send'}</span>
        </button>
      </div>
    </div>
  );
}

export function Timeline({
  events = [],
  caseId,
  channel = 'Email',
  users = [],
  onSuccess,
  showInteraction = true
}) {
  // Sort events chronologically descending (newest to oldest)
  const sorted = useMemo(() => {
    return [...events].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [events]);

  return (
    <div className="timeline-container">
      {showInteraction && caseId && (
        <TimelineInteractionBox
          caseId={caseId}
          channel={channel}
          users={users}
          onSuccess={onSuccess}
        />
      )}

      <div className="timeline-feed-header">
        <span className="timeline-feed-title">Recent Activity</span>
        <span className="timeline-feed-count">&middot; {sorted.length} {sorted.length === 1 ? 'event' : 'events'}</span>
      </div>

      <div className="timeline" role="list" aria-label="Case timeline">
        {sorted.length > 0 ? (
          sorted.map((event) => (
            <TimelineItem key={event.id} event={event} />
          ))
        ) : (
          <EmptyState
            title="No events yet"
            description="Timeline will appear here as interactions and actions are taken."
          />
        )}
      </div>
    </div>
  );
}

// ===== CASE COLLABORATION DRAWER =====

import { useState, useEffect, useRef } from 'react';
import { X, Zap, UserPlus, Send, MessageSquare, ShieldAlert, Check } from 'lucide-react';
import { Modal } from '../../common/Modal/Modal.jsx';
import { Avatar } from '../../common/Avatar/Avatar.jsx';
import { Button } from '../../common/Button/Button.jsx';
import { useToast } from '../../../hooks/useToast.js';
import { caseService } from '../../../services/caseService.js';
import { userService } from '../../../services/userService.js';
import { formatFullDateTime } from '../../../utils/dateUtils.js';
import { ConfirmDialog } from '../../common/ConfirmDialog/ConfirmDialog.jsx';
import './CollaborationDrawer.css';

export function CollaborationDrawer({
  isOpen,
  onClose,
  caseId,
  caseData,
  users: propUsers = [],
  onSuccess,
}) {
  const toast = useToast();
  const activeCaseId = caseId || caseData?.id;
  const [users, setUsers] = useState(propUsers);
  const [selectedWatcherId, setSelectedWatcherId] = useState('');
  const [isAddingWatcher, setIsAddingWatcher] = useState(false);
  const [isRequestingSwarm, setIsRequestingSwarm] = useState(false);
  const [message, setMessage] = useState('');
  const [isPostingMessage, setIsPostingMessage] = useState(false);
  const [pendingRemoveUser, setPendingRemoveUser] = useState(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // @Mention state
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionPosition, setMentionPosition] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (propUsers && propUsers.length > 0) {
      setUsers(propUsers);
    }
  }, [propUsers]);

  useEffect(() => {
    if (isOpen) {
      if (!users || users.length === 0) {
        userService.getAllUsers().then(setUsers).catch(() => {});
      }
    }
  }, [isOpen]);

  if (!isOpen || !caseData) return null;

  const participants = caseData.participants || [];
  const existingParticipantIds = participants.map((p) => String(p.userId));

  // Available agents not yet collaborators or owner
  const availableUsers = users.filter(
    (u) =>
      String(u.id) !== String(caseData.ownerId) &&
      !existingParticipantIds.includes(String(u.id))
  );

  // Mention suggestions filter
  const mentionSuggestions = mentionQuery !== null
    ? users.filter((u) =>
        u.name.toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  const handleInputChange = (e) => {
    const val = e.target.value;
    setMessage(val);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtMatch = textBeforeCursor.match(/@([a-zA-Z0-9_\.\-]*)$/);

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
    const textAfterCursor = message.slice(inputRef.current?.selectionStart || message.length);
    const firstName = user.name.split(' ')[0] || user.name;
    const updated = `${textBeforeMention}@${firstName} ${textAfterCursor}`;
    setMessage(updated);
    setMentionQuery(null);
    setMentionPosition(-1);

    setTimeout(() => {
      inputRef.current?.focus();
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

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePostMessage();
    }
  };

  const handleAddWatcher = async (userId) => {
    if (!userId || !activeCaseId) return;
    setIsAddingWatcher(true);
    try {
      await caseService.addCoworkers(activeCaseId, { coworkerIds: [userId] });
      toast.success('Collaborator added to case.');
      setSelectedWatcherId('');
      onSuccess?.();
    } catch (err) {
      toast.error(err.message || 'Failed to add collaborator.');
    } finally {
      setIsAddingWatcher(false);
    }
  };

  const handleRequestSwarm = async () => {
    if (!activeCaseId) return;
    setIsRequestingSwarm(true);
    try {
      const res = await caseService.requestSwarm(activeCaseId);
      toast.success(res.message || 'Swarm requested successfully!');
      onSuccess?.();
    } catch (err) {
      toast.error(err.message || 'Failed to request swarm.');
    } finally {
      setIsRequestingSwarm(false);
    }
  };

  const handlePostMessage = async () => {
    if (!message.trim() || !activeCaseId) return;
    setIsPostingMessage(true);
    try {
      await caseService.addTimelineInteraction(activeCaseId, {
        message: message.trim(),
        isInternal: true,
      });
      setMessage('');
      toast.success('Internal note posted.');
      onSuccess?.();
    } catch (err) {
      toast.error(err.message || 'Failed to post note.');
    } finally {
      setIsPostingMessage(false);
    }
  };

  const confirmRemoveUser = async () => {
    if (!pendingRemoveUser || !activeCaseId) return;
    setIsRemoving(true);
    try {
      await caseService.removeCoworker(activeCaseId, pendingRemoveUser.userId);
      toast.success(`${pendingRemoveUser.userName || 'Collaborator'} removed.`);
      setPendingRemoveUser(null);
      onSuccess?.();
    } catch (err) {
      toast.error(err.message || 'Failed to remove collaborator.');
    } finally {
      setIsRemoving(false);
    }
  };

  const insertAtMention = () => {
    const cursorPos = inputRef.current?.selectionStart || message.length;
    const updated = message.slice(0, cursorPos) + '@' + message.slice(cursorPos);
    setMessage(updated);
    setMentionQuery('');
    setMentionPosition(cursorPos);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(cursorPos + 1, cursorPos + 1);
    }, 50);
  };

  // Filter for Swarm events and agent notes / mentions only (exclude automated system logs)
  const isSwarmEvent = (e) => {
    const msg = (e.message || '').toLowerCase();
    return msg.includes('swarm') || e.eventType === 'Cowork';
  };

  const isAgentMessage = (e) => {
    const author = (e.user?.name || e.userName || '').toLowerCase();
    const isSystem = !e.user && (!author || author.includes('system') || author.includes('automation'));
    if (isSystem) return false;
    const msg = e.message || '';
    return e.isInternal === true || msg.includes('@') || e.eventType === 'Note';
  };

  const collaborationEvents = (caseData.events || [])
    .filter((e) => isSwarmEvent(e) || isAgentMessage(e))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Case Collaboration"
        subtitle={`${caseData.caseNumber || ''} • Staff Only · Internal Swarm & Discussions`}
        size="lg"
      >
        {/* Watchers / Swarm Action Bar with distinct gap */}
        <div className="collaboration-drawer__swarm-bar">
          <div className="collaboration-drawer__watchers-group">
            <span className="collaboration-drawer__watchers-label">WATCHERS</span>
            <div className="collaboration-drawer__avatar-stack">
              {participants.length > 0 ? (
                participants.map((p) => (
                  <div
                    key={p.userId}
                    className="collaboration-drawer__avatar-wrapper"
                    title={`${p.userName} (${p.role})`}
                  >
                    <Avatar name={p.userName} size="sm" />
                  </div>
                ))
              ) : (
                <span className="collaboration-drawer__no-watchers">None</span>
              )}
            </div>

            <div className="collaboration-drawer__add-watcher-select-wrap">
              <select
                className="collaboration-drawer__add-watcher-select"
                value={selectedWatcherId}
                disabled={isAddingWatcher}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedWatcherId(val);
                  if (val) handleAddWatcher(val);
                }}
              >
                <option value="">+ Add watcher...</option>
                {availableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role || u.departmentName || 'Agent'})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="collaboration-drawer__swarm-btn-wrap">
            <Button
              variant="outline"
              className="collaboration-drawer__swarm-btn"
              isLoading={isRequestingSwarm}
              leftIcon={<Zap size={14} className="swarm-zap-icon" />}
              onClick={handleRequestSwarm}
              title="Escalate case attention, pulling in Team Lead and Subject Matter Experts"
            >
              Request swarm
            </Button>
          </div>
        </div>

        {/* Collaborators Detailed Management */}
        {participants.length > 0 && (
          <div className="collaboration-drawer__participants-section">
            <p className="drawer-section-label">ACTIVE COLLABORATORS ({participants.length})</p>
            <div className="collaboration-drawer__participants-list">
              {participants.map((p) => (
                <div key={p.userId} className="collaboration-participant-item">
                  <Avatar name={p.userName} size="sm" />
                  <div className="collaboration-participant-item__info">
                    <p className="collaboration-participant-item__name">{p.userName}</p>
                    <span className="collaboration-participant-item__role">{p.role}</span>
                  </div>
                  <button
                    className="collaboration-participant-item__remove-btn"
                    title="Remove collaborator"
                    onClick={() => setPendingRemoveUser(p)}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TOP COMPOSER — Positioned at the top of the discussion */}
        <div className="collaboration-drawer__composer">
          <div className="collaboration-drawer__composer-wrapper">
            <textarea
              ref={inputRef}
              className="collaboration-drawer__composer-textarea"
              placeholder="Post an internal note or mention a colleague with @Name..."
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isPostingMessage}
              rows={3}
              id="collaboration-composer-input"
            />

            {/* Mention Suggestions Floating Popup */}
            {mentionQuery !== null && mentionSuggestions.length > 0 && (
              <div className="collaboration-drawer__mention-menu">
                <p className="collaboration-drawer__mention-menu-header">Mention team member</p>
                {mentionSuggestions.map((u, idx) => (
                  <div
                    key={u.id}
                    className={`collaboration-drawer__mention-item ${idx === selectedMentionIndex ? 'selected' : ''}`}
                    onClick={() => handleSelectMention(u)}
                  >
                    <Avatar name={u.name} size="xs" />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{u.name}</span>
                      <span style={{ fontSize: 10, color: '#64748b' }}>{u.role || u.email}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="collaboration-drawer__composer-footer">
            <div className="collaboration-drawer__composer-tools">
              <button
                type="button"
                className="collaboration-drawer__tool-btn"
                onClick={insertAtMention}
                title="Mention a team member"
              >
                <UserPlus size={13} />
                <span>Mention</span>
              </button>
              <span className="collaboration-drawer__shortcut-hint">Ctrl+Enter to post</span>
            </div>

            <Button
              variant="primary"
              className="collaboration-drawer__post-btn"
              isLoading={isPostingMessage}
              disabled={!message.trim()}
              onClick={handlePostMessage}
              leftIcon={<Send size={13} />}
            >
              Post Note
            </Button>
          </div>
        </div>

        {/* Discussion Stream (Newest First) */}
        <div className="collaboration-drawer__stream scrollbar-thin">
          <div className="collaboration-drawer__stream-header">
            <span className="collaboration-drawer__stream-title">
              COLLABORATION DISCUSSION &amp; SWARM EVENTS
            </span>
            <span className="collaboration-drawer__stream-count">
              &middot; {collaborationEvents.length} {collaborationEvents.length === 1 ? 'event' : 'events'} (Newest first)
            </span>
          </div>

          {collaborationEvents.length === 0 ? (
            <div className="collaboration-drawer__empty-stream">
              <div className="collaboration-drawer__empty-icon">
                <MessageSquare size={28} strokeWidth={1.5} color="#3b82f6" />
              </div>
              <p className="collaboration-drawer__empty-title">No internal discussions or swarm events yet</p>
              <p className="collaboration-drawer__empty-desc">
                Post an internal note above, request a swarm, or mention a colleague with @Name to collaborate.
              </p>
            </div>
          ) : (
            <div className="collaboration-drawer__message-list">
              {collaborationEvents.map((evt) => {
                const isSwarm = (evt.message || '').toLowerCase().includes('swarm');
                const authorName = evt.user?.name || evt.userName || (isSwarm ? 'Swarm Automation' : 'Staff');
                const authorRole = evt.user?.role || (isSwarm ? 'System Action' : 'Collaborator');

                return (
                  <div key={evt.id} className={`collaboration-message-item ${isSwarm ? 'collaboration-message-item--swarm-wrap' : ''}`}>
                    <div className={`collaboration-message-item__dot ${isSwarm ? 'collaboration-message-item__dot--swarm' : ''}`} />
                    <div className="collaboration-message-item__content">
                      <div className="collaboration-message-item__header">
                        <Avatar name={authorName} size="xs" />
                        <span className="collaboration-message-item__author">
                          {authorName}
                        </span>
                        <span className="collaboration-message-item__role">
                          ({authorRole})
                        </span>
                        <span className="collaboration-message-item__time-dot">&middot;</span>
                        <span className="collaboration-message-item__time">
                          {formatFullDateTime(evt.createdAt)}
                        </span>
                      </div>
                      <div className={`collaboration-message-item__bubble ${isSwarm ? 'collaboration-message-item__bubble--swarm' : ''}`}>
                        {isSwarm && <Zap size={14} className="collaboration-message-item__swarm-zap" />}
                        <p className="collaboration-message-item__text">
                          {renderMessageWithMentions(evt.message)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(pendingRemoveUser)}
        title="Remove Collaborator"
        message={`Are you sure you want to remove ${pendingRemoveUser?.userName || 'this collaborator'} from case collaboration?`}
        confirmLabel="Remove"
        isBusy={isRemoving}
        onCancel={() => setPendingRemoveUser(null)}
        onConfirm={confirmRemoveUser}
      />
    </>
  );
}

function renderMessageWithMentions(text) {
  if (!text) return null;
  const parts = text.split(/(@[a-zA-Z0-9_\.\-]+)/g);
  return parts.map((part, index) => {
    if (part.startsWith('@')) {
      return (
        <span key={index} className="collaboration-message-item__mention">
          {part}
        </span>
      );
    }
    return part;
  });
}

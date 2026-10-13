// ===== CASE COLLABORATION DRAWER =====

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Zap, UserPlus, Send, MessageSquare } from 'lucide-react';
import { Modal } from '../../common/Modal/Modal.jsx';
import { Avatar } from '../../common/Avatar/Avatar.jsx';
import { Button } from '../../common/Button/Button.jsx';
import { Input, Textarea, Checkbox, Select } from '../../common/Input/Input.jsx';
import { selectPlaceholder } from '../../../utils/fieldValidation.js';
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
  const [isSwarmModalOpen, setIsSwarmModalOpen] = useState(false);
  const [swarmReason, setSwarmReason] = useState('');
  const [selectedSwarmUserIds, setSelectedSwarmUserIds] = useState([]);
  const [swarmSearch, setSwarmSearch] = useState('');
  const [message, setMessage] = useState('');
  const [isPostingMessage, setIsPostingMessage] = useState(false);
  const [pendingRemoveUser, setPendingRemoveUser] = useState(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // @Mention state
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionPosition, setMentionPosition] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const inputRef = useRef(null);

  // ---- Collaboration feed (collaboration-only activity, not the case workflow timeline) ----
  const [feed, setFeed] = useState({ collaborators: null, activities: [], hasMore: false });
  const [isFeedLoading, setIsFeedLoading] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const loadFeed = useCallback(async () => {
    if (!activeCaseId) return;
    setIsFeedLoading(true);
    try {
      const data = await caseService.getCollaboration(activeCaseId);
      setFeed({
        collaborators: data.collaborators || [],
        activities: data.activities || [],
        hasMore: Boolean(data.hasMore),
      });
    } catch (err) {
      toast.error(err.message || 'Failed to load collaboration activity.');
    } finally {
      setIsFeedLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCaseId]);

  const loadOlder = async () => {
    const oldest = feed.activities[feed.activities.length - 1];
    if (!oldest || !activeCaseId) return;
    setIsLoadingOlder(true);
    try {
      const data = await caseService.getCollaboration(activeCaseId, { before: oldest.createdAt });
      setFeed((prev) => ({
        ...prev,
        activities: [...prev.activities, ...(data.activities || [])],
        hasMore: Boolean(data.hasMore),
      }));
    } catch (err) {
      toast.error(err.message || 'Failed to load older activity.');
    } finally {
      setIsLoadingOlder(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadFeed();
  }, [isOpen, loadFeed]);

  // After any collaboration change: refresh this feed and let the case drawer refresh itself.
  const afterChange = () => {
    loadFeed();
    onSuccess?.();
  };

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

  const participants = feed.collaborators ?? caseData.participants ?? [];
  const existingParticipantIds = participants.map((p) => String(p.userId));

  // Available agents not yet collaborators or owner
  const availableUsers = users.filter(
    (u) =>
      String(u.id) !== String(caseData.ownerId) &&
      !existingParticipantIds.includes(String(u.id))
  );

  const filteredSwarmUsers = !swarmSearch.trim()
    ? availableUsers
    : availableUsers.filter((u) => {
        const q = swarmSearch.toLowerCase().trim();
        return (
          (u.name && u.name.toLowerCase().includes(q)) ||
          (u.role && u.role.toLowerCase().includes(q)) ||
          (u.departmentName && u.departmentName.toLowerCase().includes(q))
        );
      });

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
      afterChange();
    } catch (err) {
      toast.error(err.message || 'Failed to add collaborator.');
    } finally {
      setIsAddingWatcher(false);
    }
  };

  const handleConfirmSwarm = async () => {
    if (!activeCaseId) return;
    setIsRequestingSwarm(true);
    try {
      const payload = {
        reason: swarmReason.trim() || undefined,
        participantUserIds: selectedSwarmUserIds.length > 0 ? selectedSwarmUserIds : undefined,
      };
      const res = await caseService.requestSwarm(activeCaseId, payload);
      toast.success(res?.message || 'Swarm requested successfully!');
      setIsSwarmModalOpen(false);
      setSwarmReason('');
      setSelectedSwarmUserIds([]);
      afterChange();
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
      await caseService.addCollaborationNote(activeCaseId, message.trim());
      setMessage('');
      toast.success('Collaboration note posted.');
      loadFeed();
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
      afterChange();
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

  const activities = feed.activities;

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
              <Select
                aria-label="Add a watcher"
                placeholder={`+ ${selectPlaceholder('Watcher')}`}
                value={selectedWatcherId}
                disabled={isAddingWatcher}
                isLoading={isAddingWatcher}
                emptyText={availableUsers.length === 0 ? 'Everyone available is already watching.' : 'No matching people'}
                options={availableUsers.map((u) => ({ value: u.id, label: `${u.name} (${u.role || u.departmentName || 'Agent'})`, searchText: u.email }))}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedWatcherId(val);
                  if (val) handleAddWatcher(val);
                }}
              />
            </div>
          </div>

          <div className="collaboration-drawer__swarm-btn-wrap">
            <Button
              variant="outline"
              className="collaboration-drawer__swarm-btn"
              isLoading={isRequestingSwarm}
              leftIcon={<Zap size={14} className="swarm-zap-icon" />}
              onClick={() => setIsSwarmModalOpen(true)}
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
              placeholder="Post a collaboration note or mention a colleague with @Name..."
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
              <span className="collaboration-drawer__shortcut-hint">Enter to post · Shift+Enter for a new line</span>
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

        {/* Collaboration activity (newest first) — collaborator changes, notes and swarm requests only */}
        <div className="collaboration-drawer__stream scrollbar-thin">
          <div className="collaboration-drawer__stream-header">
            <span className="collaboration-drawer__stream-title">
              COLLABORATION ACTIVITY
            </span>
            <span className="collaboration-drawer__stream-count">
              &middot; {activities.length}{feed.hasMore ? '+' : ''} {activities.length === 1 ? 'entry' : 'entries'} (Newest first)
            </span>
          </div>

          {isFeedLoading && activities.length === 0 ? (
            <div className="collaboration-drawer__empty-stream">
              <p className="collaboration-drawer__empty-desc">Loading collaboration activity…</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="collaboration-drawer__empty-stream">
              <div className="collaboration-drawer__empty-icon">
                <MessageSquare size={28} strokeWidth={1.5} color="#3b82f6" />
              </div>
              <p className="collaboration-drawer__empty-title">No collaboration activity yet</p>
              <p className="collaboration-drawer__empty-desc">
                Add a collaborator, post a collaboration note, or request a swarm to start collaborating.
              </p>
            </div>
          ) : (
            <div className="collaboration-drawer__message-list">
              {activities.map((act) => {
                const isSwarm = act.activityType === 'SwarmRequested';
                const hasBubble = Boolean(act.content);
                return (
                  <div key={act.id} className={`collaboration-message-item ${isSwarm ? 'collaboration-message-item--swarm-wrap' : ''}`}>
                    <div className={`collaboration-message-item__dot ${isSwarm ? 'collaboration-message-item__dot--swarm' : ''}`} />
                    <div className="collaboration-message-item__content">
                      <div className="collaboration-message-item__header">
                        <Avatar name={act.actorName || 'Staff'} size="xs" />
                        <span className="collaboration-message-item__author">
                          {describeActivity(act)}
                        </span>
                        <span className="collaboration-message-item__time-dot">&middot;</span>
                        <span className="collaboration-message-item__time">
                          {formatFullDateTime(act.createdAt)}
                        </span>
                      </div>
                      {hasBubble && (
                        <div className={`collaboration-message-item__bubble ${isSwarm ? 'collaboration-message-item__bubble--swarm' : ''}`}>
                          {isSwarm && <Zap size={14} className="collaboration-message-item__swarm-zap" />}
                          <p className="collaboration-message-item__text">
                            {renderMessageWithMentions(act.content)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {feed.hasMore && (
                <Button variant="ghost" size="sm" isLoading={isLoadingOlder} onClick={loadOlder}>
                  Show older activity
                </Button>
              )}
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

      {/* Dynamic Swarm Participant Selection Modal */}
      <Modal
        isOpen={isSwarmModalOpen}
        onClose={() => setIsSwarmModalOpen(false)}
        title="Mobilize Case Swarm"
        subtitle={`${caseData.caseNumber || ''} • Escalate attention and pull in senior specialists or leads`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsSwarmModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={isRequestingSwarm}
              leftIcon={<Zap size={14} className="swarm-zap-icon" />}
              onClick={handleConfirmSwarm}
            >
              {selectedSwarmUserIds.length > 0
                ? `Mobilize Swarm (${selectedSwarmUserIds.length} Selected)`
                : 'Mobilize Swarm (Auto-Resolve Leads & SMEs)'}
            </Button>
          </>
        }
      >
        <div className="action-modal-form">
          <div className="transfer-explanation-banner">
            <Zap size={18} color="#f59e0b" />
            <span>Requesting a swarm elevates case priority and brings designated participants directly into this collaboration channel.</span>
          </div>

          <Textarea
            label="Swarm Justification / Objective"
            rows={3}
            placeholder="Describe why swarm escalation is requested (e.g. Critical SLA breach risk, complex cross-system bug)..."
            value={swarmReason}
            onChange={(e) => setSwarmReason(e.target.value)}
          />

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <p className="form-label" style={{ margin: 0 }}>
                Select Specific Participants ({selectedSwarmUserIds.length} selected)
              </p>
            </div>

            <div style={{ marginBottom: 10 }}>
              <Input
                placeholder="Search specialists by name, role, or department..."
                value={swarmSearch}
                onChange={(e) => setSwarmSearch(e.target.value)}
              />
            </div>

            {selectedSwarmUserIds.length === 0 && (
              <p style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', margin: '0 0 10px' }}>
                💡 No participants selected. The system will automatically mobilize the department Team Lead and senior SMEs. Or pick specific users below:
              </p>
            )}

            <div className="user-select-list scrollbar-thin" style={{ maxHeight: 220 }}>
              {filteredSwarmUsers.length === 0 ? (
                <p className="user-select-empty">No matching users available.</p>
              ) : (
                filteredSwarmUsers.map((user) => {
                  const isChecked = selectedSwarmUserIds.includes(user.id);
                  return (
                    <div
                      key={user.id}
                      className={`user-select-card ${isChecked ? 'user-select-card--selected' : ''}`}
                      onClick={() => {
                        setSelectedSwarmUserIds((prev) =>
                          prev.includes(user.id) ? prev.filter((id) => id !== user.id) : [...prev, user.id]
                        );
                      }}
                    >
                      <Checkbox checked={isChecked} onChange={() => {}} />
                      <Avatar name={user.name} size="sm" />
                      <div className="user-select-card__info">
                        <span className="user-select-card__name">{user.name}</span>
                        <span className="user-select-card__role">
                          {user.role || 'Specialist'} {user.departmentName ? `• ${user.departmentName}` : ''}
                        </span>
                      </div>
                      <span
                        className={`status-dot-indicator ${
                          user.status?.toLowerCase() === 'available'
                            ? 'status-dot-indicator--online'
                            : 'status-dot-indicator--offline'
                        }`}
                        title={user.status || 'Available'}
                      />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

// One readable sentence per collaboration activity, e.g. "Mukul added Shivam as a collaborator."
function describeActivity(act) {
  const actor = act.actorName || 'A user';
  const target = act.targetName || 'a user';
  switch (act.activityType) {
    case 'CollaboratorAdded':
      return `${actor} added ${target} as a collaborator.`;
    case 'CollaboratorRemoved':
      return `${actor} removed ${target} as a collaborator.`;
    case 'NoteAdded':
      return `${actor} added a note:`;
    case 'SwarmRequested':
      return act.content ? `${actor} requested a swarm:` : `${actor} requested a swarm.`;
    default:
      return actor;
  }
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

// ===== CASE ACTIONS MODALS — OmniConnect Reference System =====

import { useState, useEffect, useMemo } from 'react';
import { Modal } from '../../common/Modal/Modal.jsx';
import { Button } from '../../common/Button/Button.jsx';
import { Input, Textarea, Select, Checkbox } from '../../common/Input/Input.jsx';
import { Avatar } from '../../common/Avatar/Avatar.jsx';
import { caseService } from '../../../services/caseService.js';
import { useToast } from '../../../hooks/useToast.js';
import {
  RESOLVE_DISPOSITIONS,
  LINK_RELATIONSHIPS,
} from '../../../constants/index.js';
import { AlertTriangle, ShieldAlert, ArrowRight, Layers } from 'lucide-react';
import { slaRoutingService } from '../../../services/slaRoutingService.js';
import './actions.css';

// User Select Card Component for List Selection
function UserSelectList({ users, selectedId, onSelect }) {
  if (!users || users.length === 0) {
    return <p className="user-select-empty">No available users found.</p>;
  }

  return (
    <div className="user-select-list scrollbar-thin">
      {users.map((user) => {
        const isSelected = String(user.id) === String(selectedId);
        const isAvailable = user.status?.toLowerCase() === 'available';

        return (
          <div
            key={user.id}
            className={`user-select-card ${isSelected ? 'user-select-card--selected' : ''}`}
            onClick={() => onSelect(user.id)}
          >
            <Avatar name={user.name} size="sm" />
            <div className="user-select-card__info">
              <span className="user-select-card__name">{user.name}</span>
              <span className="user-select-card__role">{user.role || 'Agent'}</span>
            </div>
            <div className="user-select-card__right">
              <span className={`status-dot-indicator ${isAvailable ? 'status-dot-indicator--online' : 'status-dot-indicator--offline'}`} title={user.status || 'Offline'} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 1. ASSIGN / REASSIGN MODAL
// ============================================================
export function AssignModal({
  isOpen,
  onClose,
  caseId,
  caseData,
  users = [],
  currentOwnerId,
  onSuccess,
}) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [reason, setReason] = useState('Escalation');
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      setSelectedUserId(currentOwnerId || '');
      setReason('Escalation');
    }
  }, [isOpen, currentOwnerId]);

  const selectedUser = users.find((u) => String(u.id) === String(selectedUserId));

  const handleConfirm = async () => {
    if (!selectedUserId) {
      return toast.error('Please select an agent to assign.');
    }
    if (!reason) {
      return toast.error('Please select a reason.');
    }
    setIsLoading(true);
    try {
      await caseService.assignCase(caseId, { ownerId: selectedUserId, reason });
      toast.success('Case reassigned successfully.');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const caseRef = caseData?.caseNumber || '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={caseRef ? `Reassign case ${caseRef}` : 'Reassign case'}
      subtitle="Select an agent to take ownership of this case"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={isLoading}
            disabled={!selectedUserId}
            onClick={handleConfirm}
          >
            {isLoading ? 'Assigning...' : 'Assign'}
          </Button>
        </>
      }
    >
      <div className="action-modal-form">
        <Select
          label="Assign to"
          required
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
        >
          <option value="">Select agent...</option>
          {users.map((u) => {
            const teamInfo = u.team ? ` — ${u.team}` : '';
            const statusInfo = u.status ? ` (${u.status})` : '';
            return (
              <option key={u.id} value={u.id}>
                {u.name} — {u.role || 'Agent'}{teamInfo}{statusInfo}
              </option>
            );
          })}
        </Select>

        {selectedUser && (
          <div className="agent-preview-card">
            <div className="agent-preview-card__header">
              <Avatar name={selectedUser.name} size="sm" />
              <div className="agent-preview-card__name-group">
                <span className="agent-preview-card__name">{selectedUser.name}</span>
                <span className="agent-preview-card__status">
                  <span
                    className={`status-dot ${
                      selectedUser.status?.toLowerCase() === 'available'
                        ? 'status-dot--online'
                        : selectedUser.status?.toLowerCase() === 'busy'
                        ? 'status-dot--busy'
                        : 'status-dot--away'
                    }`}
                  />
                  {selectedUser.status || 'Available'}
                </span>
              </div>
            </div>
            <div className="agent-preview-card__details">
              <div className="agent-preview-card__row">
                <span className="agent-preview-card__label">Role:</span>
                <span className="agent-preview-card__val">{selectedUser.role || 'Agent'}</span>
              </div>
              <div className="agent-preview-card__row">
                <span className="agent-preview-card__label">Team:</span>
                <span className="agent-preview-card__val">{selectedUser.team || '—'}</span>
              </div>
              <div className="agent-preview-card__row">
                <span className="agent-preview-card__label">Queue:</span>
                <span className="agent-preview-card__val">{selectedUser.queue || '—'}</span>
              </div>
            </div>
          </div>
        )}

        <Select
          label="Reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="Escalation">Escalation</option>
          <option value="Workload rebalancing">Workload rebalancing</option>
          <option value="Specialist required">Specialist required</option>
          <option value="Shift handover">Shift handover</option>
          <option value="Leave / absence coverage">Leave / absence coverage</option>
          <option value="Customer request">Customer request</option>
        </Select>
      </div>
    </Modal>
  );
}

// ============================================================
// 2. TRANSFER DEPARTMENT MODAL
// ============================================================
export function TransferModal({
  isOpen,
  onClose,
  caseId,
  caseData,
  departments = [],
  onSuccess,
}) {
  const [transferTo, setTransferTo] = useState('Queue');
  const [targetQueue, setTargetQueue] = useState('Tier 2 - General Escalations (4 waiting)');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [reason, setReason] = useState('Skill / product expertise');
  const [handoverNote, setHandoverNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      setTransferTo('Queue');
      setTargetQueue('Tier 2 - General Escalations (4 waiting)');
      setSelectedDeptId(departments[0]?.id || '');
      setReason('Skill / product expertise');
      setHandoverNote('');
    }
  }, [isOpen, departments]);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await caseService.transferDepartment(caseId, {
        departmentId: transferTo === 'Department' ? selectedDeptId : undefined,
        transferTo,
        targetQueue,
        reason,
        handoverNote: handoverNote.trim(),
      });
      toast.success('Case transferred successfully.');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const caseRef = caseData?.caseNumber || '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={caseRef ? `Transfer case ${caseRef}` : 'Transfer case'}
      subtitle="Transfer case ownership to another team or queue"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={isLoading}
            onClick={handleConfirm}
          >
            {isLoading ? 'Transferring...' : '⇄ Transfer Case'}
          </Button>
        </>
      }
    >
      <div className="action-modal-form">
        {/* SLA Explanation banner */}
        <div className="transfer-explanation-banner">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <span>SLA clock keeps running — transfers never reset targets</span>
        </div>

        <Select
          label="Transfer to"
          required
          value={transferTo}
          onChange={(e) => setTransferTo(e.target.value)}
        >
          <option value="Queue">Queue</option>
          <option value="Department">Department</option>
          <option value="Team">Team</option>
        </Select>

        {transferTo === 'Department' ? (
          <Select
            label="Target Department"
            required
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
          >
            <option value="">Select target department...</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </Select>
        ) : (
          <Select
            label="Target queue"
            required
            value={targetQueue}
            onChange={(e) => setTargetQueue(e.target.value)}
          >
            <option value="Tier 2 - General Escalations (4 waiting)">Tier 2 - General Escalations (4 waiting)</option>
            <option value="Dispute Resolution & Chargebacks (7 waiting)">Dispute Resolution & Chargebacks (7 waiting)</option>
            <option value="Fraud & Security Review (2 waiting)">Fraud & Security Review (2 waiting)</option>
            <option value="MicroFinance Tier 2 (1 waiting)">MicroFinance Tier 2 (1 waiting)</option>
            <option value="Digital Support Specialist (3 waiting)">Digital Support Specialist (3 waiting)</option>
            <option value="Underwriting Review (5 waiting)">Underwriting Review (5 waiting)</option>
          </Select>
        )}

        <Select
          label="Reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="Skill / product expertise">Skill / product expertise</option>
          <option value="Misrouted case">Misrouted case</option>
          <option value="Language requirement">Language requirement</option>
          <option value="Escalation to Tier 2">Escalation to Tier 2</option>
          <option value="Workload rebalancing">Workload rebalancing</option>
          <option value="Customer request">Customer request</option>
        </Select>

        <Textarea
          label="Handover note (shown to receiving team)"
          rows={3}
          placeholder="Include relevant context, customer sentiment, or urgency..."
          value={handoverNote}
          onChange={(e) => setHandoverNote(e.target.value)}
        />
      </div>
    </Modal>
  );
}

// ============================================================
// 3. CO-WORKER MODAL
// ============================================================
export function CoworkerModal({
  isOpen,
  onClose,
  caseId,
  users = [],
  departments = [],
  existingCoworkerIds = [],
  onSuccess,
}) {
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      setSelectedDeptId('');
      setSelectedUserIds([]);
    }
  }, [isOpen]);

  const deptUsers = useMemo(() => {
    if (!selectedDeptId) return [];
    return users.filter((u) => String(u.departmentId) === String(selectedDeptId));
  }, [users, selectedDeptId]);

  const toggleUserSelect = (userId) => {
    if (existingCoworkerIds.includes(userId)) return;
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleConfirm = async () => {
    if (!selectedDeptId) {
      return toast.error('Please select a department first.');
    }
    if (selectedUserIds.length === 0) {
      return toast.error('Please select at least one co-worker.');
    }
    setIsLoading(true);
    try {
      await caseService.addCoworkers(caseId, { coworkerIds: selectedUserIds });
      toast.success(`${selectedUserIds.length} Co-worker(s) added successfully.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Co-workers"
      subtitle="Select department and team members to collaborate on this case"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" isLoading={isLoading} onClick={handleConfirm}>
            Add Selected Co-workers
          </Button>
        </>
      }
    >
      <div className="action-modal-form">
        <Select
          label="Select Department (Compulsory)"
          required
          value={selectedDeptId}
          onChange={(e) => setSelectedDeptId(e.target.value)}
        >
          <option value="">Select department...</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>

        <div>
          <p className="form-label" style={{ marginBottom: 6 }}>
            Select Team Members ({selectedUserIds.length} selected)
          </p>
          {!selectedDeptId ? (
            <div style={{ padding: 20, textAlign: 'center', background: '#f8fafc', borderRadius: 8, color: '#64748b', fontSize: 13 }}>
              Please select a department above to load eligible team members.
            </div>
          ) : (
            <div className="user-select-list scrollbar-thin">
              {deptUsers.length === 0 ? (
                <p className="user-select-empty">No team members found for this department.</p>
              ) : (
                deptUsers.map((user) => {
                  const isAlreadyCoworker = existingCoworkerIds.includes(user.id);
                  const isChecked = selectedUserIds.includes(user.id);

                  return (
                    <div
                      key={user.id}
                      className={`user-select-card ${isChecked ? 'user-select-card--selected' : ''} ${isAlreadyCoworker ? 'user-select-card--disabled' : ''}`}
                      onClick={() => toggleUserSelect(user.id)}
                    >
                      <Checkbox
                        checked={isChecked || isAlreadyCoworker}
                        disabled={isAlreadyCoworker}
                        onChange={() => {}}
                      />
                      <Avatar name={user.name} size="sm" />
                      <div className="user-select-card__info">
                        <span className="user-select-card__name">{user.name}</span>
                        <span className="user-select-card__role">{user.departmentName || 'Agent'}</span>
                      </div>
                      {isAlreadyCoworker && (
                        <span className="badge-pill badge-pill--cowork">Already Added</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// 4. ESCALATE MODAL
// ============================================================
export function EscalateModal({
  isOpen,
  onClose,
  caseId,
  caseData = null,
  users = [],
  departments = [],
  onSuccess,
}) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [reason, setReason] = useState('SLA Breach / Risk');
  const [customReason, setCustomReason] = useState('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [escalationStatus, setEscalationStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen && caseId) {
      setSelectedUserId('');
      setReason('SLA Breach / Risk');
      setCustomReason('');
      setNote('');
      setStatusLoading(true);
      slaRoutingService.getCaseEscalationStatus(caseId)
        .then((status) => {
          setEscalationStatus(status);
          if (status?.nextTargetUserId) {
            setSelectedUserId(status.nextTargetUserId);
          }
        })
        .catch((err) => {
          console.error('[EscalateModal Status Error]', err);
        })
        .finally(() => setStatusLoading(false));
    }
  }, [isOpen, caseId]);

  const selectedUser = useMemo(() => {
    return users.find((u) => String(u.id) === String(selectedUserId));
  }, [users, selectedUserId]);

  const handleConfirm = async () => {
    if (escalationStatus?.isMaxLevel) {
      return toast.error('Case is already at maximum escalation level.');
    }
    const targetId = selectedUserId || escalationStatus?.nextTargetUserId;
    if (!targetId) {
      return toast.error('Please select who to escalate this case to.');
    }
    if (!reason) {
      return toast.error('Please select an escalation reason.');
    }
    if (reason === 'Other' && !customReason.trim()) {
      return toast.error('Please specify custom reason.');
    }
    const finalReason = reason === 'Other' ? customReason.trim() : reason;

    setIsLoading(true);
    try {
      await caseService.escalateCase(caseId, {
        reason: finalReason,
        note: note.trim() || undefined,
        targetUserId: targetId,
      });
      toast.success('Case escalated successfully.');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to escalate case.');
    } finally {
      setIsLoading(false);
    }
  };

  const ESCALATION_OPTIONS = [
    'SLA Breach / Risk',
    'Complex Technical Issue',
    'Customer Complaint Repeat',
    'Regulatory / Compliance',
    'Management Escalation',
    'Fraud Risk',
    'Other',
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Escalate Case"
      subtitle="Sequential escalation matrix — requires non-empty justification and logs audit record"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={isLoading}
            disabled={statusLoading || escalationStatus?.isMaxLevel || (!selectedUserId && !escalationStatus?.nextTargetUserId)}
            onClick={handleConfirm}
          >
            Escalate Case
          </Button>
        </>
      }
    >
      <div className="action-modal-form">
        {statusLoading && (
          <div style={{ padding: '12px', textAlign: 'center', fontSize: '13px', color: '#64748b' }}>
            Checking escalation matrix status…
          </div>
        )}

        {/* Max Level Notice */}
        {escalationStatus?.isMaxLevel && (
          <div style={{ padding: '14px 18px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#b91c1c', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={20} style={{ flexShrink: 0 }} />
            <div>
              <strong>Maximum Escalation Tier Reached</strong>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#7f1d1d' }}>
                {escalationStatus.maxLevelNotice || 'This case has reached the maximum configured escalation level and cannot be escalated further.'}
              </p>
            </div>
          </div>
        )}

        {/* Sequential Escalation Trajectory Card */}
        {escalationStatus && !escalationStatus.isMaxLevel && (
          <div style={{ padding: '14px 18px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#1e40af', letterSpacing: '0.04em' }}>Current Tier</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e3a8a' }}>{escalationStatus.currentLevelName || `Level ${escalationStatus.currentLevel}`}</div>
            </div>
            <ArrowRight size={20} color="#2563eb" />
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: '#1e40af', letterSpacing: '0.04em' }}>Next Authority Tier</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1d4ed8' }}>
                {escalationStatus.nextLevelName || `Level ${escalationStatus.nextLevel}`}
              </div>
              <div style={{ fontSize: '11px', color: '#4b5563' }}>Role: {escalationStatus.nextTargetRole}</div>
            </div>
          </div>
        )}

        {/* Step 1: Who to escalate to */}
        {!escalationStatus?.isMaxLevel && (
          <>
            <Select
              label="Escalate To (Target Assignee)"
              required
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Select person to escalate to...</option>
              {escalationStatus?.nextTargetUserId && (
                <option value={escalationStatus.nextTargetUserId}>
                  ★ Matrix Recommended: {escalationStatus.nextTargetUserName} ({escalationStatus.nextTargetRole})
                </option>
              )}
              {users.map((u) => {
                const teamInfo = u.team ? ` — ${u.team}` : '';
                const statusInfo = u.status ? ` (${u.status})` : '';
                return (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.role || 'Agent'}{teamInfo}{statusInfo}
                  </option>
                );
              })}
            </Select>

            {/* Selected User Preview */}
            {selectedUser && (
              <div className="agent-preview-card">
                <div className="agent-preview-card__header">
                  <Avatar name={selectedUser.name} size="sm" />
                  <div className="agent-preview-card__name-group">
                    <span className="agent-preview-card__name">{selectedUser.name}</span>
                    <span className="agent-preview-card__status">
                      <span
                        className={`status-dot ${
                          selectedUser.status?.toLowerCase() === 'available'
                            ? 'status-dot--online'
                            : selectedUser.status?.toLowerCase() === 'busy'
                            ? 'status-dot--busy'
                            : 'status-dot--away'
                        }`}
                      />
                      {selectedUser.status || 'Available'}
                    </span>
                  </div>
                </div>
                <div className="agent-preview-card__details">
                  <div className="agent-preview-card__row">
                    <span className="agent-preview-card__label">Role:</span>
                    <span className="agent-preview-card__val">{selectedUser.role || 'Agent'}</span>
                  </div>
                  <div className="agent-preview-card__row">
                    <span className="agent-preview-card__label">Team:</span>
                    <span className="agent-preview-card__val">{selectedUser.team || '—'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Escalation Reason */}
            <Select
              label="Escalation Reason (Mandatory)"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {ESCALATION_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>

            {reason === 'Other' && (
              <Input
                label="Please specify reason"
                required
                placeholder="Describe the escalation reason..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
              />
            )}

            {/* Step 3: Additional Notes */}
            <div>
              <label className="form-label" style={{ marginBottom: 6, display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Additional Notes / Justification (Optional)
              </label>
              <Textarea
                rows={3}
                placeholder="Add context, actions already taken, or why this level is requested…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ============================================================
// 5. ADD NOTE MODAL
// ============================================================
export function NoteModal({ isOpen, onClose, caseId, onSuccess }) {
  const [message, setMessage] = useState('');
  const [makerChecker, setMakerChecker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      setMessage('');
      setMakerChecker(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!message.trim()) return toast.error('Please enter a note.');
    setIsLoading(true);
    try {
      await caseService.addNote(caseId, { message: message.trim() });
      toast.success('Note added to timeline.');
      onSuccess?.();
      setMessage('');
      setMakerChecker(false);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Add Note"
      subtitle="Note will be appended to the workflow timeline"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" isLoading={isLoading} onClick={handleConfirm}>
            Add Note
          </Button>
        </>
      }
    >
      <div className="action-modal-form">
        <Textarea
          label="Note"
          required
          placeholder="Enter your note here..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          autoFocus
        />
        <Checkbox
          label="Requires Maker-Checker Approval"
          checked={makerChecker}
          onChange={(e) => setMakerChecker(e.target.checked)}
        />
      </div>
    </Modal>
  );
}

// ============================================================
// 6. LINK CASE MODAL (Simplified Select Case -> Link Case)
// ============================================================
export function LinkCaseModal({ isOpen, onClose, caseId, caseData, onSuccess }) {
  const [caseRef, setCaseRef] = useState('');
  const [relatedCases, setRelatedCases] = useState([]);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen && caseId) {
      setCaseRef('');
      setIsLoadingRelated(true);
      caseService
        .getRelatedCustomerCases(caseId)
        .then((data) => setRelatedCases(data || []))
        .catch(() => setRelatedCases([]))
        .finally(() => setIsLoadingRelated(false));
    }
  }, [isOpen, caseId]);

  const handleConfirm = async () => {
    if (!caseRef) {
      return toast.error('Please select a case to link.');
    }
    setIsLoading(true);
    try {
      const res = await caseService.linkCase(caseId, {
        relationshipType: 'Relates to',
        targetCaseNumber: caseRef,
      });
      const childIdMsg = res?.childId ? ` (Sub-Case ID: ${res.childId})` : '';
      toast.success(`Case linked successfully${childIdMsg}.`);
      onSuccess?.();
      setCaseRef('');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to link case.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Link Case"
      subtitle={caseData?.customerName ? `Associate with other cases for ${caseData.customerName}` : 'Associate with other customer cases'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={isLoading}
            disabled={!caseRef}
            onClick={handleConfirm}
          >
            Link Case
          </Button>
        </>
      }
    >
      <div className="action-modal-form">
        {/* Customer Cases List (Directly Selectable) */}
        <div>
          <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
            Other Cases for this Customer {isLoadingRelated ? '(Loading...)' : `(${relatedCases.length})`}
          </label>
          {isLoadingRelated ? (
            <p style={{ fontSize: 13, color: '#94a3b8', padding: 8 }}>Loading customer cases...</p>
          ) : relatedCases.length === 0 ? (
            <p style={{ fontSize: 12.5, color: '#94a3b8', fontStyle: 'italic', padding: 6 }}>
              No other cases found for this customer to link.
            </p>
          ) : (
            <div className="related-cases-container scrollbar-thin">
              {relatedCases.map((rc) => {
                const isSelected = caseRef === rc.caseNumber;
                return (
                  <div
                    key={rc.id}
                    className={`related-case-item ${isSelected ? 'related-case-item--selected' : ''} ${rc.isAlreadyLinked ? 'related-case-item--linked' : ''}`}
                    onClick={() => {
                      if (!rc.isAlreadyLinked) {
                        setCaseRef(isSelected ? '' : rc.caseNumber);
                      }
                    }}
                    role="button"
                    tabIndex={rc.isAlreadyLinked ? -1 : 0}
                    aria-pressed={isSelected}
                    title={rc.isAlreadyLinked ? 'Already linked to this case' : `Click to select ${rc.caseNumber}`}
                  >
                    <div className="related-case-item__content">
                      <div className="related-case-item__header-line">
                        <span className="related-case-item__ref">{rc.caseNumber}</span>
                        <span className="related-case-item__type">{rc.caseType || 'Complaint'}</span>
                      </div>
                      <p className="related-case-item__title">{rc.title}</p>
                    </div>
                    <div className="related-case-item__badges">
                      {rc.isAlreadyLinked ? (
                        <span className="badge-pill badge-pill--cowork" style={{ fontSize: 10, padding: '2px 8px' }}>
                          ALREADY LINKED
                        </span>
                      ) : (
                        <span className="badge-pill" style={{ fontSize: 10, padding: '2px 8px', textTransform: 'uppercase', fontWeight: 600 }}>
                          {rc.status}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// 7. RESOLVE MODAL (Primary Brand Blue Button)
// ============================================================
export function ResolveModal({ isOpen, onClose, caseId, onSuccess }) {
  const [disposition, setDisposition] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      setDisposition('');
      setResolutionNote('');
      setNotifyCustomer(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!disposition) return toast.error('Please select a disposition.');
    setIsLoading(true);
    try {
      await caseService.resolveCase(caseId, {
        disposition,
        resolutionNote: resolutionNote.trim(),
      });
      toast.success('Case resolved successfully.');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Resolve Case"
      subtitle="Closing this case — please provide resolution details"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={isLoading}
            onClick={handleConfirm}
          >
            Resolve Case
          </Button>
        </>
      }
    >
      <div className="action-modal-form">
        <Select
          label="Disposition"
          required
          value={disposition}
          onChange={(e) => setDisposition(e.target.value)}
        >
          <option value="">Select disposition...</option>
          {RESOLVE_DISPOSITIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <Textarea
          label="Resolution Note"
          placeholder="Summarise the resolution..."
          value={resolutionNote}
          onChange={(e) => setResolutionNote(e.target.value)}
          rows={3}
        />
        <Checkbox
          label="Notify Customer via Email/SMS"
          checked={notifyCustomer}
          onChange={(e) => setNotifyCustomer(e.target.checked)}
        />
      </div>
    </Modal>
  );
}

// ============================================================
// 8. REOPEN CASE MODAL (Generates Sub-Case ID e.g. C-00045-R01)
// ============================================================
export function ReopenModal({ isOpen, onClose, caseId, onSuccess }) {
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      setMessage('');
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!message.trim()) return toast.error('Please enter a reason for reopening.');
    setIsLoading(true);
    try {
      const res = await caseService.reopenCase(caseId, { message: message.trim() });
      const childIdMsg = res?.childId ? ` (Sub-Case ID: ${res.childId})` : '';
      toast.success(`Case reopened successfully${childIdMsg}.`);
      onSuccess?.();
      setMessage('');
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Reopen Case"
      subtitle="Reopen a resolved case and reset its SLA (Generates Sub-Case ID e.g. C-00045-R01)"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" isLoading={isLoading} onClick={handleConfirm}>
            Reopen Case
          </Button>
        </>
      }
    >
      <div className="action-modal-form">
        <Textarea
          label="Reason for Reopening"
          required
          placeholder="Enter reason here..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          autoFocus
        />
      </div>
    </Modal>
  );
}

// ===== CASE ACTIONS MODALS — OmniConnect Reference System =====

import { useState, useEffect, useMemo } from 'react';
import { Modal } from '../../common/Modal/Modal.jsx';
import { Button } from '../../common/Button/Button.jsx';
import { Input, Textarea, Select, Checkbox } from '../../common/Input/Input.jsx';
import { Avatar } from '../../common/Avatar/Avatar.jsx';
import { caseService } from '../../../services/caseService.js';
import { configurableSettingsService } from '../../../services/configurableSettingsService.js';
import { useToast } from '../../../hooks/useToast.js';
import {
  ESCALATION_REASONS,
  RESOLVE_DISPOSITIONS,
  LINK_RELATIONSHIPS,
} from '../../../constants/index.js';
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
  users = [],
  currentOwnerId,
  onSuccess,
}) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      setSelectedUserId(currentOwnerId || '');
    }
  }, [isOpen, currentOwnerId]);

  const handleConfirm = async () => {
    if (!selectedUserId) {
      return toast.error('Please select a user to assign.');
    }
    setIsLoading(true);
    try {
      await caseService.assignCase(caseId, { ownerId: selectedUserId });
      toast.success('Case assigned successfully.');
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
      title="Assign / Reassign Owner"
      subtitle="Select an agent to take ownership of this case"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" isLoading={isLoading} onClick={handleConfirm}>
            Confirm Assignment
          </Button>
        </>
      }
    >
      <div className="action-modal-form">
        <label className="form-label form-label--required">Select Owner</label>
        <UserSelectList
          users={users}
          selectedId={selectedUserId}
          onSelect={setSelectedUserId}
        />
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
  departments = [],
  onSuccess,
}) {
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      setSelectedDeptId('');
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!selectedDeptId) {
      return toast.error('Please select a target department.');
    }
    setIsLoading(true);
    try {
      await caseService.transferDepartment(caseId, { departmentId: selectedDeptId });
      toast.success('Case transferred to new department.');
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
      title="Transfer Department"
      subtitle="Transfer case ownership to another department"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" isLoading={isLoading} onClick={handleConfirm}>
            Transfer Case
          </Button>
        </>
      }
    >
      <div className="action-modal-form">
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
/**
 * Substitutes the escalation template placeholders configured under
 * Configurable Settings -> Case Management -> Escalation Templates.
 * Unknown placeholders are left untouched so a typo is visible rather than silently dropped.
 */
export function applyEscalationPlaceholders(template, values) {
  if (!template) return '';
  return template.replace(/\{(caseNumber|customerName|departmentName|severity)\}/g, (match, key) => {
    const value = values[key];
    return value === undefined || value === null || value === '' ? match : String(value);
  });
}

export function EscalateModal({
  isOpen,
  onClose,
  caseId,
  caseData = null,
  users = [],
  departments = [],
  onSuccess,
}) {
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      setSelectedDeptId('');
      setSelectedAgentId('');
      setReason('');
      setCustomReason('');
      setNote('');
    }
  }, [isOpen]);

  // Load the configured escalation template and fill its placeholders with this case's data
  const caseNumber = caseData?.caseNumber;
  const caseCustomerName = caseData?.customerName || caseData?.customer?.fullName;
  const caseSeverity = caseData?.severity;
  const targetDeptName = departments.find((d) => String(d.id) === String(selectedDeptId))?.name;

  useEffect(() => {
    if (!selectedDeptId || !reason || reason === 'Other') return;

    configurableSettingsService.getEscalationTemplates(selectedDeptId, reason)
      .then((tmpl) => {
        if (!tmpl || (!tmpl.subjectTemplate && !tmpl.bodyTemplate)) return;

        const values = {
          caseNumber,
          customerName: caseCustomerName,
          departmentName: targetDeptName || tmpl.departmentName,
          severity: caseSeverity,
        };

        const subject = applyEscalationPlaceholders(tmpl.subjectTemplate, values);
        const body = applyEscalationPlaceholders(tmpl.bodyTemplate, values);
        setNote(`${subject ? `[Subject: ${subject}]\n` : ''}${body}`);
      })
      .catch(() => {});
  }, [selectedDeptId, reason, caseNumber, caseCustomerName, caseSeverity, targetDeptName]);

  const deptAgents = useMemo(() => {
    if (!selectedDeptId) return [];
    return users.filter((u) => String(u.departmentId) === String(selectedDeptId));
  }, [users, selectedDeptId]);

  const handleConfirm = async () => {
    if (!selectedDeptId) return toast.error('Please select a department.');
    if (!selectedAgentId) return toast.error('Please select an agent to escalate to.');
    if (!reason) return toast.error('Please select an escalation reason.');
    if (reason === 'Other' && !customReason.trim()) {
      return toast.error('Please specify custom reason.');
    }
    setIsLoading(true);
    try {
      const finalReason = reason === 'Other' ? customReason.trim() : reason;
      const targetAgent = users.find((u) => u.id === selectedAgentId);
      const fullNote = `Escalated to ${targetAgent?.name || 'Agent'}. Reason: ${finalReason}.${note ? ' ' + note.trim() : ''}`;
      await caseService.updateCaseStatus(caseId, { status: 'Escalated', note: fullNote });
      toast.success('Case escalated successfully.');
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
      title="Escalate Case"
      subtitle="Escalate case to a specific department & supervisor/agent"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" isLoading={isLoading} onClick={handleConfirm}>
            Escalate Case
          </Button>
        </>
      }
    >
      <div className="action-modal-form">
        {/* Step 1: Department */}
        <Select
          label="Department"
          required
          value={selectedDeptId}
          onChange={(e) => {
            setSelectedDeptId(e.target.value);
            setSelectedAgentId('');
          }}
        >
          <option value="">Select department...</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>

        {/* Step 2: Agent selection list for selected department */}
        {selectedDeptId && (
          <div>
            <p style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              Escalate To *
            </p>
            <UserSelectList
              users={deptAgents}
              selectedId={selectedAgentId}
              onSelect={setSelectedAgentId}
            />
          </div>
        )}

        {/* Step 3: Reason (Single 'Other' option) */}
        <Select
          label="Escalation Reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">Select escalation reason...</option>
          {ESCALATION_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
          <option value="Other">Other</option>
        </Select>

        {/* Step 4: Custom Reason if Other */}
        {reason === 'Other' && (
          <Input
            label="Please specify reason"
            required
            placeholder="Enter custom reason..."
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
          />
        )}

        {/* Step 5: Escalation Template */}
        <Textarea
          label="Escalation Template"
          placeholder="Enter escalation template details..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
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
// 6. LINK CASE MODAL (Generates Sub-Case ID e.g. C-00045-L01)
// ============================================================
export function LinkCaseModal({ isOpen, onClose, caseId, onSuccess }) {
  const [relationship, setRelationship] = useState('');
  const [caseRef, setCaseRef] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      setRelationship('');
      setCaseRef('');
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (!relationship) return toast.error('Please select relationship type.');
    if (!caseRef.trim()) return toast.error('Please enter a case reference.');
    setIsLoading(true);
    try {
      const res = await caseService.linkCase(caseId, {
        relationshipType: relationship,
        targetCaseNumber: caseRef.trim(),
      });
      const childIdMsg = res?.childId ? ` (Sub-Case ID: ${res.childId})` : '';
      toast.success(`Case linked successfully${childIdMsg}.`);
      onSuccess?.();
      setRelationship('');
      setCaseRef('');
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
      title="Link Case"
      subtitle="Associate this case with another related case (Generates Sub-Case ID e.g. C-00045-L01)"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" isLoading={isLoading} onClick={handleConfirm}>
            Link Case
          </Button>
        </>
      }
    >
      <div className="action-modal-form">
        <Select
          label="Relationship Type"
          required
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
        >
          <option value="">Select relationship...</option>
          {LINK_RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <div>
          <label className="form-label form-label--required">Case Reference (Case Number)</label>
          <input
            className="form-input"
            type="text"
            placeholder="e.g. C-10301"
            value={caseRef}
            onChange={(e) => setCaseRef(e.target.value)}
          />
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

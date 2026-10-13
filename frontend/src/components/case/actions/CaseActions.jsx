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
} from '../../../constants/index.js';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { slaRoutingService } from '../../../services/slaRoutingService.js';
import { departmentService } from '../../../services/departmentService.js';
import { fieldErrorsFromError } from '../../../utils/serverErrors.js';
import { selectPlaceholder } from '../../../utils/fieldValidation.js';
import { ReasonFields } from './ReasonFields.jsx';
import { useReasonState } from './useReasonState.js';
import { teamService } from '../../../services/teamService.js';
import './actions.css';

// ============================================================
// 1. ASSIGN / REASSIGN MODAL
// ============================================================
// Short words for why someone cannot take the case (codes from GET /api/cases/{id}/eligible-assignees).
const INELIGIBLE_SHORT = {
  CurrentOwner: 'current owner',
  Unavailable: 'not available now',
  AtCapacity: 'at capacity',
  UserInactive: 'account deactivated',
  NotTeamMember: 'not in this team',
  NotAssignable: 'not assignable',
  NotSelected: 'not selected for assignment',
  LeadExcluded: 'team leads excluded',
  NeedsAssignPermission: 'needs the cases.assign permission',
  TeamInactive: 'team inactive',
};

function statusDotClass(status) {
  const s = (status || '').toLowerCase();
  if (s === 'available') return 'status-dot--online';
  if (s === 'busy') return 'status-dot--busy';
  return 'status-dot--away';
}

export function AssignModal({ isOpen, onClose, caseId, caseData, onSuccess }) {
  const [team, setTeam] = useState(null);             // the eligible-assignees answer for this case
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const reason = useReasonState();
  const toast = useToast();

  useEffect(() => {
    if (!isOpen || !caseId) return undefined;
    let live = true;
    setSelectedUserId('');
    setErrors({});
    setLoading(true);
    setLoadError(null);
    caseService
      .getEligibleAssignees(caseId)
      .then((data) => live && setTeam(data))
      .catch((err) => live && setLoadError(err?.message || 'The list of people who can take this case could not be loaded.'))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [isOpen, caseId, attempt]);

  const candidates = team?.candidates || [];
  const eligibleCount = candidates.filter((c) => c.isEligible).length;
  const selected = candidates.find((c) => String(c.userId) === String(selectedUserId));

  const optionLabel = (c) => {
    const role = c.isTeamLead ? 'Team Lead' : c.teamRole;
    const parts = [c.name, c.isCrossTeam ? `${c.homeTeamName} team` : null, role, c.status, `${c.openCases}/${team.capacity} open`].filter(Boolean);
    return c.isEligible ? parts.join(' · ') : `${parts.join(' · ')} — ${INELIGIBLE_SHORT[c.ineligibleReason] || 'cannot take it'}`;
  };

  const handleConfirm = async () => {
    if (!selected?.isEligible) return setErrors({ ownerId: 'Choose someone who can take this case.' });
    if (!reason.isValid) return setErrors({ reason: reason.reason ? undefined : 'Choose a reason.', reasonDetail: reason.needsDetail ? 'An explanation is required.' : undefined });
    setIsSaving(true);
    setErrors({});
    try {
      await caseService.assignCase(caseId, { ownerId: selected.userId, ...reason.payload() });
      toast.success(`Case assigned to ${selected.name}.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      setErrors(fieldErrorsFromError(err));
      toast.error(err.message || 'The case could not be assigned.');
      // Someone's status or workload changed since the list was loaded: show the current picture.
      if (err?.original?.response?.status === 422) setAttempt((n) => n + 1);
    } finally {
      setIsSaving(false);
    }
  };

  const caseRef = caseData?.caseNumber || '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={caseRef ? `Reassign case ${caseRef}` : 'Reassign case'}
      subtitle={team
        ? (team.crossTeamMode && team.crossTeamMode !== 'Disabled'
          ? `People in ${team.departmentName} and other allowed teams who can take this case`
          : `People in ${team.departmentName} who can take this case`)
        : 'Choose who takes ownership of this case'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={isSaving}
            disabled={!selected?.isEligible || !reason.isValid || isSaving}
            onClick={handleConfirm}
          >
            {isSaving ? 'Assigning…' : 'Assign'}
          </Button>
        </>
      }
    >
      <div className="action-modal-form">
        <Select
          label="Assign to"
          required
          value={selectedUserId}
          onChange={(e) => { setSelectedUserId(e.target.value); setErrors((p) => ({ ...p, ownerId: undefined })); }}
          placeholder={selectPlaceholder('Agent')}
          isLoading={loading}
          loadError={loadError}
          onRetry={() => setAttempt((n) => n + 1)}
          error={errors.ownerId}
          emptyText={team && candidates.length === 0 ? `${team.departmentName} has no members or lead yet.` : 'No matching people'}
          options={candidates.map((c) => ({ value: c.userId, label: optionLabel(c), disabled: !c.isEligible, searchText: `${c.email || ''} ${c.teamRole || ''}` }))}
        />

        {team && !loading && eligibleCount === 0 && (
          <div className="assign-notice" role="status">
            {candidates.length === 0
              ? `${team.departmentName} has no members or team lead, so nobody can take this case. Add members on the Teams page, or transfer the case to another team.`
              : `Nobody in ${team.departmentName} can take this case right now (everyone is unavailable, at capacity or already holds it). Try again later or transfer it to another team.`}
          </div>
        )}

        {selected && (
          <div className="agent-preview-card">
            <div className="agent-preview-card__header">
              <Avatar name={selected.name} size="sm" />
              <div className="agent-preview-card__name-group">
                <span className="agent-preview-card__name">{selected.name}</span>
                <span className="agent-preview-card__status">
                  <span className={`status-dot ${statusDotClass(selected.status)}`} />
                  {selected.status}
                </span>
              </div>
            </div>
            <div className="agent-preview-card__details">
              <div className="agent-preview-card__row">
                <span className="agent-preview-card__label">Team:</span>
                <span className="agent-preview-card__val">
                  {selected.isCrossTeam ? `${selected.homeTeamName} (case stays with ${team.departmentName})` : team.departmentName}
                </span>
              </div>
              <div className="agent-preview-card__row">
                <span className="agent-preview-card__label">Role in team:</span>
                <span className="agent-preview-card__val">{selected.isTeamLead ? 'Team Lead' : selected.teamRole || '—'}</span>
              </div>
              <div className="agent-preview-card__row">
                <span className="agent-preview-card__label">Workload:</span>
                <span className="agent-preview-card__val">{selected.openCases} of {team.capacity} open cases</span>
              </div>
              {!selected.isEligible && selected.ineligibleMessage && (
                <div className="agent-preview-card__row">
                  <span className="agent-preview-card__val assign-ineligible">{selected.ineligibleMessage}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <ReasonFields listCode="ASSIGNMENT_REASON" label="Reason" isOpen={isOpen} state={reason} errors={errors} />
      </div>
    </Modal>
  );
}

// ============================================================
// 2. TRANSFER DEPARTMENT MODAL
// ============================================================
export function TransferModal({ isOpen, onClose, caseId, caseData, onSuccess }) {
  const [teams, setTeams] = useState([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [teamsError, setTeamsError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [handoverNote, setHandoverNote] = useState('');
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const reason = useReasonState();
  const toast = useToast();

  // Active teams other than the case's own (a team IS the queue: there is nothing else to transfer to).
  useEffect(() => {
    if (!isOpen) return undefined;
    let live = true;
    setSelectedDeptId('');
    setHandoverNote('');
    setErrors({});
    setTeamsLoading(true);
    setTeamsError(null);
    departmentService
      .getAllDepartments(true)
      .then((list) => live && setTeams((list || []).filter((d) => d.isActive !== false && String(d.id) !== String(caseData?.departmentId))))
      .catch((err) => live && setTeamsError(err?.message || 'The teams could not be loaded.'))
      .finally(() => live && setTeamsLoading(false));
    return () => { live = false; };
  }, [isOpen, caseData?.departmentId, attempt]);

  const target = teams.find((d) => String(d.id) === String(selectedDeptId));

  const handleConfirm = async () => {
    if (!target) return setErrors({ departmentId: 'Choose the team to transfer the case to.' });
    if (!reason.isValid) return setErrors({ reason: reason.reason ? undefined : 'Choose a reason.', reasonDetail: reason.needsDetail ? 'An explanation is required.' : undefined });
    setIsSaving(true);
    setErrors({});
    try {
      await caseService.transferDepartment(caseId, { departmentId: target.id, ...reason.payload(), handoverNote: handoverNote.trim() || undefined });
      toast.success(`Case transferred to ${target.name}.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      setErrors(fieldErrorsFromError(err));
      toast.error(err.message || 'The case could not be transferred.');
    } finally {
      setIsSaving(false);
    }
  };

  const caseRef = caseData?.caseNumber || '';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={caseRef ? `Transfer case ${caseRef}` : 'Transfer case'}
      subtitle={caseData?.departmentName ? `Move this case from ${caseData.departmentName} to another team` : 'Move this case to another team'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isLoading={isSaving}
            disabled={!target || !reason.isValid || isSaving}
            onClick={handleConfirm}
          >
            {isSaving ? 'Transferring…' : '⇄ Transfer Case'}
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
          label="Target Team"
          required
          value={selectedDeptId}
          onChange={(e) => { setSelectedDeptId(e.target.value); setErrors((p) => ({ ...p, departmentId: undefined })); }}
          placeholder={selectPlaceholder('Team')}
          isLoading={teamsLoading}
          loadError={teamsError}
          onRetry={() => setAttempt((n) => n + 1)}
          error={errors.departmentId}
          emptyText={!teamsLoading && teams.length === 0 ? 'There is no other active team to transfer to.' : 'No matching teams'}
          options={teams.map((d) => ({ value: d.id, label: d.name, searchText: d.code }))}
        />

        {target && (
          <div className="assign-notice assign-notice--info" role="status">
            {target.ownerName
              ? <>The team lead, <strong>{target.ownerName}</strong>, takes ownership. If the lead&apos;s account is not active, the team&apos;s assignment algorithm picks an available agent.</>
              : <>{target.name} has no team lead, so its assignment algorithm picks an available agent. If nobody can take the case, the transfer is refused.</>}
          </div>
        )}

        <ReasonFields listCode="TRANSFER_REASON" label="Reason" isOpen={isOpen} state={reason} errors={errors} />

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
  departments: propDepartments = [],
  existingCoworkerIds = [],
  onSuccess,
}) {
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [deptList, setDeptList] = useState([]);
  const [teams, setTeams] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!isOpen) return;

    setSelectedDeptId('');
    setSelectedUserIds([]);
    setSearchQuery('');

    // Load departments
    departmentService
      .getAllDepartments()
      .then((depts) => {
        const list = depts && depts.length > 0 ? depts : propDepartments || [];
        setDeptList(list);
        if (list && list.length > 0) {
          setSelectedDeptId(list[0].id);
        }
      })
      .catch(() => {
        setDeptList(propDepartments);
        if (propDepartments && propDepartments.length > 0) {
          setSelectedDeptId(propDepartments[0].id);
        }
      });

    // Load teams for true membership mapping
    teamService
      .getAllTeams()
      .then((t) => setTeams(t || []))
      .catch(() => setTeams([]));
  }, [isOpen, propDepartments]);

  const deptUsers = useMemo(() => {
    if (!selectedDeptId) return [];

    // Find team matching selected department
    const matchingTeam = teams.find((t) => String(t.id) === String(selectedDeptId));
    let memberList = [];

    // Team membership is the only source of who belongs to a team (a user's "home department" is not).
    if (matchingTeam?.members && matchingTeam.members.length > 0) {
      memberList = matchingTeam.members.map((m) => ({
        id: m.userId,
        name: m.name,
        role: m.role || (m.isLead ? 'Team Lead' : ''),
        email: m.email,
        status: m.status || null,
        isLead: m.isLead,
        departmentName: matchingTeam.name,
      }));
    }

    if (!searchQuery.trim()) return memberList;

    const q = searchQuery.toLowerCase().trim();
    return memberList.filter(
      (u) =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.role && u.role.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q))
    );
  }, [selectedDeptId, teams, searchQuery]);

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
      toast.error(err.message || 'Failed to add co-workers.');
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
          <Button
            variant="primary"
            isLoading={isLoading}
            disabled={selectedUserIds.length === 0}
            onClick={handleConfirm}
          >
            {selectedUserIds.length > 0
              ? `Add Selected Co-workers (${selectedUserIds.length})`
              : 'Add Selected Co-workers'}
          </Button>
        </>
      }
    >
      <div className="action-modal-form">
        <Select
          label="Select Department (Compulsory)"
          required
          value={selectedDeptId}
          onChange={(e) => {
            setSelectedDeptId(e.target.value);
            setSelectedUserIds([]);
          }}
        >
          <option value="">Select department...</option>
          {deptList.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <p className="form-label" style={{ margin: 0 }}>
              Select Team Members ({selectedUserIds.length} selected)
            </p>
          </div>

          {!selectedDeptId ? (
            <div style={{ padding: 20, textAlign: 'center', background: '#f8fafc', borderRadius: 8, color: '#64748b', fontSize: 13 }}>
              Please select a department above to load eligible team members.
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <Input
                  placeholder="Search team members by name or role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="user-select-list scrollbar-thin">
                {deptUsers.length === 0 ? (
                  <p className="user-select-empty">
                    {searchQuery ? 'No matching team members found.' : 'No team members found for this department.'}
                  </p>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="user-select-card__name">{user.name}</span>
                            {user.isLead && (
                              <span className="badge-pill" style={{ fontSize: 9, backgroundColor: '#fef3c7', color: '#b45309' }}>
                                LEAD
                              </span>
                            )}
                          </div>
                          <span className="user-select-card__role">{user.role}</span>
                        </div>
                        {isAlreadyCoworker ? (
                          <span className="badge-pill badge-pill--cowork">Already Added</span>
                        ) : (
                          <span
                            className={`status-dot-indicator ${
                              user.status?.toLowerCase() === 'available'
                                ? 'status-dot-indicator--online'
                                : 'status-dot-indicator--offline'
                            }`}
                            title={user.status || 'Status unknown'}
                          />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
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
  _caseData = null,
  users = [],
  _departments = [],
  onSuccess,
}) {
  const [selectedUserId, setSelectedUserId] = useState('');
  const reason = useReasonState();
  const [errors, setErrors] = useState({});
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [escalationStatus, setEscalationStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (isOpen && caseId) {
      setSelectedUserId('');
      setErrors({});
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
    if (!reason.isValid) {
      return setErrors({ reason: reason.reason ? undefined : 'Choose an escalation reason.', reasonDetail: reason.needsDetail ? 'An explanation is required.' : undefined });
    }

    setIsLoading(true);
    setErrors({});
    try {
      await caseService.escalateCase(caseId, {
        ...reason.payload(),
        note: note.trim() || undefined,
        targetUserId: targetId,
      });
      toast.success('Case escalated successfully.');
      onSuccess?.();
      onClose();
    } catch (err) {
      setErrors(fieldErrorsFromError(err));
      toast.error(err.message || 'Failed to escalate case.');
    } finally {
      setIsLoading(false);
    }
  };


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
            disabled={statusLoading || escalationStatus?.isMaxLevel || (!selectedUserId && !escalationStatus?.nextTargetUserId) || !reason.isValid}
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
                    {u.name}{u.role ? ` — ${u.role}` : ''}{teamInfo}{statusInfo}
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
                      {selectedUser.status || '—'}
                    </span>
                  </div>
                </div>
                <div className="agent-preview-card__details">
                  <div className="agent-preview-card__row">
                    <span className="agent-preview-card__label">Role:</span>
                    <span className="agent-preview-card__val">{selectedUser.role || '—'}</span>
                  </div>
                  <div className="agent-preview-card__row">
                    <span className="agent-preview-card__label">Team:</span>
                    <span className="agent-preview-card__val">{selectedUser.team || '—'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Escalation Reason — the configured ESCALATION_REASON list */}
            <ReasonFields listCode="ESCALATION_REASON" label="Escalation Reason" isOpen={isOpen} state={reason} errors={errors} />

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

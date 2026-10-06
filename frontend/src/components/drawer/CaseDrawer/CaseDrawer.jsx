// ===== CASE DRAWER =====

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  X, UserCheck, ArrowRightLeft, Users, AlertTriangle,
  FileText, Link2, CheckCircle2, Clock, ArrowRight,
  ChevronDown, Check, Paperclip, Flame, UserPlus, ExternalLink
} from 'lucide-react';

const DRAWER_STATUS_OPTIONS = [
  { value: 'Open', label: 'Open' },
  { value: 'InProgress', label: 'In Progress' },
  { value: 'WaitingOnCustomer', label: 'Waiting on Customer' },
  { value: 'Escalated', label: 'Escalated' },
  { value: 'Resolved', label: 'Resolved' },
];

import { Tabs } from '../../common/Tabs/Tabs.jsx';
import { Avatar } from '../../common/Avatar/Avatar.jsx';
import { Timeline, TimelineInteractionBox } from '../../timeline/Timeline.jsx';
import { EmptyState } from '../../common/Loader/Loader.jsx';
import { Skeleton } from '../../common/Skeleton/Skeleton.jsx';
import {
  AssignModal, TransferModal, CoworkerModal,
  EscalateModal, NoteModal, LinkCaseModal, ResolveModal, ReopenModal
} from '../../../components/case/actions/CaseActions.jsx';
import { CollaborationDrawer } from '../CollaborationDrawer/CollaborationDrawer.jsx';
import { AttachmentsDrawer } from '../AttachmentsDrawer/AttachmentsDrawer.jsx';
import { useCases } from '../../../hooks/useCases.js';
import { useCase } from '../../../contexts/CaseContext.jsx';
import { useUsers } from '../../../hooks/useUsers.js';
import { useDepartments } from '../../../hooks/useDepartments.js';
import { caseService } from '../../../services/caseService.js';
import { metadataService } from '../../../services/metadataService.js';
import { SlaDisplay } from '../../common/SlaDisplay/SlaDisplay.jsx';
import { ConfirmDialog } from '../../common/ConfirmDialog/ConfirmDialog.jsx';
import { useToast } from '../../../hooks/useToast.js';
import { formatFullDateTime, formatDate } from '../../../utils/dateUtils.js';
import { PARTICIPANT_ROLE } from '../../../constants/index.js';
import { configurableSettingsService } from '../../../services/configurableSettingsService.js';
import { ChannelBadge } from '../../case/ChannelBadge/ChannelBadge.jsx';
import './CaseDrawer.css';

function FirstResponseBadge({ caseItem }) {
  if (!caseItem) return null;
  const status = caseItem.firstResponseStatus || 'Pending';
  const targetMin = caseItem.firstResponseTargetMinutes;

  if (status === 'Met') {
    let metDuration = '';
    if (caseItem.createdAt && caseItem.firstResponseActualAt) {
      const diffMs = new Date(caseItem.firstResponseActualAt) - new Date(caseItem.createdAt);
      if (diffMs > 0) {
        const diffMins = Math.round(diffMs / 60000);
        metDuration = diffMins < 60 ? ` (${diffMins}m)` : ` (${Math.floor(diffMins / 60)}h ${diffMins % 60}m)`;
      }
    }
    return (
      <span className="first-response-badge first-response-badge--met" title={`First response met${metDuration}`}>
        <span className="first-response-badge__dot" />
        Met{metDuration}
      </span>
    );
  }

  if (status === 'Breached') {
    return (
      <span className="first-response-badge first-response-badge--breached" title="First response SLA breached">
        <span className="first-response-badge__dot" />
        Breached
      </span>
    );
  }

  // Pending
  let remainingText = '';
  if (caseItem.firstResponseDueAt) {
    const diffMs = new Date(caseItem.firstResponseDueAt) - new Date();
    if (diffMs <= 0) {
      return (
        <span className="first-response-badge first-response-badge--breached" title="First response SLA breached">
          <span className="first-response-badge__dot" />
          Breached
        </span>
      );
    }
    const diffMins = Math.round(diffMs / 60000);
    remainingText = diffMins < 60 ? `${diffMins}m left` : `${Math.floor(diffMins / 60)}h ${diffMins % 60}m left`;
  } else if (targetMin) {
    remainingText = targetMin < 60 ? `${targetMin}m target` : `${targetMin / 60}h target`;
  }

  return (
    <span className="first-response-badge first-response-badge--pending" title={`First response target: ${targetMin || 240} mins`}>
      <span className="first-response-badge__dot" />
      {remainingText ? `Pending (${remainingText})` : 'Pending'}
    </span>
  );
}

// ---- Details Tab ----
function DetailsTab({ caseData, onOpen360 }) {
  // Labels of administrator-defined case fields, so custom attributes read as configured.
  const [customLabels, setCustomLabels] = useState({});
  const hasCustom = (caseData.customAttributes || []).length > 0;
  useEffect(() => {
    if (!hasCustom) return;
    let live = true;
    metadataService.getCaseForm()
      .then((m) => live && setCustomLabels(Object.fromEntries(m.fields.map((f) => [f.apiField, f.displayLabel]))))
      .catch(() => {});
    return () => { live = false; };
  }, [hasCustom]);
  const childRelations = caseData.childRelations || [];
  const reopenRelations = childRelations.filter((cr) => cr.relationType?.toLowerCase() === 'reopen');

  return (
    <div className="drawer-details scrollbar-thin">
      {/* CUSTOMER SECTION */}
      <div className="drawer-section">
        <p className="drawer-section-label">CUSTOMER</p>
        <div className="drawer-customer-row">
          <Avatar name={caseData.customer?.fullName || caseData.customerName} size="md" />
          <div className="drawer-customer-info">
            <div className="drawer-customer-header-line">
              <p className="drawer-customer-name">
                {caseData.customer?.fullName || caseData.customerName || '—'}
              </p>
              {/* Dynamic DB-calculated Open and Total Case counts */}
              <div className="drawer-customer-case-counts">
                <span className="customer-count-pill customer-count-pill--open">
                  <strong>{caseData.customer?.openCasesCount ?? 0}</strong> Open Cases
                </span>
                <span className="customer-count-pill customer-count-pill--total">
                  <strong>{caseData.customer?.totalCasesCount ?? 0}</strong> Total Cases
                </span>
              </div>
            </div>
          </div>
          <button
            className="drawer-open360-btn"
            onClick={() => onOpen360(caseData.customer?.id)}
            aria-label="Open Customer 360"
          >
            Open 360 <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {/* KEY DETAILS SECTION — Compact Enterprise 2-Column Grid */}
      <div className="drawer-section">
        <p className="drawer-section-label">KEY DETAILS</p>
        <div className="key-details-grid">
          {/* Left Column */}
          <div className="key-details-column">
            <div className="key-details-row">
              <span className="key-details-label" title="Case ID">Case ID</span>
              <div className="key-details-value font-mono key-details-value--case-id">
                <span className="key-details-case-num" title={caseData.caseNumber}>{caseData.caseNumber}</span>
                {caseData.parentCaseNumber && (
                  <span className="key-details-parent-pill" title={`Parent Case: ${caseData.parentCaseNumber}`}>
                    Parent: {caseData.parentCaseNumber}
                  </span>
                )}
              </div>
            </div>

            <div className="key-details-row">
              <span className="key-details-label" title="Case Type">Case Type</span>
              <span className="key-details-value" title={caseData.caseType || 'Complaint'}>
                {caseData.caseType || 'Complaint'}
              </span>
            </div>

            <div className="key-details-row">
              <span className="key-details-label" title="Created On">Created On</span>
              <span className="key-details-value text-secondary" title={formatFullDateTime(caseData.createdAt)}>
                {formatFullDateTime(caseData.createdAt)}
              </span>
            </div>

            <div className="key-details-row">
              <span className="key-details-label" title="Resolution SLA">Resolution SLA</span>
              <div className="key-details-value">
                <SlaDisplay caseItem={caseData} size="sm" />
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="key-details-column">
            <div className="key-details-row">
              <span className="key-details-label" title="Source Channel">Source Channel</span>
              <div className="key-details-value">
                <ChannelBadge channel={caseData.sourceChannel || caseData.communicationChannel || '—'} />
              </div>
            </div>

            <div className="key-details-row">
              <span className="key-details-label" title="Preferred Communication">Pref. Comm</span>
              <span className="key-details-value" title={caseData.preferredCommunicationChannel || caseData.communicationChannel || '—'}>
                {caseData.preferredCommunicationChannel || caseData.communicationChannel || '—'}
              </span>
            </div>

            <div className="key-details-row">
              <span className="key-details-label" title="Preferred Language">Language</span>
              <span className="key-details-value" title={caseData.preferredLanguage || caseData.customer?.preferredLanguage || '—'}>
                {caseData.preferredLanguage || caseData.customer?.preferredLanguage || '—'}
              </span>
            </div>

            <div className="key-details-row">
              <span className="key-details-label" title="First Response SLA">First Response</span>
              <div className="key-details-value">
                <FirstResponseBadge caseItem={caseData} />
              </div>
            </div>

            {(caseData.customAttributes || []).map((attr) => (
              <div className="key-details-row" key={attr.fieldKey}>
                <span className="key-details-label" title={customLabels[attr.fieldKey] || attr.fieldKey}>
                  {customLabels[attr.fieldKey] || attr.fieldKey}
                </span>
                <span className="key-details-value" title={attr.fieldValue}>{attr.fieldValue}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CURRENT OWNER SECTION — Agent, Dynamic Team & Queue */}
      <div className="drawer-section">
        <p className="drawer-section-label">CURRENT OWNER</p>
        <div className="owner-card">
          <Avatar name={caseData.ownerName} size="md" />
          <div className="owner-card__info">
            <p className="owner-card__name">{caseData.ownerName || 'Unassigned'}</p>
            <div className="owner-card__metadata-grid">
              <span className="owner-card__meta-item">
                <span className="owner-card__meta-label">Role:</span> {caseData.ownerRole || 'Agent'}
              </span>
              <span className="owner-card__meta-item">
                <span className="owner-card__meta-label">Team:</span> {caseData.ownerTeam || '—'}
              </span>
              <span className="owner-card__meta-item">
                <span className="owner-card__meta-label">Queue:</span> {caseData.ownerQueue || '—'}
              </span>
            </div>
          </div>
          <span className="badge-pill badge-pill--owner">OWNER</span>
        </div>
      </div>

      {/* REOPENED CASE DETAILS SECTION (Rendered if case has reopen child IDs) */}
      {reopenRelations.length > 0 && (
        <div className="drawer-section">
          <p className="drawer-section-label">REOPENED CASE DETAILS ({reopenRelations.length})</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reopenRelations.map((cr) => (
              <div
                key={cr.childId}
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid #fed7aa',
                  backgroundColor: '#fff7ed',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: '#c2410c', fontFamily: 'monospace' }}>
                    Child Case ID: {cr.childId}
                  </span>
                  <span className="badge-pill" style={{ backgroundColor: '#ffedd5', color: '#9a3412', fontWeight: 600 }}>
                    REOPENED
                  </span>
                </div>
                {cr.reason && (
                  <p style={{ fontSize: '12px', color: '#431407', fontWeight: 500 }}>
                    <strong>Reason:</strong> {cr.reason}
                  </p>
                )}
                <p style={{ fontSize: '11px', color: '#9a3412' }}>
                  Reopened by {cr.createdByName || 'Agent'} &middot; {formatFullDateTime(cr.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- People Tab ----
function PeopleTab({ caseData, onRemoveCoworker, onOpenCollaboration }) {
  const coworkers = caseData.participants?.filter(
    (p) => p.role === PARTICIPANT_ROLE.CO_WORKER || p.role === 'CoWorker' || p.role?.toLowerCase() === 'coworker'
  ) || [];

  return (
    <div className="scrollbar-thin" style={{ overflowY: 'auto', height: '100%', padding: '16px 20px' }}>
      {/* Owner */}
      <div className="people-section">
        <p className="drawer-section-label">OWNER</p>
        {caseData.ownerName ? (
          <div className="owner-card">
            <Avatar name={caseData.ownerName} size="md" />
            <div className="owner-card__info">
              <p className="owner-card__name">{caseData.ownerName}</p>
              <div className="owner-card__metadata-grid">
                <span className="owner-card__meta-item">
                  <span className="owner-card__meta-label">Role:</span> {caseData.ownerRole || 'Agent'}
                </span>
                <span className="owner-card__meta-item">
                  <span className="owner-card__meta-label">Team:</span> {caseData.ownerTeam || '—'}
                </span>
                <span className="owner-card__meta-item">
                  <span className="owner-card__meta-label">Queue:</span> {caseData.ownerQueue || '—'}
                </span>
              </div>
            </div>
            <span className="badge-pill badge-pill--owner">OWNER</span>
          </div>
        ) : <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>No owner assigned</p>}
      </div>

      {/* Co-workers */}
      <div className="people-section" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p className="drawer-section-label" style={{ margin: 0 }}>CO-WORKERS ({coworkers.length})</p>
          <button
            type="button"
            className="btn btn--outline"
            style={{ fontSize: '11px', padding: '3px 10px' }}
            onClick={onOpenCollaboration}
          >
            Manage Collaboration
          </button>
        </div>
        {coworkers.length > 0 ? (
          <div className="people-list">
            {coworkers.map(p => (
              <div key={p.userId} className="owner-card">
                <Avatar name={p.userName} size="md" />
                <div className="owner-card__info">
                  <p className="owner-card__name">{p.userName}</p>
                  {p.roleTitle && <p className="owner-card__role">{p.roleTitle}</p>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge-pill badge-pill--cowork">CO-WORK</span>
                  <button
                    className="btn"
                    style={{
                      fontSize: '11px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      border: '1px solid #fca5a5',
                      backgroundColor: '#fef2f2',
                      color: '#dc2626'
                    }}
                    onClick={() => onRemoveCoworker(p)}
                    title="Remove Co-worker"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : <EmptyState title="No co-workers" description="Add co-workers to collaborate on this case." />}
      </div>
    </div>
  );
}

// ---- Linked Cases Tab (Displays Child Case IDs e.g. C-00455-L01) ----
function LinkedCasesTab({ caseData, onUnlinkSuccess }) {
  const toast = useToast();
  const linked = caseData.linkedCases || [];
  const childRelations = caseData.childRelations || [];
  const linkRelations = childRelations.filter((cr) => cr.relationType?.toLowerCase() === 'link');
  const [unlinkingId, setUnlinkingId] = useState(null);
  const [pendingUnlink, setPendingUnlink] = useState(null);

  const confirmUnlink = async () => {
    const targetCaseNumber = pendingUnlink;
    setUnlinkingId(targetCaseNumber);
    try {
      await caseService.unlinkCase(caseData.id, { targetCaseNumber });
      setPendingUnlink(null);
      toast.success(`Case ${targetCaseNumber} unlinked successfully.`);
      await onUnlinkSuccess?.();
    } catch (e) {
      toast.error(e.message || 'Failed to unlink case.');
    } finally {
      setUnlinkingId(null);
    }
  };

  const handleUnlink = (targetCaseNumber) => setPendingUnlink(targetCaseNumber);

  const unlinkDialog = (
    <ConfirmDialog
      isOpen={Boolean(pendingUnlink)}
      title="Unlink Case"
      message={`Are you sure you want to unlink case ${pendingUnlink}? This action cannot be undone.`}
      confirmLabel="Unlink"
      isBusy={Boolean(unlinkingId)}
      onCancel={() => setPendingUnlink(null)}
      onConfirm={confirmUnlink}
    />
  );

  if (!linked.length && !linkRelations.length) {
    return (
      <>
        <EmptyState title="No linked cases" description="Use 'Link Case' to associate related cases." />
        {unlinkDialog}
      </>
    );
  }

  return (
    <div className="linked-cases-list scrollbar-thin" style={{ overflowY: 'auto', height: '100%', padding: '16px 20px' }}>
      <p className="drawer-section-label" style={{ marginBottom: 12 }}>
        LINKED CASES ({Math.max(linked.length, linkRelations.length)})
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {linkRelations.length > 0 ? (
          linkRelations.map((cr) => {
            const targetIdentifier = cr.linkedCaseNumber || cr.childId;
            return (
              <div
                key={cr.childId}
                style={{
                  padding: '14px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  backgroundColor: '#f8fafc',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-brand-primary)', fontFamily: 'monospace' }}>
                    Child Case ID: {cr.childId}
                  </span>
                  <span className="badge-pill badge-pill--dept">LINKED CASE</span>
                </div>
                {cr.linkedCaseNumber && (
                  <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Target Case: {cr.linkedCaseNumber} {cr.linkedCaseTitle ? `&middot; ${cr.linkedCaseTitle}` : ''}
                  </p>
                )}
                {cr.reason && (
                  <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    <strong>Reason:</strong> {cr.reason}
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                    Linked by {cr.createdByName || 'Agent'} &middot; {formatFullDateTime(cr.createdAt)}
                  </span>
                  {targetIdentifier && (
                    <button
                      className="btn"
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        border: '1px solid var(--color-danger)',
                        backgroundColor: 'transparent',
                        color: 'var(--color-danger)'
                      }}
                      disabled={unlinkingId === targetIdentifier}
                      onClick={() => handleUnlink(targetIdentifier)}
                    >
                      {unlinkingId === targetIdentifier ? 'Unlinking...' : 'Unlink'}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          linked.map((lc) => (
            <div
              key={lc.targetCaseId}
              style={{
                padding: '14px 16px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                backgroundColor: '#f8fafc',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <p className="linked-case-item__ref" style={{ fontWeight: 600, color: 'var(--color-brand-primary)' }}>
                  {lc.targetCaseNumber}
                </p>
                <p className="linked-case-item__title" style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {lc.targetCaseTitle}
                </p>
              </div>
              <button
                className="btn"
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  border: '1px solid var(--color-danger)',
                  backgroundColor: 'transparent',
                  color: 'var(--color-danger)'
                }}
                disabled={unlinkingId === lc.targetCaseNumber}
                onClick={() => handleUnlink(lc.targetCaseNumber)}
              >
                {unlinkingId === lc.targetCaseNumber ? 'Unlinking...' : 'Unlink'}
              </button>
            </div>
          ))
        )}
      </div>
      {unlinkDialog}
    </div>
  );
}

// ---- Main Case Drawer ----
export function CaseDrawer({ caseData, isLoadingCase, onClose }) {
  const navigate = useNavigate();
  const { dispatch } = useCase();
  const { refreshBoard, refreshSelectedCase } = useCases();
  const { users, reload: reloadUsers } = useUsers();
  const { departments, reload: reloadDepartments } = useDepartments();

  const [openModal, setOpenModal] = useState(null);
  const [isCollaborationOpen, setIsCollaborationOpen] = useState(false);
  const [isAttachmentsOpen, setIsAttachmentsOpen] = useState(false);
  const [pendingCoworker, setPendingCoworker] = useState(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isRequestingSwarm, setIsRequestingSwarm] = useState(false);
  const statusDropdownRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenModal = (modalName) => {
    reloadUsers();
    reloadDepartments(true);
    setOpenModal(modalName);
  };

  if (!caseData && !isLoadingCase) return null;

  const handleSuccess = async () => {
    if (caseData?.id) {
      await refreshSelectedCase(caseData.id);
    }
    refreshBoard();
  };

  const handleStatusSelect = async (newStatus) => {
    if (!caseData || isUpdatingStatus) return;
    const currentNorm = (caseData.status || '').toLowerCase().replace(/[\s_]/g, '');
    const newNorm = newStatus.toLowerCase().replace(/[\s_]/g, '');
    if (currentNorm === newNorm) {
      setStatusDropdownOpen(false);
      return;
    }

    try {
      setIsUpdatingStatus(true);
      await caseService.updateCaseStatus(caseData.id, { status: newStatus });
      
      // Notify only affected columns via CaseContext without full board refetch
      dispatch({
        type: 'CASE_STATUS_CHANGED',
        payload: {
          caseId: caseData.id,
          fromStatus: caseData.status,
          toStatus: newStatus,
          updatedCase: { ...caseData, status: newStatus },
        },
      });

      if (newNorm === 'waitingoncustomer') {
        toast.info('Status updated to Waiting on Customer. SLA clock paused.');
      } else if (currentNorm === 'waitingoncustomer' || Boolean(caseData.slaPausedAt)) {
        toast.success(`Status updated to ${newStatus}. SLA clock resumed.`);
      } else {
        toast.success(`Status updated to ${newStatus}.`);
      }

      if (caseData?.id) {
        await refreshSelectedCase(caseData.id);
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update case status.');
    } finally {
      setIsUpdatingStatus(false);
      setStatusDropdownOpen(false);
    }
  };

  const confirmRemoveCoworker = async () => {
    try {
      await caseService.removeCoworker(caseData.id, pendingCoworker.userId);
      setPendingCoworker(null);
      toast.success(`${pendingCoworker.name || 'Co-worker'} removed from this case.`);
      await handleSuccess();
    } catch (e) {
      toast.error(e.message || 'Failed to remove co-worker.');
    }
  };

  const handleRequestSwarm = async () => {
    if (!caseData) return;
    setIsRequestingSwarm(true);
    try {
      const res = await caseService.requestSwarm(caseData.id);
      toast.success(res.message || 'Swarm requested! Team Lead & SMEs mobilized.');
      await handleSuccess();
    } catch (err) {
      toast.error(err.message || 'Failed to request swarm.');
    } finally {
      setIsRequestingSwarm(false);
    }
  };

  const handleAddCollaborator = async (userId) => {
    if (!userId || !caseData) return;
    try {
      await caseService.addCoworkers(caseData.id, { coworkerIds: [userId] });
      toast.success('Collaborator added to case.');
      await handleSuccess();
    } catch (err) {
      toast.error(err.message || 'Failed to add collaborator.');
    }
  };

  const coworkerIds = caseData?.participants
    ?.filter(p => p.role === PARTICIPANT_ROLE.CO_WORKER || p.role === 'CoWorker' || p.role?.toLowerCase() === 'coworker')
    .map(p => p.userId) || [];

  const childRelations = caseData?.childRelations || [];
  const linkRelations = childRelations.filter((cr) => cr.relationType?.toLowerCase() === 'link');
  const linkedCount = Math.max(caseData?.linkedCases?.length || 0, linkRelations.length);

  const coworkerCount = caseData?.participants?.filter(
    p => p.role === PARTICIPANT_ROLE.CO_WORKER || p.role === 'CoWorker' || p.role?.toLowerCase() === 'coworker'
  )?.length || 0;

  const tabs = caseData
    ? [
        {
          key: 'details',
          label: 'Details',
          content: (
            <DetailsTab
              caseData={caseData}
              onOpen360={(id) => { onClose(); navigate(`/customer360/${id}`); }}
            />
          ),
        },
        {
          key: 'workflow',
          label: 'Workflow timeline',
          count: caseData.events?.length || 0,
          content: (
            <div className="scrollbar-thin" style={{ overflowY: 'auto', height: '100%', padding: '16px 20px 24px' }}>
              <Timeline
                events={caseData.events || []}
                caseId={caseData.id}
                channel={caseData.communicationChannel || caseData.sourceChannel || 'Email'}
                users={users}
                onSuccess={handleSuccess}
                showInteraction={true}
              />
            </div>
          ),
        },
        {
          key: 'people',
          label: 'People',
          count: coworkerCount,
          content: (
            <PeopleTab
              caseData={caseData}
              onRemoveCoworker={setPendingCoworker}
              onOpenCollaboration={() => setIsCollaborationOpen(true)}
            />
          ),
        },
        {
          key: 'linked',
          label: 'Linked Cases',
          count: linkedCount,
          content: <LinkedCasesTab caseData={caseData} onUnlinkSuccess={handleSuccess} />,
        },
      ]
    : [];

  return createPortal(
    <>
      {/* Overlay */}
      <div className="drawer-overlay" onClick={onClose} aria-hidden="true" />

      {/* Drawer */}
      <aside
        className="case-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={caseData ? `Case ${caseData.caseNumber} details` : 'Loading case'}
      >
        {isLoadingCase || !caseData ? (
          <div style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div>
              <Skeleton.Text lines={1} width="150px" style={{ marginBottom: 12 }} />
              <Skeleton.Text lines={1} width="80%" style={{ marginBottom: 24, height: 28 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <Skeleton width="60px" height="24px" borderRadius="var(--radius-full)" />
                <Skeleton width="60px" height="24px" borderRadius="var(--radius-full)" />
                <Skeleton width="80px" height="24px" borderRadius="var(--radius-full)" />
              </div>
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[1, 2, 3, 4, 5].map(i => (
                 <Skeleton key={i} width="120px" height="32px" borderRadius="var(--radius-sm)" />
              ))}
            </div>
            
            <div>
               <div style={{ display: 'flex', gap: 16, borderBottom: '1px solid var(--color-border)', paddingBottom: 12, marginBottom: 24 }}>
                 <Skeleton.Text lines={1} width="60px" />
                 <Skeleton.Text lines={1} width="100px" />
                 <Skeleton.Text lines={1} width="60px" />
               </div>
               <Skeleton.Text lines={1} width="100px" style={{ marginBottom: 16 }} />
               <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                 <Skeleton.Avatar size={40} />
                 <div>
                   <Skeleton.Text lines={1} width="120px" style={{ marginBottom: 4 }} />
                   <Skeleton.Text lines={1} width="160px" />
                 </div>
               </div>
               <Skeleton.Text lines={6} width="100%" />
            </div>
          </div>
        ) : (
          <>
            {/* Header with Removed SLA badge, Dynamic Department & Subcategory badges */}
            <div className="case-drawer__header-redesign">
              <div className="case-drawer__header-top">
                <span className="case-drawer__case-ref-redesign">
                  {caseData.caseNumber} &middot; {caseData.departmentName ? caseData.departmentName.toUpperCase() : 'CONTACT CENTER'}
                  {caseData.subcategory ? ` \u00B7 ${caseData.subcategory.toUpperCase()}` : ''}
                </span>
                <button className="case-drawer__close-redesign" onClick={onClose} aria-label="Close drawer">
                  <X size={18} />
                </button>
              </div>

              <h2 className="case-drawer__title-redesign">{caseData.title}</h2>

              <div className="case-drawer__badges-redesign">
                {/* Interactive Status Dropdown */}
                <div className="case-drawer__status-menu-container" ref={statusDropdownRef}>
                  <button
                    type="button"
                    className={`case-drawer__status-trigger case-drawer__status-trigger--${(caseData.status || 'open').toLowerCase().replace(/[\s_]/g, '')}`}
                    onClick={() => setStatusDropdownOpen((prev) => !prev)}
                    disabled={isUpdatingStatus}
                    aria-haspopup="listbox"
                    aria-expanded={statusDropdownOpen}
                    title="Change case status"
                    id="drawer-status-trigger"
                  >
                    <span className={`case-drawer__status-dot case-drawer__status-dot--${(caseData.status || 'open').toLowerCase().replace(/[\s_]/g, '')}`} />
                    <span>
                      {DRAWER_STATUS_OPTIONS.find(
                        (o) => o.value.toLowerCase().replace(/[\s_]/g, '') === (caseData.status || '').toLowerCase().replace(/[\s_]/g, '')
                      )?.label?.toUpperCase() || caseData.status?.toUpperCase() || 'OPEN'}
                    </span>
                    <ChevronDown size={11} className={`case-drawer__status-chevron ${statusDropdownOpen ? 'open' : ''}`} />
                  </button>

                  {statusDropdownOpen && (
                    <ul className="case-drawer__status-dropdown-list" role="listbox">
                      {DRAWER_STATUS_OPTIONS.map((opt) => {
                        const isSelected = (caseData.status || '').toLowerCase().replace(/[\s_]/g, '') === opt.value.toLowerCase().replace(/[\s_]/g, '');
                        const optKey = opt.value.toLowerCase().replace(/[\s_]/g, '');
                        return (
                          <li
                            key={opt.value}
                            role="option"
                            aria-selected={isSelected}
                            className={`case-drawer__status-dropdown-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleStatusSelect(opt.value)}
                          >
                            <span className={`case-drawer__status-dot case-drawer__status-dot--${optKey}`} />
                            <span style={{ flex: 1 }}>{opt.label}</span>
                            {isSelected && <Check size={13} strokeWidth={2.5} />}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <span className="badge-pill badge-pill--severity">
                  {caseData.severity?.toUpperCase() || 'MEDIUM'}
                </span>

                {/* Contact Center (Department) badge */}
                <span className="badge-pill badge-pill--dept">
                  {caseData.departmentName || 'Contact Center'}
                </span>

                {/* Subcategory badge */}
                {caseData.subcategory && (
                  <span className="badge-pill badge-pill--subcat">
                    {caseData.subcategory}
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons: Cleaned up without duplicates */}
            <div className="case-drawer__actions-redesign">
              {caseData.status !== 'Resolved' ? (
                <>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--primary" onClick={() => handleOpenModal('assign')} id="action-assign">
                    <UserCheck size={14} /> Assign / Reassign
                  </button>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => handleOpenModal('transfer')} id="action-transfer">
                    <ArrowRightLeft size={14} /> Transfer dept
                  </button>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => setIsAttachmentsOpen(true)} id="action-attachments">
                    <Paperclip size={14} /> Attachments {caseData.attachments?.length ? `(${caseData.attachments.length})` : ''}
                  </button>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => handleOpenModal('escalate')} id="action-escalate">
                    <AlertTriangle size={14} /> Escalate
                  </button>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => handleOpenModal('link')} id="action-link">
                    <Link2 size={14} /> Link case
                  </button>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => handleOpenModal('resolve')} id="action-resolve">
                    <CheckCircle2 size={14} /> Resolve
                  </button>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => setIsCollaborationOpen(true)} id="action-collaboration" title="Open case collaboration drawer">
                    <Users size={14} /> Case Collaboration
                  </button>
                </>
              ) : (
                <>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => setIsAttachmentsOpen(true)} id="action-attachments">
                    <Paperclip size={14} /> Attachments {caseData.attachments?.length ? `(${caseData.attachments.length})` : ''}
                  </button>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => handleOpenModal('link')} id="action-link">
                    <Link2 size={14} /> Link case
                  </button>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => setIsCollaborationOpen(true)} id="action-collaboration" title="Open case collaboration drawer">
                    <Users size={14} /> Case Collaboration
                  </button>
                  <button
                    className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--primary"
                    onClick={() => handleOpenModal('reopen')}
                    id="action-reopen"
                  >
                    <ArrowRightLeft size={14} /> Reopen case
                  </button>
                </>
              )}
            </div>

            {/* Tabs */}
            <div className="case-drawer__body">
              <Tabs tabs={tabs} defaultTab="details" />
            </div>

            {/* Action Modals */}
            <AssignModal
              isOpen={openModal === 'assign'}
              onClose={() => setOpenModal(null)}
              caseId={caseData.id}
              caseData={caseData}
              users={users}
              currentOwnerId={caseData.ownerId}
              onSuccess={handleSuccess}
            />
            <TransferModal
              isOpen={openModal === 'transfer'}
              onClose={() => setOpenModal(null)}
              caseId={caseData.id}
              caseData={caseData}
              departments={departments}
              onSuccess={handleSuccess}
            />
            <CoworkerModal
              isOpen={openModal === 'coworker'}
              onClose={() => setOpenModal(null)}
              caseId={caseData.id}
              users={users}
              departments={departments}
              existingCoworkerIds={coworkerIds}
              onSuccess={handleSuccess}
            />
            <EscalateModal
              isOpen={openModal === 'escalate'}
              onClose={() => setOpenModal(null)}
              caseId={caseData.id}
              caseData={caseData}
              users={users}
              departments={departments}
              onSuccess={handleSuccess}
            />
            <NoteModal
              isOpen={openModal === 'note'}
              onClose={() => setOpenModal(null)}
              caseId={caseData.id}
              onSuccess={handleSuccess}
            />
            <LinkCaseModal
              isOpen={openModal === 'link'}
              onClose={() => setOpenModal(null)}
              caseId={caseData.id}
              caseData={caseData}
              onSuccess={handleSuccess}
            />
            <ResolveModal
              isOpen={openModal === 'resolve'}
              onClose={() => setOpenModal(null)}
              caseId={caseData.id}
              onSuccess={handleSuccess}
            />
            <ReopenModal
              isOpen={openModal === 'reopen'}
              onClose={() => setOpenModal(null)}
              caseId={caseData.id}
              onSuccess={handleSuccess}
            />

            {/* Sub-Drawers for Collaboration & Attachments */}
            <CollaborationDrawer
              isOpen={isCollaborationOpen}
              onClose={() => setIsCollaborationOpen(false)}
              caseId={caseData.id}
              caseData={caseData}
              users={users}
              onSuccess={handleSuccess}
            />

            <AttachmentsDrawer
              isOpen={isAttachmentsOpen}
              onClose={() => setIsAttachmentsOpen(false)}
              caseId={caseData.id}
              caseData={caseData}
              onSuccess={handleSuccess}
            />
          </>
        )}
      </aside>

      <ConfirmDialog
        isOpen={Boolean(pendingCoworker)}
        title="Remove Co-worker"
        message={`Are you sure you want to remove ${pendingCoworker?.name || 'this co-worker'} from this case?`}
        confirmLabel="Remove"
        onCancel={() => setPendingCoworker(null)}
        onConfirm={confirmRemoveCoworker}
      />
    </>,
    document.body
  );
}

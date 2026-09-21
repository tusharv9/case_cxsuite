// ===== CASE DRAWER =====

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  X, UserCheck, ArrowRightLeft, Users, AlertTriangle,
  FileText, Link2, CheckCircle2, Clock, ArrowRight,
  ChevronDown, Check
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
import { Timeline } from '../../timeline/Timeline.jsx';
import { EmptyState } from '../../common/Loader/Loader.jsx';
import { Skeleton } from '../../common/Skeleton/Skeleton.jsx';
import {
  AssignModal, TransferModal, CoworkerModal,
  EscalateModal, NoteModal, LinkCaseModal, ResolveModal, ReopenModal
} from '../../../components/case/actions/CaseActions.jsx';
import { useCases } from '../../../hooks/useCases.js';
import { useUsers } from '../../../hooks/useUsers.js';
import { useDepartments } from '../../../hooks/useDepartments.js';
import { caseService } from '../../../services/caseService.js';
import { getSlaDisplay, getSlaConfig } from '../../../utils/slaUtils.js';
import { SlaDisplay } from '../../common/SlaDisplay/SlaDisplay.jsx';
import { ConfirmDialog } from '../../common/ConfirmDialog/ConfirmDialog.jsx';
import { useToast } from '../../../hooks/useToast.js';
import { formatFullDateTime, formatDate } from '../../../utils/dateUtils.js';
import { PARTICIPANT_ROLE } from '../../../constants/index.js';
import { createFieldMasker } from '../../../utils/maskUtils.js';
import { configurableSettingsService } from '../../../services/configurableSettingsService.js';
import { ChannelBadge } from '../../case/ChannelBadge/ChannelBadge.jsx';
import './CaseDrawer.css';

// ---- Details Tab ----
function DetailsTab({ caseData, onOpen360 }) {
  const coworkers = caseData.participants?.filter(
    (p) => p.role === PARTICIPANT_ROLE.CO_WORKER || p.role === 'CoWorker'
  ) || [];

  const childRelations = caseData.childRelations || [];
  const reopenRelations = childRelations.filter((cr) => cr.relationType?.toLowerCase() === 'reopen');

  const [masker, setMasker] = useState(() => (apiField, val) => (val === null || val === undefined ? '' : String(val)));

  useEffect(() => {
    let active = true;
    configurableSettingsService
      .getFields('Customer360', null, true)
      .then((fields) => {
        if (!active) return;
        setMasker(() => createFieldMasker(fields || []));
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const rawNric = caseData.customer?.nric || caseData.customer?.idValue || '';
  const maskedNric = masker('idValue', rawNric) || masker('nric', rawNric) || rawNric || '—';
  const maskedPhone = masker('phoneNumber', caseData.customer?.phoneNumber) || caseData.customer?.phoneNumber || '—';
  const maskedDob = caseData.customer?.dateOfBirth ? masker('dateOfBirth', formatDate(caseData.customer.dateOfBirth)) : '';

  return (
    <div className="drawer-details scrollbar-thin">
      {/* CUSTOMER SECTION */}
      <div className="drawer-section">
        <p className="drawer-section-label">CUSTOMER</p>
        <div className="drawer-customer-row">
          <Avatar name={caseData.customer?.fullName} size="md" />
          <div className="drawer-customer-info">
            <p className="drawer-customer-name">{masker('fullName', caseData.customer?.fullName) || caseData.customer?.fullName}</p>
            <p className="drawer-customer-nric">
              NRIC {maskedNric} · {maskedPhone}
              {maskedDob ? ` · DOB ${maskedDob}` : ''}
            </p>
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

      {/* DESCRIPTION SECTION */}
      <div className="drawer-section">
        <p className="drawer-section-label">DESCRIPTION</p>
        <div className="drawer-description">
          {caseData.description || 'No description provided.'}
        </div>
      </div>

      {/* KEY DETAILS SECTION */}
      <div className="drawer-section">
        <p className="drawer-section-label">KEY DETAILS</p>
        <div className="key-details-grid-container">
          {/* Column 1: Core Identification & Status Attributes */}
          <div className="key-details-card">
            <div className="key-details-item">
              <span className="key-details-item__label">Case ID</span>
              <div className="key-details-item__value font-mono">
                {caseData.caseNumber}
                {caseData.parentCaseNumber && (
                  <span className="key-details-parent-pill">
                    Parent: {caseData.parentCaseNumber}
                  </span>
                )}
              </div>
            </div>

            <div className="key-details-item">
              <span className="key-details-item__label">Case Type</span>
              <span className="key-details-item__value">{caseData.caseType || 'Complaint'}</span>
            </div>

            <div className="key-details-item">
              <span className="key-details-item__label">Status</span>
              <div className="key-details-item__value">
                <span className={`key-details-status-pill key-details-status-pill--${(caseData.status || 'open').toLowerCase().replace(/[\s_]/g, '')}`}>
                  <span className="key-details-status-dot" />
                  {caseData.status === 'WaitingOnCustomer' ? 'Waiting on Customer' : (caseData.status === 'InProgress' ? 'In Progress' : caseData.status)}
                </span>
              </div>
            </div>

            <div className="key-details-item">
              <span className="key-details-item__label">Priority / Severity</span>
              <div className="key-details-item__value">
                <span className={`key-details-severity-pill key-details-severity-pill--${(caseData.severity || 'medium').toLowerCase()}`}>
                  {caseData.severity?.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="key-details-item">
              <span className="key-details-item__label">Department &amp; Subcategory</span>
              <span className="key-details-item__value">
                {caseData.departmentName}
                {caseData.subcategory && ` · ${caseData.subcategory}`}
              </span>
            </div>

            <div className="key-details-item">
              <span className="key-details-item__label">Created Date / Time</span>
              <span className="key-details-item__value text-secondary">
                {formatFullDateTime(caseData.createdAt)}
              </span>
            </div>
          </div>

          {/* Column 2: Omnichannel Intake, Preference, People & SLA */}
          <div className="key-details-card">
            <div className="key-details-item">
              <span className="key-details-item__label">Source Channel</span>
              <div className="key-details-item__value">
                <ChannelBadge channel={caseData.sourceChannel || caseData.communicationChannel || 'Voice'} />
              </div>
            </div>

            <div className="key-details-item">
              <span className="key-details-item__label">Preferred Communication Channel</span>
              <span className="key-details-item__value">
                {caseData.preferredCommunicationChannel || caseData.communicationChannel || 'Phone'}
              </span>
            </div>

            <div className="key-details-item">
              <span className="key-details-item__label">Preferred Language</span>
              <span className="key-details-item__value">
                {caseData.preferredLanguage || caseData.customer?.preferredLanguage || 'Bahasa Malaysia'}
              </span>
            </div>

            <div className="key-details-item">
              <span className="key-details-item__label">Customer</span>
              <span className="key-details-item__value">
                {caseData.customer?.fullName || caseData.customerName || '—'}
              </span>
            </div>

            <div className="key-details-item">
              <span className="key-details-item__label">Assignee / Owner</span>
              <div className="key-details-item__value key-details-item__assignee">
                <Avatar name={caseData.ownerName || caseData.owner?.name} size="xs" />
                <span>{caseData.ownerName || caseData.owner?.name || 'Unassigned'}</span>
              </div>
            </div>

            <div className="key-details-item">
              <span className="key-details-item__label">SLA Tracking</span>
              <div className="key-details-item__value">
                <SlaDisplay caseItem={caseData} size="sm" />
              </div>
            </div>
          </div>
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
                  Reopened by {cr.createdByName || 'Agent'} · {formatFullDateTime(cr.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CURRENT OWNER */}
      {caseData.ownerName && (
        <div className="drawer-section">
          <p className="drawer-section-label">CURRENT OWNER</p>
          <div className="owner-card">
            <Avatar name={caseData.ownerName} size="md" />
            <div className="owner-card__info">
              <p className="owner-card__name">{caseData.ownerName}</p>
              {caseData.ownerRole && <p className="owner-card__role">{caseData.ownerRole}</p>}
            </div>
            <span className="badge-pill badge-pill--owner">OWNER</span>
          </div>
        </div>
      )}

      {/* CO-WORKERS */}
      {coworkers.length > 0 && (
        <div className="drawer-section">
          <p className="drawer-section-label">CO-WORKERS ({coworkers.length})</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {coworkers.map((p) => (
              <div key={p.userId} className="owner-card">
                <Avatar name={p.userName} size="md" />
                <div className="owner-card__info">
                  <p className="owner-card__name">{p.userName}</p>
                  {p.roleTitle && <p className="owner-card__role">{p.roleTitle}</p>}
                </div>
                <span className="badge-pill badge-pill--cowork">CO-WORK</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RECENT ACTIVITY */}
      {caseData.events && caseData.events.length > 0 && (
        <div className="drawer-section">
          <p className="drawer-section-label">RECENT ACTIVITY</p>
          <div className="drawer-recent-activity-list">
            {caseData.events.slice(-5).reverse().map((evt) => (
              <div key={evt.id} className="activity-item">
                <div className="activity-item__header">
                  <span className={`badge-pill badge-pill--activity badge-pill--activity-${evt.eventType?.toLowerCase()}`}>
                    {evt.eventType?.toUpperCase()}
                  </span>
                  <span className="activity-item__time">{formatFullDateTime(evt.createdAt)}</span>
                </div>
                <div className="activity-item__body">
                  <p className="activity-item__message">{evt.message}</p>
                </div>
                {evt.userName && (
                  <p className="activity-item__author">by {evt.userName}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- People Tab ----
function PeopleTab({ caseData, onRemoveCoworker }) {
  const coworkers = caseData.participants?.filter(p => p.role === PARTICIPANT_ROLE.CO_WORKER || p.role === 'CoWorker') || [];
  const watchers = caseData.participants?.filter(p => p.role === PARTICIPANT_ROLE.WATCHER || p.role === 'Watcher') || [];

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
              {caseData.ownerRole && <p className="owner-card__role">{caseData.ownerRole}</p>}
            </div>
            <span className="badge-pill badge-pill--owner">OWNER</span>
          </div>
        ) : <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>No owner assigned</p>}
      </div>

      {/* Co-workers */}
      <div className="people-section" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16, marginTop: 16 }}>
        <p className="drawer-section-label">CO-WORKERS ({coworkers.length})</p>
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

      {/* Watchers */}
      <div className="people-section" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16, marginTop: 16 }}>
        <p className="drawer-section-label">WATCHERS / SUPERVISORS ({watchers.length})</p>
        {watchers.length > 0 ? (
          <div className="people-list">
            {watchers.map(p => (
              <div key={p.userId} className="owner-card">
                <Avatar name={p.userName} size="md" />
                <div className="owner-card__info">
                  <p className="owner-card__name">{p.userName}</p>
                </div>
                <span className="badge-pill" style={{ backgroundColor: '#e0f2fe', color: '#0369a1' }}>WATCHER</span>
              </div>
            ))}
          </div>
        ) : <EmptyState title="No watchers" description="Supervisors watching this case will appear here." />}
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
      onUnlinkSuccess?.();
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
          linkRelations.map((cr) => (
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
                  Target Case: {cr.linkedCaseNumber} {cr.linkedCaseTitle ? `· ${cr.linkedCaseTitle}` : ''}
                </p>
              )}
              {cr.reason && (
                <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  <strong>Reason:</strong> {cr.reason}
                </p>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                  Linked by {cr.createdByName || 'Agent'} · {formatFullDateTime(cr.createdAt)}
                </span>
                {cr.linkedCaseNumber && (
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
                    disabled={unlinkingId === cr.linkedCaseNumber}
                    onClick={() => handleUnlink(cr.linkedCaseNumber)}
                  >
                    {unlinkingId === cr.linkedCaseNumber ? 'Unlinking...' : 'Unlink'}
                  </button>
                )}
              </div>
            </div>
          ))
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
  const { refreshBoard, refreshSelectedCase } = useCases();
  const { users, reload: reloadUsers } = useUsers();
  const { departments, reload: reloadDepartments } = useDepartments();

  const [openModal, setOpenModal] = useState(null);
  const [pendingCoworker, setPendingCoworker] = useState(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
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
      if (newNorm === 'waitingoncustomer') {
        toast.info('Status updated to Waiting on Customer. SLA clock paused.');
      } else if (currentNorm === 'waitingoncustomer' || Boolean(caseData.slaPausedAt)) {
        toast.success(`Status updated to ${newStatus}. SLA clock resumed.`);
      } else {
        toast.success(`Status updated to ${newStatus}.`);
      }
      await handleSuccess();
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
      // The co-worker stays on the case and the dialog stays open so the action can be retried.
      toast.error(e.message || 'Failed to remove co-worker.');
    }
  };

  const coworkerIds = caseData?.participants
    ?.filter(p => p.role === PARTICIPANT_ROLE.CO_WORKER || p.role === 'CoWorker' || p.role?.toLowerCase() === 'coworker')
    .map(p => p.userId) || [];

  const sla = caseData
    ? getSlaDisplay(
        caseData.slaStartTime,
        getSlaConfig(caseData.severity, caseData.slaTargetHours).internalHours,
        caseData.status,
        Date.now(),
        caseData.slaPausedAt,
        caseData.slaTotalPausedMinutes
      )
    : null;

  const childRelations = caseData?.childRelations || [];
  const linkRelations = childRelations.filter((cr) => cr.relationType?.toLowerCase() === 'link');
  const linkedCount = Math.max(caseData?.linkedCases?.length || 0, linkRelations.length);

  const tabs = caseData
    ? [
        {
          key: 'details',
          label: 'Details',
          content: <DetailsTab caseData={caseData} onOpen360={(id) => { onClose(); navigate(`/customer360/${id}`); }} />,
        },
        {
          key: 'workflow',
          label: 'Workflow timeline',
          count: caseData.events?.length || 0,
          content: (
            <div className="scrollbar-thin" style={{ overflowY: 'auto', height: '100%', padding: '0 20px' }}>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)', padding: '12px 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Workflow timeline · {caseData.events?.length || 0} Events
              </p>
              <Timeline events={caseData.events || []} />
            </div>
          ),
        },
        {
          key: 'people',
          label: 'People',
          count: caseData.participants?.length || 0,
          content: <PeopleTab caseData={caseData} onRemoveCoworker={setPendingCoworker} />,
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
            {/* Header */}
            <div className="case-drawer__header-redesign">
              <div className="case-drawer__header-top">
                <span className="case-drawer__case-ref-redesign">
                  {caseData.caseNumber} &middot; {caseData.departmentName ? caseData.departmentName.toUpperCase() : 'UNKNOWN'}
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
                  {caseData.severity?.toUpperCase()}
                </span>
                {sla && (
                  <span className={`badge-pill badge-pill--sla ${sla.status === 'paused' ? 'badge-pill--sla-paused' : ''}`}>
                    <Clock size={12} />
                    SLA &middot; {sla.label}
                  </span>
                )}
                <span className="badge-pill badge-pill--dept">
                  {caseData.departmentName}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="case-drawer__actions-redesign">
              {caseData.status !== 'Resolved' ? (
                <>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--primary" onClick={() => handleOpenModal('assign')} id="action-assign">
                    <UserCheck size={14} /> Assign / Reassign
                  </button>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => handleOpenModal('transfer')} id="action-transfer">
                    <ArrowRightLeft size={14} /> Transfer dept
                  </button>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => handleOpenModal('coworker')} id="action-coworker">
                    <Users size={14} /> + Co-worker
                  </button>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => handleOpenModal('escalate')} id="action-escalate">
                    <AlertTriangle size={14} /> Escalate
                  </button>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => handleOpenModal('note')} id="action-note">
                    <FileText size={14} /> Add note
                  </button>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => handleOpenModal('link')} id="action-link">
                    <Link2 size={14} /> Link case
                  </button>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => handleOpenModal('resolve')} id="action-resolve">
                    <CheckCircle2 size={14} /> Resolve
                  </button>
                </>
              ) : (
                <>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => handleOpenModal('note')} id="action-note">
                    <FileText size={14} /> Add note
                  </button>
                  <button className="case-drawer__action-btn-redesign case-drawer__action-btn-redesign--outline" onClick={() => handleOpenModal('link')} id="action-link">
                    <Link2 size={14} /> Link case
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

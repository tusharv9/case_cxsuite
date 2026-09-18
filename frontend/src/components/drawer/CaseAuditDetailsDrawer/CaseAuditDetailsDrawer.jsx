// ===== CASE AUDIT DETAILS DRAWER — Business Focused =====

import { createPortal } from 'react-dom';
import { X, Shield, User, Globe, FileText, CheckCircle2, Calendar, Briefcase, Tag } from 'lucide-react';
import { Button } from '../../common/Button/Button.jsx';
import { formatDate } from '../../../utils/dateUtils.js';
import './CaseAuditDetailsDrawer.css';
import '../CreateCaseDrawer/CreateCaseDrawer.css';

export function CaseAuditDetailsDrawer({ isOpen, onClose, auditRecord }) {
  if (!isOpen || !auditRecord) return null;

  return createPortal(
    <>
      <div className="create-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside
        className="create-drawer audit-details-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Audit Record Details"
      >
        {/* Header */}
        <div className="create-drawer__header">
          <div className="create-drawer__header-content" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <Shield size={20} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>Audit Record Details</h2>
              <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', opacity: 0.88 }}>
                Full event context, actor, and execution metadata
              </p>
            </div>
          </div>
          <button className="create-drawer__close" onClick={onClose} aria-label="Close drawer">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="create-drawer__body scrollbar-thin">
          {/* Card Grid Overview */}
          <div className="audit-details-card-grid">
            <div className="audit-details-card">
              <span className="audit-details-card__label">
                <User size={12} /> User Role
              </span>
              <p className="audit-details-card__value">{auditRecord.actorRole || 'Administrator'}</p>
            </div>

            <div className="audit-details-card">
              <span className="audit-details-card__label">
                <Globe size={12} /> Client IP (IPv4)
              </span>
              <p className="audit-details-card__value">{auditRecord.ipAddress || '127.0.0.1'}</p>
            </div>
          </div>

          {/* Target Entity / Module Context */}
          <div className="audit-details-section">
            <div className="audit-details-section__title">
              <Briefcase size={13} /> {auditRecord.module || 'Target Context'}
            </div>

            <div className="audit-details-row">
              <span className="audit-details-row__label">{auditRecord.module ? 'Module / Entity' : 'Case Identifier'}</span>
              <p className="audit-details-row__value" style={{ fontWeight: 700, color: '#1d4ed8' }}>
                {auditRecord.entityName || auditRecord.caseNumber || 'System'}
              </p>
            </div>

            {auditRecord.caseTitle && auditRecord.caseTitle !== 'System Settings' && (
              <div className="audit-details-row">
                <span className="audit-details-row__label">Case Title</span>
                <p className="audit-details-row__value">{auditRecord.caseTitle}</p>
              </div>
            )}

            {auditRecord.customerName && (
              <div className="audit-details-row">
                <span className="audit-details-row__label">Customer Name</span>
                <p className="audit-details-row__value" style={{ fontWeight: 600 }}>
                  {auditRecord.customerName}
                </p>
              </div>
            )}

            {auditRecord.departmentName && (
              <div className="audit-details-row">
                <span className="audit-details-row__label">Department</span>
                <p className="audit-details-row__value">{auditRecord.departmentName}</p>
              </div>
            )}
          </div>

          {/* Audit Event Details */}
          <div className="audit-details-section">
            <div className="audit-details-section__title">
              <FileText size={13} /> Event Execution Details
            </div>

            <div className="audit-details-row">
              <span className="audit-details-row__label">Action Type</span>
              <p className="audit-details-row__value" style={{ fontWeight: 600 }}>
                {auditRecord.actionLabel || auditRecord.actionType}
              </p>
            </div>

            <div className="audit-details-row">
              <span className="audit-details-row__label">Performed By</span>
              <p className="audit-details-row__value">
                {auditRecord.actorName} ({auditRecord.actorRole})
              </p>
            </div>

            <div className="audit-details-row">
              <span className="audit-details-row__label">Timestamp</span>
              <p className="audit-details-row__value">
                {formatDate(auditRecord.timestamp)}
              </p>
            </div>

            <div className="audit-details-row">
              <span className="audit-details-row__label">Execution Status</span>
              <div>
                <span className="audit-badge-success">
                  <CheckCircle2 size={11} /> {auditRecord.status || 'Success'}
                </span>
              </div>
            </div>

            {/* Old Value & New Value Diff Display */}
            {(auditRecord.oldValue || auditRecord.previousStatus) && (
              <div className="audit-details-row" style={{ marginTop: 6 }}>
                <span className="audit-details-row__label" style={{ color: '#b91c1c' }}>Old Value</span>
                <p
                  className="audit-details-row__value"
                  style={{
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    padding: '8px 12px',
                    borderRadius: 6,
                    marginTop: 2,
                    fontSize: '12.5px',
                    color: '#991b1b',
                    fontFamily: 'monospace'
                  }}
                >
                  {auditRecord.oldValue || auditRecord.previousStatus}
                </p>
              </div>
            )}

            {(auditRecord.newValue || auditRecord.newStatus) && (
              <div className="audit-details-row" style={{ marginTop: 6 }}>
                <span className="audit-details-row__label" style={{ color: '#15803d' }}>New Value</span>
                <p
                  className="audit-details-row__value"
                  style={{
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    padding: '8px 12px',
                    borderRadius: 6,
                    marginTop: 2,
                    fontSize: '12.5px',
                    color: '#166534',
                    fontFamily: 'monospace'
                  }}
                >
                  {auditRecord.newValue || auditRecord.newStatus}
                </p>
              </div>
            )}

            <div className="audit-details-row" style={{ marginTop: 6 }}>
              <span className="audit-details-row__label">Event Description</span>
              <p
                className="audit-details-row__value"
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  padding: '10px 12px',
                  borderRadius: 6,
                  marginTop: 4,
                  fontSize: '13px'
                }}
              >
                {auditRecord.description}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="create-drawer__footer">
          <Button variant="outline" onClick={onClose}>
            Close Details
          </Button>
        </div>
      </aside>
    </>,
    document.body
  );
}

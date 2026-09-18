// ===== REUSABLE CONFIRMATION DIALOG / DELETE DRAWER =====
// Every destructive action routes through this component with a prominent red header,
// detailed item inspection layout, deletion impact summary, and explicit cancel/delete safety.

import { AlertTriangle, Trash2, CheckCircle2, ShieldAlert, Info } from 'lucide-react';
import { Button } from '../Button/Button.jsx';
import { Modal } from '../Modal/Modal.jsx';
import './ConfirmDialog.css';

function parseItemName(title, message, itemDetails) {
  if (itemDetails?.name || itemDetails?.itemName) {
    return itemDetails.name || itemDetails.itemName;
  }
  if (message) {
    const match = message.match(/["'“]([^"'”]+)["'”]/);
    if (match && match[1]) return match[1];
  }
  if (title) {
    const cleanTitle = title.replace(/^Delete\s+/i, '');
    if (cleanTitle) return cleanTitle;
  }
  return 'Selected Item';
}

export function ConfirmDialog({
  isOpen,
  title = 'Delete Confirmation',
  message,
  confirmLabel = 'Delete',
  isBusy = false,
  onCancel,
  onConfirm,
  itemDetails = null,
  variant = 'destructive',
}) {
  const itemName = parseItemName(title, message, itemDetails);

  return (
    <Modal
      isOpen={isOpen}
      onClose={isBusy ? () => {} : onCancel}
      title={title}
      variant={variant}
      size="sm"
      footer={
        <div className="confirm-dialog__actions">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isBusy}
            id="btn-confirm-cancel"
            style={{ fontWeight: 600, color: '#475569' }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            isLoading={isBusy}
            onClick={onConfirm}
            id="btn-confirm-delete"
            leftIcon={<Trash2 size={15} />}
            style={{
              backgroundColor: '#dc2626',
              borderColor: '#b91c1c',
              fontWeight: 700,
              boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)'
            }}
          >
            {isBusy ? 'Deleting…' : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="delete-drawer-content scrollbar-thin">
        {/* 1. TOP ALERT HEADER CARD */}
        <div className="delete-alert-header-card">
          <div className="delete-alert-header-card__icon">
            <AlertTriangle size={20} />
          </div>
          <div>
            <h4 className="delete-alert-header-card__title">Delete Confirmation</h4>
            <p className="delete-alert-header-card__subtitle">
              You are about to permanently delete the following configuration item:
            </p>
          </div>
        </div>

        {/* 2. DYNAMIC ITEM DETAILS CARD */}
        <div className="delete-item-details-card">
          <div className="delete-item-details-card__header">
            <span className="delete-item-details-card__label">Selected Item</span>
            <span className="delete-item-badge-active">
              <CheckCircle2 size={11} /> Active
            </span>
          </div>

          <div className="delete-item-details-card__name">
            {itemName}
          </div>

          {/* METADATA GRID */}
          <div className="delete-item-details-grid">
            {itemDetails?.apiField && (
              <div className="delete-item-meta-row">
                <span className="delete-meta-label">API Field:</span>
                <code className="delete-meta-code">{itemDetails.apiField}</code>
              </div>
            )}

            {itemDetails?.code && (
              <div className="delete-item-meta-row">
                <span className="delete-meta-label">Code / Key:</span>
                <code className="delete-meta-code">{itemDetails.code}</code>
              </div>
            )}

            {itemDetails?.prefix && (
              <div className="delete-item-meta-row">
                <span className="delete-meta-label">Prefix:</span>
                <span className="delete-meta-value">{itemDetails.prefix}</span>
              </div>
            )}

            {itemDetails?.type && (
              <div className="delete-item-meta-row">
                <span className="delete-meta-label">Type:</span>
                <span className="delete-meta-value">{itemDetails.type}</span>
              </div>
            )}

            {itemDetails?.section && (
              <div className="delete-item-meta-row">
                <span className="delete-meta-label">Section:</span>
                <span className="delete-meta-value">{itemDetails.section}</span>
              </div>
            )}

            {itemDetails?.maskingRule && itemDetails.maskingRule !== 'None' && (
              <div className="delete-item-meta-row">
                <span className="delete-meta-label">Masking Rule:</span>
                <span className="delete-meta-value">{itemDetails.maskingRule}</span>
              </div>
            )}

            {itemDetails?.slaHours && (
              <div className="delete-item-meta-row">
                <span className="delete-meta-label">SLA Hours:</span>
                <span className="delete-meta-value">{itemDetails.slaHours}</span>
              </div>
            )}
          </div>
        </div>

        {/* 3. DELETION IMPACT SUMMARY */}
        <div className="delete-impact-card">
          <h5 className="delete-impact-title">Deletion Impact</h5>
          <div className="delete-impact-comparison">
            <div className="delete-impact-state delete-impact-state--current">
              <span className="delete-state-badge">Current Configuration</span>
              <span className="delete-state-text">{itemName}</span>
            </div>
            <div className="delete-impact-arrow">&rarr;</div>
            <div className="delete-impact-state delete-impact-state--after">
              <span className="delete-state-badge delete-state-badge--removed">After Deletion</span>
              <span className="delete-state-text delete-state-text--muted">
                This configuration will be removed.
              </span>
            </div>
          </div>
          {itemDetails?.impactNote && (
            <p className="delete-impact-note">
              <Info size={13} /> {itemDetails.impactNote}
            </p>
          )}
        </div>

        {/* 4. WARNING CALLOUT BANNER */}
        <div className="delete-warning-banner">
          <div className="delete-warning-banner__icon">
            <ShieldAlert size={18} />
          </div>
          <div className="delete-warning-banner__text">
            <strong>This action cannot be undone.</strong> Deleting this item may affect where this option is displayed or used in the application.
          </div>
        </div>

        {/* 5. CONFIRMATION QUESTION */}
        <div className="delete-confirmation-prompt">
          Are you sure you want to continue?
        </div>
      </div>
    </Modal>
  );
}

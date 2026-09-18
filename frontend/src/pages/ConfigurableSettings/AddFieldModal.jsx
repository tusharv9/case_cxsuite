// ===== ADD / EDIT FIELD SIDE DRAWER =====
// The same drawer serves both flows so the create and edit forms cannot drift apart.

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Save } from 'lucide-react';
import { Button } from '../../components/common/Button/Button.jsx';
import { Input, Select, Checkbox } from '../../components/common/Input/Input.jsx';
import './AddFieldModal.css';

export function AddFieldModal({
  isOpen,
  onClose,
  onAdd,
  onSave,
  sectionKey,
  existingCount = 0,
  /** When supplied the drawer edits this field instead of creating a new one. */
  editingField = null,
}) {
  const isEditMode = Boolean(editingField);

  const buildInitialForm = useCallback(
    () =>
      editingField
        ? {
            displayLabel: editingField.displayLabel ?? '',
            fieldType: editingField.fieldType || 'Text',
            isRequired: Boolean(editingField.isRequired),
            isVisible: editingField.isVisible !== false,
            isEditable: editingField.isEditable !== false,
            isSensitive: Boolean(editingField.isSensitive),
            maskingRule: editingField.maskingRule || 'None',
            visibleChars: editingField.visibleChars ?? 4,
            displayOrder: editingField.displayOrder ?? 0,
            lookupTypeCode: editingField.lookupTypeCode || '',
          }
        : {
            displayLabel: '',
            fieldType: 'Text',
            isRequired: false,
            isVisible: true,
            isEditable: true,
            isSensitive: false,
            maskingRule: 'None',
            visibleChars: 4,
            displayOrder: existingCount ? existingCount + 1 : 10,
            lookupTypeCode: '',
          },
    [editingField, existingCount]
  );

  const [form, setForm] = useState(buildInitialForm);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form whenever the drawer opens or switches between add and edit
  useEffect(() => {
    if (isOpen) {
      setForm(buildInitialForm());
      setErrors({});
      setIsSubmitting(false);
    }
  }, [isOpen, buildInitialForm]);

  // Handle ESC key press and body scrolling
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: val }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSave = async () => {
    const nextErrors = {};
    if (!form.displayLabel.trim()) nextErrors.displayLabel = 'Display label is required.';

    const order = Number(form.displayOrder);
    if (Number.isNaN(order) || order < 0) nextErrors.displayOrder = 'Display order must be 0 or greater.';

    const chars = Number(form.visibleChars);
    if (Number.isNaN(chars) || chars < 0) nextErrors.visibleChars = 'Visible characters must be 0 or greater.';

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const payload = {
      sectionKey: sectionKey || 'AddNewCustomer',
      displayLabel: form.displayLabel.trim(),
      fieldType: form.fieldType,
      isRequired: form.isRequired,
      isVisible: form.isVisible,
      isEditable: form.isEditable,
      isSensitive: form.isSensitive,
      maskingRule: form.maskingRule,
      visibleChars: chars,
      displayOrder: order,
      lookupTypeCode: form.fieldType === 'Dropdown' ? form.lookupTypeCode || null : null,
    };

    const handler = onAdd || onSave;
    if (!handler) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      // The parent rejects when the API call fails, so the drawer stays open with the
      // entered values rather than closing over a failed save.
      await handler(payload, editingField);
      onClose();
    } catch {
      // Error already surfaced as a toast by the parent.
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <>
      <div className="create-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside
        className="create-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={isEditMode ? 'Edit configurable field' : 'Add new configurable field'}
      >
        {/* Header */}
        <div className="create-drawer__header">
          <div className="create-drawer__header-content">
            <h2>{isEditMode ? 'Edit Configurable Field' : 'Add New Configurable Field'}</h2>
            <p>
              {isEditMode
                ? `Editing ${editingField.apiField} — changes are saved to the database`
                : 'Configure label, field type, requirement, visibility, and masking'}
            </p>
          </div>
          <button className="create-drawer__close" onClick={onClose} aria-label="Close drawer">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="create-drawer__body scrollbar-thin" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Input
            label="Display Label"
            required
            placeholder="e.g. Occupation, Alternate Contact, Alternate Phone"
            value={form.displayLabel}
            onChange={set('displayLabel')}
            error={errors.displayLabel}
          />

          <Select label="Field Type" value={form.fieldType} onChange={set('fieldType')}>
            <option value="Text">Text Input</option>
            <option value="Number">Number</option>
            <option value="Date">Date Picker</option>
            <option value="Phone">Phone Number</option>
            <option value="Email">Email Address</option>
            <option value="Dropdown">Dropdown Selection</option>
            <option value="Checkbox">Checkbox / Toggle</option>
          </Select>

          {form.fieldType === 'Dropdown' && (
            <Select label="Master Lookup Code (Optional)" value={form.lookupTypeCode} onChange={set('lookupTypeCode')}>
              <option value="">-- Select Master Lookup --</option>
              <option value="PREFERRED_LANGUAGE">PREFERRED_LANGUAGE</option>
              <option value="HOME_BRANCH">HOME_BRANCH</option>
              <option value="ID_TYPE">ID_TYPE</option>
              <option value="COMMUNICATION_CHANNEL">COMMUNICATION_CHANNEL</option>
            </Select>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Input
              label="Display Order"
              type="number"
              min={0}
              value={form.displayOrder}
              onChange={set('displayOrder')}
              error={errors.displayOrder}
            />
            <Select label="Masking Rule" value={form.maskingRule} onChange={set('maskingRule')}>
              <option value="None">No Masking</option>
              <option value="FullMask">Full Mask</option>
              <option value="HideMiddle">Hide Middle, Show Ends</option>
              <option value="HideFirstShowLast">Hide First, Show Last</option>
            </Select>
          </div>

          <Input
            label="Visible Characters (used by the masking rule)"
            type="number"
            min={0}
            value={form.visibleChars}
            onChange={set('visibleChars')}
            error={errors.visibleChars}
            disabled={form.maskingRule === 'None'}
          />

          <div className="drawer-field-options-group">
            <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>Field Permissions &amp; Visibility</label>
            <div className="drawer-checkbox-grid">
              <Checkbox
                label="Visible"
                checked={form.isVisible}
                onChange={set('isVisible')}
              />
              <Checkbox
                label="Required"
                checked={form.isRequired}
                onChange={set('isRequired')}
              />
              <Checkbox
                label="Editable"
                checked={form.isEditable}
                onChange={set('isEditable')}
              />
              <Checkbox
                label="Sensitive"
                checked={form.isSensitive}
                onChange={set('isSensitive')}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="create-drawer__footer">
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button
            className="create-drawer__submit"
            variant="primary"
            isLoading={isSubmitting}
            leftIcon={isEditMode ? <Save size={15} /> : <Plus size={15} />}
            onClick={handleSave}
            id="btn-submit-field-drawer"
          >
            {isEditMode ? 'Save Changes' : 'Create Field'}
          </Button>
        </div>
      </aside>
    </>,
    document.body
  );
}


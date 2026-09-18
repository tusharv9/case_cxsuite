// ===== MASTER DATA LIST ROW =====
// One row of a master-data list (language, branch, department, severity, case type, …).
// Renders read-only until Edit is pressed, then turns the same row into inputs so the admin
// edits in place instead of losing the surrounding list context.

import { useEffect, useState } from 'react';
import { Check, Pencil, Trash2, X, Eye, EyeOff } from 'lucide-react';

/**
 * @param {Array<{key: string, placeholder?: string, width?: number}>} fields Editable fields
 * @param {object} initial Current values, keyed by field key
 * @param {Function} onSave  async (values) => void — rejects to keep the row in edit mode
 * @param {Function} onDelete Opens the confirmation dialog; never deletes directly
 */
export function MasterItem({
  fields,
  initial,
  onSave,
  onDelete,
  children,
  editLabel = 'Edit',
  deleteLabel = 'Delete',
  canDelete = true,
  deleteDisabledReason = '',
  showDelete = true,
  showVisibility = false,
  isVisible = true,
  onToggleVisibility = null,
  isTogglingVisibility = false,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState(initial);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isEditing) setValues(initial);
    // `initial` is rebuilt on every render by the parent, so it is compared field by field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, JSON.stringify(initial)]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(values);
      setIsEditing(false);
    } catch {
      // The parent surfaces the error as a toast; the row stays open so the value is not lost.
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !isSaving) handleSave();
    if (e.key === 'Escape') setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="master-card__item master-card__item--editing">
        <div className="master-card__edit-fields">
          {fields.map((f) => (
            <input
              key={f.key}
              type="text"
              className="input-field input-field--sm"
              placeholder={f.placeholder || ''}
              style={f.width ? { maxWidth: f.width } : undefined}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              onKeyDown={handleKeyDown}
              autoFocus={f === fields[0]}
              disabled={isSaving}
            />
          ))}
        </div>
        <div className="master-card__item-actions">
          <button
            className="btn-icon-success"
            onClick={handleSave}
            disabled={isSaving}
            title="Save changes"
            aria-label="Save changes"
          >
            <Check size={14} />
          </button>
          <button
            className="btn-icon-neutral"
            onClick={() => setIsEditing(false)}
            disabled={isSaving}
            title="Cancel"
            aria-label="Cancel editing"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`master-card__item ${showVisibility && !isVisible ? 'master-card__item--not-visible' : ''}`}>
      <div className="master-card__item-left">
        {children}
        {showVisibility && !isVisible && (
          <span className="not-visible-badge" title="Not Visible">
            <EyeOff size={11} /> Not Visible
          </span>
        )}
      </div>
      <div className="master-card__item-actions">
        {showVisibility && onToggleVisibility && (
          <button
            className={`btn-toggle-eye ${isVisible ? 'btn-toggle-eye--active' : ''}`}
            onClick={onToggleVisibility}
            disabled={isTogglingVisibility}
            title={isVisible ? 'Visible (Click to make Not Visible)' : 'Not Visible (Click to make Visible)'}
            aria-label={isVisible ? 'Visible' : 'Not Visible'}
          >
            {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        )}
        <button
          className="btn-icon-neutral"
          onClick={() => setIsEditing(true)}
          title={editLabel}
          aria-label={editLabel}
        >
          <Pencil size={14} />
        </button>
        {showDelete && (
          <button
            className="btn-icon-danger"
            onClick={onDelete}
            disabled={!canDelete}
            title={canDelete ? deleteLabel : deleteDisabledReason || deleteLabel}
            aria-label={deleteLabel}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ===== ADD / EDIT FIELD DRAWER =====
// ONE drawer for both flows, driven by the field type: only the settings that mean something for the chosen type are shown
// (what applies comes from the API's /api/metadata/field-types, the same table the server validates against). A dropdown also
// manages its own options here — the options live in the central lookup tables, shared by every form that uses the list.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Save, Trash2, ListPlus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '../../components/common/Button/Button.jsx';
import { SideDrawer } from '../../components/common/SideDrawer/SideDrawer.jsx';
import { Input, Select, Checkbox } from '../../components/common/Input/Input.jsx';
import { configurableSettingsService } from '../../services/configurableSettingsService.js';
import { metadataService } from '../../services/metadataService.js';
import './AddFieldModal.css';
import './FieldEditorDrawer.css';

const FIELD_TYPE_LABELS = [
  ['Text', 'Text Input'],
  ['Number', 'Number'],
  ['Date', 'Date Picker'],
  ['Phone', 'Phone Number'],
  ['Email', 'Email Address'],
  ['Dropdown', 'Dropdown Selection'],
  ['Checkbox', 'Checkbox / Toggle'],
];

const MASKING_RULES = [
  ['None', 'No Masking'],
  ['FullMask', 'Full Mask'],
  ['HideMiddle', 'Hide Middle, Show Ends'],
  ['HideFirstShowLast', 'Hide First, Show Last'],
];

// If the capability table cannot be fetched, every setting is offered; the server still rejects what does not apply.
const ALL_ALLOWED = { length: true, pattern: true, range: true, lookup: true, masking: true };
const NONE_ALLOWED = { length: false, pattern: false, range: false, lookup: false, masking: false };

const fieldKey = (f) => f.id || f.draftKey || f.apiField;
const toCode = (name) => String(name || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const sameText = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

function initialForm(editingField, nextOrder) {
  const f = editingField;
  return f
    ? {
        displayLabel: f.displayLabel ?? '',
        fieldType: f.fieldType || 'Text',
        isRequired: Boolean(f.isRequired),
        isVisible: f.isVisible !== false,
        maskingRule: f.maskingRule || 'None',
        visibleChars: f.visibleChars ?? 4,
        displayOrder: f.displayOrder ?? 0,
        lookupTypeCode: f.lookupTypeCode || '',
        validationRegex: f.validationRegex || '',
        validationMessage: f.validationMessage || '',
        minLength: f.minLength ?? '',
        maxLength: f.maxLength ?? '',
        minValue: f.minValue ?? '',
        maxValue: f.maxValue ?? '',
      }
    : {
        displayLabel: '', fieldType: 'Text', isRequired: false, isVisible: true, maskingRule: 'None', visibleChars: 4,
        displayOrder: nextOrder, lookupTypeCode: '', validationRegex: '', validationMessage: '',
        minLength: '', maxLength: '', minValue: '', maxValue: '',
      };
}

export function FieldEditorDrawer({
  isOpen,
  onClose,
  onAdd,
  sectionKey,
  /** The fields of the form being edited (drafts included): used to keep display orders unique. */
  existingFields = [],
  /** When supplied the drawer edits this field instead of creating a new one. */
  editingField = null,
  /** Configured lists a dropdown field can be bound to: [{ code, name, allowAdd }]. */
  lookupTypes = [],
  /** Option changes already made in this editing session, per list. */
  lookupDrafts = {},
}) {
  const isEditMode = Boolean(editingField);
  const originalType = editingField?.fieldType;
  // The types this field may become. A built-in field is stored in a fixed column of the record, which limits the choice
  // (the server sends the list); a custom field can become any type its stored values fit.
  const typeChoices = useMemo(() => {
    const allowed = editingField?.allowedFieldTypes;
    return allowed ? FIELD_TYPE_LABELS.filter(([value]) => allowed.includes(value)) : FIELD_TYPE_LABELS;
  }, [editingField]);
  const nextOrder = useMemo(() => Math.max(0, ...existingFields.map((f) => Number(f.displayOrder) || 0)) + 1, [existingFields]);

  const [form, setForm] = useState(() => initialForm(editingField, nextOrder));
  const [baseline, setBaseline] = useState(() => JSON.stringify(initialForm(editingField, nextOrder)));
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [capabilityTable, setCapabilityTable] = useState(null);
  const [typeCheck, setTypeCheck] = useState({ status: 'idle', message: '' });   // idle | checking | ok | bad
  const [idRules, setIdRules] = useState([]);

  // ---- options of the chosen list -------------------------------------------------------------------------------------
  const [mode, setMode] = useState('existing');            // 'existing' list | 'new' list
  const [newListName, setNewListName] = useState('');
  const [options, setOptions] = useState([]);              // working copy: [{ id?, value, label, displayOrder, isActive }]
  const [storedOptions, setStoredOptions] = useState([]);  // as stored on the server
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState('');
  const [newOption, setNewOption] = useState('');
  const [optionsTouched, setOptionsTouched] = useState(false);

  useEffect(() => {
    configurableSettingsService.getIdFormatRules().then(setIdRules).catch(() => setIdRules([]));
  }, []);

  useEffect(() => {
    metadataService.getFieldTypes()
      .then((rows) => setCapabilityTable(Object.fromEntries(rows.map((r) => [r.type.toLowerCase(), r]))))
      .catch(() => setCapabilityTable(false));
  }, []);

  // Reset whenever the drawer opens or switches between add and edit.
  useEffect(() => {
    if (!isOpen) return;
    const start = initialForm(editingField, nextOrder);
    setForm(start);
    setBaseline(JSON.stringify(start));
    setErrors({});
    setIsSubmitting(false);
    setMode('existing');
    setNewListName('');
    setNewOption('');
    setOptionsTouched(false);
    setOptions([]);
    setStoredOptions([]);
    setOptionsError('');
    setTypeCheck({ status: 'idle', message: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingField]);

  const caps = capabilityTable === null
    ? NONE_ALLOWED
    : capabilityTable === false
      ? ALL_ALLOWED
      : capabilityTable[form.fieldType.toLowerCase()] || NONE_ALLOWED;

  const lookupType = lookupTypes.find((t) => t.code === form.lookupTypeCode);
  const canAddOptions = mode === 'new' || lookupType?.allowAdd !== false;
  const usesFormatRules = mode === 'existing' && Boolean(lookupType?.usesFormatRules);

  // Load the stored options of the selected list (a draft made earlier in this session wins).
  useEffect(() => {
    if (!isOpen || form.fieldType !== 'Dropdown' || mode !== 'existing' || !form.lookupTypeCode) return undefined;
    let current = true;
    setOptionsLoading(true);
    setOptionsError('');
    configurableSettingsService.getLookupValues(form.lookupTypeCode, true, false)
      .then((rows) => {
        if (!current) return;
        const stored = (rows || []).map((r) => ({ id: r.id, value: r.value, label: r.label || r.value, displayOrder: r.displayOrder, isActive: r.isActive, formatRule: r.formatRule || '', formatRegex: r.formatRegex || '', formatMessage: r.formatMessage || '' }));
        setStoredOptions(stored);
        const draft = lookupDrafts[form.lookupTypeCode];
        setOptions(draft ? draft.values.map((v) => ({ ...v })) : stored);
        setOptionsTouched(Boolean(draft));
      })
      .catch((err) => current && setOptionsError(err.message || 'The options could not be loaded.'))
      .finally(() => current && setOptionsLoading(false));
    return () => { current = false; };
  }, [isOpen, form.fieldType, form.lookupTypeCode, mode, lookupDrafts]);

  const isDirty = JSON.stringify(form) !== baseline || optionsTouched || newListName.trim() !== '';

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: val }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  // ---- option editing ----------------------------------------------------------------------------------------------------
  const touchOptions = (next) => { setOptions(next); setOptionsTouched(true); };

  const addOption = () => {
    const text = newOption.trim();
    if (!text) return;
    if (options.some((o) => sameText(o.value, text) || sameText(o.label, text))) {
      setOptionsError(`"${text}" is already in this list.`);
      return;
    }
    setOptionsError('');
    touchOptions([...options, { value: text, label: text, displayOrder: options.length + 1, isActive: true, formatRule: '', formatRegex: '', formatMessage: '' }]);
    setNewOption('');
  };

  const updateOption = (index, patch) => touchOptions(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  const removeNewOption = (index) => touchOptions(options.filter((_, i) => i !== index));

  const changedOptions = useMemo(() => {
    if (!optionsTouched) return false;
    if (mode === 'new') return options.length > 0 || newListName.trim() !== '';
    return JSON.stringify(options) !== JSON.stringify(storedOptions) || Boolean(lookupDrafts[form.lookupTypeCode]);
  }, [optionsTouched, mode, options, storedOptions, newListName, lookupDrafts, form.lookupTypeCode]);

  // ---- save ----------------------------------------------------------------------------------------------------------------
  const validate = () => {
    const next = {};
    if (!form.displayLabel.trim()) next.displayLabel = 'Display label is required.';

    const order = Number(form.displayOrder);
    if (form.displayOrder === '' || Number.isNaN(order) || order < 0) next.displayOrder = 'Display order must be 0 or greater.';
    else if (existingFields.some((f) => (!editingField || fieldKey(f) !== fieldKey(editingField)) && Number(f.displayOrder) === order)) {
      next.displayOrder = `Display order ${order} is already assigned to another field. Please choose a different display order.`;
    }

    if (caps.masking && (Number.isNaN(Number(form.visibleChars)) || Number(form.visibleChars) < 0)) next.visibleChars = 'Visible characters must be 0 or greater.';

    if (caps.length) {
      const minL = form.minLength === '' ? null : Number(form.minLength);
      const maxL = form.maxLength === '' ? null : Number(form.maxLength);
      if (minL !== null && (Number.isNaN(minL) || minL < 0)) next.minLength = 'Minimum length must be 0 or greater.';
      if (maxL !== null && (Number.isNaN(maxL) || maxL < 1)) next.maxLength = 'Maximum length must be 1 or greater.';
      if (minL !== null && maxL !== null && minL > maxL) next.maxLength = 'Maximum length cannot be below the minimum.';
    }
    if (caps.pattern && form.validationRegex.trim()) {
      try { new RegExp(form.validationRegex.trim()); } catch { next.validationRegex = 'This is not a valid regular expression.'; }
    }
    if (caps.range) {
      const isDate = form.fieldType === 'Date';
      const parse = (v) => (v === '' ? null : isDate ? Date.parse(v) : Number(v));
      const lo = parse(form.minValue);
      const hi = parse(form.maxValue);
      if (lo !== null && Number.isNaN(lo)) next.minValue = `Minimum must be a valid ${isDate ? 'date' : 'number'}.`;
      if (hi !== null && Number.isNaN(hi)) next.maxValue = `Maximum must be a valid ${isDate ? 'date' : 'number'}.`;
      if (lo !== null && hi !== null && !Number.isNaN(lo) && !Number.isNaN(hi) && lo > hi) next.maxValue = 'Maximum cannot be below the minimum.';
    }
    if (caps.lookup && mode === 'new') {
      const code = toCode(newListName);
      if (!newListName.trim()) next.newListName = 'Name the new list.';
      else if (code.length < 2) next.newListName = 'The list name needs at least two letters or digits.';
      else if (lookupTypes.some((t) => t.code === code)) next.newListName = `A list with this name already exists (${code}). Pick it from the list instead.`;
      else if (!options.length) next.newListName = 'Add at least one option to the new list.';
    }
    return next;
  };

  /** The field as the form currently describes it — only what applies to the chosen type — plus any option changes. */
  const buildPayload = () => {
    const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
    let lookupTypeCode = caps.lookup ? form.lookupTypeCode || null : null;
    let lookupDraft = null;
    if (caps.lookup && mode === 'new') {
      lookupTypeCode = toCode(newListName);
      lookupDraft = { typeCode: lookupTypeCode, name: newListName.trim(), values: options, stored: [] };
    } else if (caps.lookup && changedOptions && lookupTypeCode) {
      lookupDraft = { typeCode: lookupTypeCode, name: null, values: options, stored: storedOptions };
    }

    const payload = {
      sectionKey: sectionKey || 'AddNewCustomer',
      displayLabel: form.displayLabel.trim(),
      fieldType: form.fieldType,
      isRequired: form.isRequired,
      isVisible: form.isVisible,
      maskingRule: caps.masking ? form.maskingRule : 'None',
      visibleChars: Number(form.visibleChars) || 0,
      displayOrder: Number(form.displayOrder),
      lookupTypeCode,
      validationRegex: caps.pattern ? form.validationRegex.trim() || null : null,
      validationMessage: caps.pattern ? form.validationMessage.trim() || null : null,
      minLength: caps.length ? num(form.minLength) : null,
      maxLength: caps.length ? num(form.maxLength) : null,
      minValue: caps.range ? form.minValue || null : null,
      maxValue: caps.range ? form.maxValue || null : null,
    };
    return { payload, lookupDraft };
  };

  // ---- changing the type of an existing field ---------------------------------------------------------------------------
  const typeChanged = isEditMode && Boolean(originalType) && form.fieldType !== originalType;
  const checkKey = typeChanged ? JSON.stringify([form.fieldType, form.lookupTypeCode, form.validationRegex, form.minLength, form.maxLength, form.minValue, form.maxValue]) : '';

  const runTypeCheck = async () => {
    if (!typeChanged || !editingField?.id) return null;   // a field that is not saved yet has no stored data to protect
    setTypeCheck({ status: 'checking', message: '' });
    try {
      const { payload } = buildPayload();
      const verdict = await configurableSettingsService.checkFieldType(editingField.id, payload);
      setTypeCheck({ status: verdict.ok ? 'ok' : 'bad', message: verdict.message || '' });
      return verdict;
    } catch (err) {
      // If the check itself cannot run, the server still refuses an incompatible change on Save Changes.
      setTypeCheck({ status: 'idle', message: '' });
      return null;
    }
  };

  // Check as the administrator picks a type (and adjusts the rules that come with it), so the answer is already on screen.
  useEffect(() => {
    if (!typeChanged) { setTypeCheck({ status: 'idle', message: '' }); return undefined; }
    const timer = setTimeout(() => { runTypeCheck(); }, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkKey]);

  const handleSave = async () => {
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    // A type change is only saved when the existing data still fits (the server checks again on Save Changes).
    if (typeChanged) {
      const verdict = await runTypeCheck();
      if (verdict && !verdict.ok) {
        setErrors((prev) => ({ ...prev, fieldType: verdict.message }));
        return;
      }
    }

    const { payload, lookupDraft } = buildPayload();

    setIsSubmitting(true);
    try {
      await onAdd?.(payload, editingField, lookupDraft);
      onClose();
    } catch {
      // The parent already surfaced the error; the drawer stays open with what was entered.
    } finally {
      setIsSubmitting(false);
    }
  };

  const maskingNeedsChars = form.maskingRule === 'HideMiddle' || form.maskingRule === 'HideFirstShowLast';
  const isDate = form.fieldType === 'Date';
  const showOptions = caps.lookup && (mode === 'new' || form.lookupTypeCode);

  const footer = useCallback(({ requestClose }) => (
    <>
      <Button variant="ghost" onClick={requestClose} disabled={isSubmitting}>Cancel</Button>
      <Button
        className="create-drawer__submit"
        variant="primary"
        isLoading={isSubmitting}
        leftIcon={isEditMode ? <Save size={15} /> : <Plus size={15} />}
        onClick={handleSave}
        id="btn-submit-field-drawer"
      >
        {isEditMode ? 'Apply Changes' : 'Create Field'}
      </Button>
    </>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [isSubmitting, isEditMode, form, options, mode, newListName, caps, storedOptions, lookupDrafts, existingFields]);

  return (
    <SideDrawer
      isOpen={isOpen}
      onClose={onClose}
      isDirty={isDirty && !isSubmitting}
      discardLabel="Field Settings"
      title={isEditMode ? 'Edit Configurable Field' : 'Add New Configurable Field'}
      subtitle={isEditMode ? `Editing ${editingField.apiField} — applied to the draft; Save Changes stores it` : 'Configure label, field type, requirement, visibility, and masking'}
      ariaLabel={isEditMode ? 'Edit configurable field' : 'Add new configurable field'}
      footer={footer}
    >
      <div className="field-editor">
        {/* ---- General ---- */}
        <section className="field-editor__section">
          <h3 className="field-editor__heading">General</h3>
          <div className="field-editor__grid field-editor__grid--wide">
            <Input
              label="Display Label"
              required
              placeholder="e.g. Occupation, Alternate Contact, Alternate Phone"
              value={form.displayLabel}
              onChange={set('displayLabel')}
              error={errors.displayLabel}
            />
            <Select
              label="Field Type"
              value={form.fieldType}
              onChange={set('fieldType')}
              disabled={typeChoices.length <= 1}
              helperText={typeChoices.length <= 1 ? 'This field’s data is stored in a way that supports only this type.' : undefined}
              error={errors.fieldType}
            >
              {typeChoices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </div>

          {typeChanged && (
            <div className={`type-change-note type-change-note--${typeCheck.status === 'bad' ? 'bad' : typeCheck.status === 'ok' ? 'ok' : 'warn'}`} role="alert">
              <AlertTriangle size={15} />
              <div>
                <strong>Changing field type may affect existing data and validations.</strong>
                {typeCheck.status === 'checking' && <p>Checking existing data…</p>}
                {typeCheck.status === 'ok' && <p><CheckCircle2 size={12} /> Existing data is compatible with {form.fieldType}.</p>}
                {typeCheck.status === 'bad' && <p>{typeCheck.message}</p>}
              </div>
            </div>
          )}
        </section>

        {/* ---- Settings that depend on the type ---- */}
        {(caps.lookup || caps.length || caps.pattern || caps.range || form.fieldType === 'Phone') && (
          <section className="field-editor__section">
            <h3 className="field-editor__heading">{form.fieldType} settings</h3>

            {form.fieldType === 'Phone' && (
              <p className="field-editor__note">The country list, dial codes and number-length rules come from the country settings; the number is checked against the country the user picks.</p>
            )}

            {caps.lookup && (
              <>
                <div className="field-editor__list-picker">
                  <Select
                    label="Master Lookup"
                    value={mode === 'new' ? '__new__' : form.lookupTypeCode}
                    onChange={(e) => {
                      const v = e.target.value;
                      setOptionsError('');
                      setNewOption('');
                      if (v === '__new__') { setMode('new'); setOptions([]); setStoredOptions([]); setOptionsTouched(true); setForm((p) => ({ ...p, lookupTypeCode: '' })); }
                      else { setMode('existing'); setNewListName(''); setOptionsTouched(false); setForm((p) => ({ ...p, lookupTypeCode: v })); }
                    }}
                    placeholder="Select a master lookup…"
                    error={errors.lookupTypeCode}
                  >
                    <option value="">— No list (no options) —</option>
                    {lookupTypes.map((t) => <option key={t.code} value={t.code}>{t.name || t.code} ({t.code})</option>)}
                    <option value="__new__">+ Create a new list…</option>
                  </Select>
                </div>

                {mode === 'new' && (
                  <Input
                    label="New list name"
                    required
                    placeholder="e.g. Occupation"
                    value={newListName}
                    onChange={(e) => { setNewListName(e.target.value); setErrors((p) => ({ ...p, newListName: undefined })); setOptionsTouched(true); }}
                    error={errors.newListName}
                    helperText={toCode(newListName) ? `Code: ${toCode(newListName)}` : undefined}
                  />
                )}

                {showOptions && (
                  <div className="option-manager">
                    <div className="option-manager__head">
                      <strong><ListPlus size={14} /> Manage options</strong>
                      <span>{options.length} option{options.length === 1 ? '' : 's'} · shared by every form that uses this list</span>
                    </div>

                    {optionsLoading && <p className="option-manager__empty">Loading options…</p>}
                    {!optionsLoading && options.length === 0 && <p className="option-manager__empty">No options yet.</p>}

                    <ul className="option-manager__list">
                      {options.map((o, i) => (
                        <li key={o.id || `new-${i}`} className={`option-row ${o.isActive ? '' : 'option-row--off'}`}>
                          <input
                            className="form-input option-row__label"
                            value={o.label}
                            onChange={(e) => updateOption(i, { label: e.target.value })}
                            aria-label={`Label of ${o.value}`}
                            title={o.id ? `Stored value: ${o.value} (the stored value cannot be renamed; the label can)` : undefined}
                          />
                          {!o.id && <span className="option-row__new">NEW</span>}
                          <label className="option-row__active">
                            <input type="checkbox" checked={o.isActive} onChange={(e) => updateOption(i, { isActive: e.target.checked })} />
                            Active
                          </label>
                          {!o.id && (
                            <button type="button" className="btn-icon-neutral" onClick={() => removeNewOption(i)} aria-label={`Remove ${o.label}`}>
                              <Trash2 size={13} />
                            </button>
                          )}
                          {usesFormatRules && (
                            <div className="option-row__format">
                              <label>
                                <span>ID format rule</span>
                                <select value={o.formatRule || ''} onChange={(e) => updateOption(i, { formatRule: e.target.value })}>
                                  <option value="">Default for “{o.label}”</option>
                                  {idRules.map((r) => <option key={r.key} value={r.key} title={r.description}>{r.label}</option>)}
                                </select>
                              </label>
                              {o.formatRule === 'REGEX' && (
                                <>
                                  <input className="form-input" placeholder="Pattern, e.g. ^[A-Z]{2}\d{6}$" value={o.formatRegex || ''} onChange={(e) => updateOption(i, { formatRegex: e.target.value })} aria-label={`Pattern for ${o.label}`} />
                                  <input className="form-input" placeholder="Message when it does not match" value={o.formatMessage || ''} onChange={(e) => updateOption(i, { formatMessage: e.target.value })} aria-label={`Message for ${o.label}`} />
                                </>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>

                    {canAddOptions ? (
                      <div className="option-manager__add">
                        <input
                          className="form-input"
                          placeholder="Add an option, e.g. Hindi"
                          value={newOption}
                          onChange={(e) => { setNewOption(e.target.value); setOptionsError(''); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                          aria-label="New option"
                        />
                        <Button variant="secondary" onClick={addOption} leftIcon={<Plus size={14} />}>Add</Button>
                      </div>
                    ) : (
                      <p className="option-manager__empty">This list has a fixed set of values the system supports; you can switch them on or off.</p>
                    )}
                    {optionsError && <span className="form-error">{optionsError}</span>}
                  </div>
                )}
              </>
            )}

            {caps.length && (
              <div className="field-editor__grid">
                <Input label="Minimum Length" type="number" min={0} value={form.minLength} onChange={set('minLength')} error={errors.minLength} />
                <Input label="Maximum Length" type="number" min={1} value={form.maxLength} onChange={set('maxLength')} error={errors.maxLength} />
              </div>
            )}

            {caps.range && (
              <div className="field-editor__grid">
                <Input
                  label={isDate ? 'Earliest Date' : 'Minimum Value'}
                  type={isDate ? 'date' : 'number'}
                  value={form.minValue}
                  onChange={set('minValue')}
                  error={errors.minValue}
                />
                <Input
                  label={isDate ? 'Latest Date' : 'Maximum Value'}
                  type={isDate ? 'date' : 'number'}
                  value={form.maxValue}
                  onChange={set('maxValue')}
                  error={errors.maxValue}
                />
              </div>
            )}

            {caps.pattern && (
              <>
                <Input
                  label="Validation Pattern (regular expression, optional)"
                  placeholder="e.g. ^[A-Z]{2}\d{6}$"
                  value={form.validationRegex}
                  onChange={set('validationRegex')}
                  error={errors.validationRegex}
                />
                <Input
                  label="Message shown when the pattern does not match"
                  placeholder="e.g. Please enter 2 uppercase letters followed by 6 digits."
                  value={form.validationMessage}
                  onChange={set('validationMessage')}
                  disabled={!form.validationRegex.trim()}
                />
              </>
            )}
          </section>
        )}

        {/* ---- Display ---- */}
        <section className="field-editor__section">
          <h3 className="field-editor__heading">Display &amp; Requirement</h3>
          <div className="field-editor__grid">
            <Input
              label="Display Order"
              type="number"
              min={0}
              value={form.displayOrder}
              onChange={set('displayOrder')}
              error={errors.displayOrder}
            />
            <div className="field-editor__checks" role="group" aria-label="Visibility and requirement">
              <Checkbox label="Visible" checked={form.isVisible} onChange={set('isVisible')} />
              <Checkbox
                label={editingField?.isSystemRequired ? 'Required (system)' : 'Required'}
                disabled={Boolean(editingField?.isSystemRequired)}
                checked={form.isRequired || Boolean(editingField?.isSystemRequired)}
                onChange={set('isRequired')}
              />
            </div>
          </div>
        </section>

        {/* ---- Masking ---- */}
        {caps.masking && (
          <section className="field-editor__section">
            <h3 className="field-editor__heading">Masking</h3>
            <div className="field-editor__grid">
              <Select label="Masking Rule" value={form.maskingRule} onChange={set('maskingRule')}>
                {MASKING_RULES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
              <Input
                label="Visible Characters"
                type="number"
                min={0}
                value={form.visibleChars}
                onChange={set('visibleChars')}
                error={errors.visibleChars}
                disabled={!maskingNeedsChars}
                helperText={maskingNeedsChars ? undefined : 'Used by the “Hide” rules only.'}
              />
            </div>
          </section>
        )}
      </div>
    </SideDrawer>
  );
}

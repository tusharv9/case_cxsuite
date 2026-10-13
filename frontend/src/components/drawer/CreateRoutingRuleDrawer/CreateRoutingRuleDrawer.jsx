// ===== CREATE / EDIT ROUTING RULE DRAWER =====

import { useState, useEffect, useMemo } from 'react';
import { Check, AlertCircle } from 'lucide-react';
import { Button } from '../../common/Button/Button.jsx';
import { SideDrawer } from '../../common/SideDrawer/SideDrawer.jsx';
import { Select } from '../../common/Input/Input.jsx';
import { selectPlaceholder } from '../../../utils/fieldValidation.js';
import { routingRuleService } from '../../../services/routingRuleService.js';
import './CreateRoutingRuleDrawer.css';

// A value saved on an existing rule stays selectable even if it has since left the list, so editing never silently drops it.
function withCurrent(options, current) {
  const list = options || [];
  return current && !list.some((o) => String(o).toLowerCase() === String(current).toLowerCase()) ? [...list, current] : list;
}

// A condition dropdown: "Any …" (no condition) followed by the vocabulary's values.
function conditionOptions(anyLabel, values, current) {
  return [{ value: '', label: anyLabel }, ...withCurrent(values, current).map((v) => ({ value: v, label: v }))];
}

export function CreateRoutingRuleDrawer({
  isOpen,
  onClose,
  onSuccess,
  editingRule = null,
  availableDepartments = []
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Conditions
  const [matchType, setMatchType] = useState('ALL');
  const [department, setDepartment] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [caseType, setCaseType] = useState('');
  const [channel, setChannel] = useState('');
  const [priority, setPriority] = useState('');
  const [customerSegment, setCustomerSegment] = useState('');

  // Destination Team / Queue
  const [targetDepartmentId, setTargetDepartmentId] = useState('');
  const [actionDescription, setActionDescription] = useState('');

  // What a rule can look at, and the valid values for each — from the server, never hard-coded here.
  const [vocab, setVocab] = useState(null);
  const [vocabError, setVocabError] = useState(null);
  const [vocabAttempt, setVocabAttempt] = useState(0);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    let live = true;
    setVocabError(null);
    routingRuleService.getVocabulary()
      .then((v) => live && setVocab(v))
      .catch((err) => live && setVocabError(err?.message || 'The rule options could not be loaded.'));
    return () => { live = false; };
  }, [isOpen, vocabAttempt]);

  // What was loaded into the form, so "unsaved" means "differs from this" (reverting an edit is not a change).
  const [baseline, setBaseline] = useState('');
  const snapshot = JSON.stringify({ name, description, isActive, matchType, department, subCategory, caseType, channel, priority, customerSegment, targetDepartmentId, actionDescription });

  useEffect(() => {
    if (!isOpen) return;

    if (editingRule) {
      setName(editingRule.name || '');
      setDescription(editingRule.description || '');
      setIsActive(editingRule.isActive !== false);

      const conds = editingRule.conditions || {};
      setMatchType(conds.matchType || 'ALL');
      setDepartment(conds.department || '');
      setSubCategory(conds.subCategory || conds.category || '');
      setCaseType(conds.caseType || '');
      setChannel(conds.channel || '');
      setPriority(conds.priority || '');
      setCustomerSegment(conds.customerSegment || '');

      setTargetDepartmentId(editingRule.targetDepartmentId || '');
      setActionDescription(editingRule.actionDescription || '');
      setBaseline(JSON.stringify({
        name: editingRule.name || '', description: editingRule.description || '', isActive: editingRule.isActive !== false,
        matchType: conds.matchType || 'ALL', department: conds.department || '', subCategory: conds.subCategory || conds.category || '',
        caseType: conds.caseType || '', channel: conds.channel || '', priority: conds.priority || '', customerSegment: conds.customerSegment || '',
        targetDepartmentId: editingRule.targetDepartmentId || '', actionDescription: editingRule.actionDescription || '',
      }));
    } else {
      setName('');
      setDescription('');
      setIsActive(true);
      setMatchType('ALL');
      setDepartment('');
      setSubCategory('');
      setCaseType('');
      setChannel('');
      setPriority('');
      setCustomerSegment('');
      setTargetDepartmentId('');   // the administrator chooses the destination explicitly
      setActionDescription('');
      setBaseline(JSON.stringify({
        name: '', description: '', isActive: true, matchType: 'ALL', department: '', subCategory: '', caseType: '', channel: '',
        priority: '', customerSegment: '', targetDepartmentId: '', actionDescription: '',
      }));
    }
    setErrors({});
  }, [isOpen, editingRule]);

  const destinationOptions = useMemo(
    () => availableDepartments
      .filter((d) => d.isActive !== false || d.id === targetDepartmentId)
      .map((d) => ({ value: d.id, label: `${d.name}${d.isActive === false ? ' (inactive)' : ''}` })),
    [availableDepartments, targetDepartmentId]
  );

  if (!isOpen) return null;

  const isDirty = baseline !== '' && snapshot !== baseline;

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Rule name is required.';
    if (!targetDepartmentId) errs.targetDepartmentId = 'Destination team is required.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Returns whether the rule was saved (the unsaved-changes dialog keeps the drawer open otherwise).
  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (saving || !validate()) return false;

    setSaving(true);
    setErrors({});

    try {
      const conditionsPayload = {
        matchType,
        department: department || null,
        category: subCategory || null,
        subCategory: subCategory || null,
        caseType: caseType || null,
        channel: channel || null,
        priority: priority || null,
        customerSegment: customerSegment || null,
      };

      const selectedDept = availableDepartments.find((d) => d.id === targetDepartmentId);

      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        isActive,
        conditions: conditionsPayload,
        targetDepartmentId,
        actionDescription: actionDescription.trim() || `Route to ${selectedDept?.name || 'the team'}`
      };

      if (editingRule) {
        await routingRuleService.updateRule(editingRule.id, payload);
      } else {
        await routingRuleService.createRule(payload);
      }

      onSuccess();
      onClose();
      return true;
    } catch (err) {
      console.error('Failed to save routing rule:', err);
      setErrors({
        submit: err?.response?.data?.error || err.message || 'Failed to save routing rule.'
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const vocabLoading = !vocab && !vocabError;
  const retryVocab = () => setVocabAttempt((n) => n + 1);
  const condition = (label, anyLabel, values, value, setValue) => (
    <div className="crr-field">
      <Select
        label={label}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        options={conditionOptions(anyLabel, values, value)}
        isLoading={vocabLoading}
        loadError={vocabError}
        onRetry={retryVocab}
      />
    </div>
  );

  return (
    <SideDrawer
      isOpen={isOpen}
      onClose={onClose}
      isDirty={isDirty && !saving}
      unsavedSubject="configuration"
      discardLabel={editingRule ? `Routing rule: ${editingRule.name}` : 'New routing rule'}
      onSave={() => handleSubmit()}
      title={editingRule ? 'Edit Routing Rule' : 'Create Routing Rule'}
      subtitle="Rules are evaluated top-down. The first match directs the case to its team."
      ariaLabel={editingRule ? 'Edit routing rule' : 'Create routing rule'}
      bodyAs="form"
      bodyProps={{ id: 'routing-rule-form', onSubmit: handleSubmit, className: 'crr-form' }}
      footer={({ requestClose }) => (
        <>
          <Button variant="ghost" onClick={requestClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            className="create-drawer__submit"
            variant="primary"
            type="submit"
            form="routing-rule-form"
            isLoading={saving}
            leftIcon={<Check size={15} />}
          >
            {editingRule ? 'Save Changes' : 'Create Rule'}
          </Button>
        </>
      )}
    >
      {errors.submit && (
        <div className="crr-alert crr-alert--error">
          <AlertCircle size={16} />
          <span>{errors.submit}</span>
        </div>
      )}
      {/* Section 1: Basic Information */}
      <div className="crr-section">
        <h3 className="crr-section-title">Rule Information</h3>

        <div className="crr-field">
          <label className="crr-label">
            Rule Name <span className="crr-required">*</span>
          </label>
          <input
            type="text"
            className={`crr-input ${errors.name ? 'crr-input--error' : ''}`}
            placeholder="e.g. Fraud sub-category → fraud team"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {errors.name && <span className="crr-error-text">{errors.name}</span>}
        </div>

        <div className="crr-field">
          <label className="crr-label">Summary / Condition Subtitle</label>
          <input
            type="text"
            className="crr-input"
            placeholder="e.g. Sub-category = Fraud"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="crr-field crr-field--inline">
          <label className="crr-label" style={{ marginBottom: 0 }}>
            Rule Status
          </label>
          <button
            type="button"
            className={`crr-toggle-switch ${isActive ? 'crr-toggle-switch--active' : ''}`}
            onClick={() => setIsActive(!isActive)}
            aria-pressed={isActive}
          >
            <span className="crr-toggle-knob" />
          </button>
          <span className="crr-toggle-label">{isActive ? 'Active' : 'Inactive'}</span>
        </div>
      </div>

      {/* Section 2: Rule Criteria / Conditions */}
      <div className="crr-section">
        <div className="crr-section-header">
          <h3 className="crr-section-title">Intake Criteria & Filters</h3>
          <div className="crr-match-type">
            <span className="crr-match-label">Match:</span>
            <button
              type="button"
              className={`crr-match-btn ${matchType === 'ALL' ? 'crr-match-btn--active' : ''}`}
              onClick={() => setMatchType('ALL')}
            >
              ALL conditions
            </button>
            <button
              type="button"
              className={`crr-match-btn ${matchType === 'ANY' ? 'crr-match-btn--active' : ''}`}
              onClick={() => setMatchType('ANY')}
            >
              ANY condition
            </button>
          </div>
        </div>

        {vocabError && (
          <div className="crr-alert crr-alert--error">
            <AlertCircle size={16} />
            <span>{vocabError}</span>
          </div>
        )}

        <div className="crr-grid">
          {condition('Team the case was opened for', 'Any team', vocab?.departments?.map((d) => d.name), department, setDepartment)}
          {condition('Sub-category', 'Any sub-category', vocab?.subCategories, subCategory, setSubCategory)}
          {condition('Case Type', 'Any case type', vocab?.caseTypes, caseType, setCaseType)}
          {condition('Priority', 'Any priority', vocab?.priorities, priority, setPriority)}
          {condition('Customer Segment', 'Any segment', vocab?.customerSegments, customerSegment, setCustomerSegment)}
          {condition('Intake Channel', 'Any channel', vocab?.channels, channel, setChannel)}
        </div>
      </div>

      {/* Section 3: Destination Queue */}
      <div className="crr-section">
        <h3 className="crr-section-title">Destination & Assignment</h3>

        <div className="crr-field">
          <Select
            label="Destination team"
            required
            value={targetDepartmentId}
            onChange={(e) => setTargetDepartmentId(e.target.value)}
            options={destinationOptions}
            placeholder={selectPlaceholder('Team')}
            emptyText={availableDepartments.length === 0 ? 'No teams are configured yet. Create one on the Teams page.' : 'No matching teams'}
            error={errors.targetDepartmentId}
          />
        </div>

        <div className="crr-field">
          <label className="crr-label">Routing Action Description</label>
          <input
            type="text"
            className="crr-input"
            placeholder="e.g. Route to the fraud team"
            value={actionDescription}
            onChange={(e) => setActionDescription(e.target.value)}
          />
        </div>
      </div>
    </SideDrawer>
  );
}

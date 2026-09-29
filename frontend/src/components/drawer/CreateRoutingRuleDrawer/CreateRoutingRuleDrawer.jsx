// ===== CREATE / EDIT ROUTING RULE DRAWER =====

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, GitBranch, ArrowRight, Check, AlertCircle } from 'lucide-react';
import { Button } from '../../common/Button/Button.jsx';
import { routingRuleService } from '../../../services/routingRuleService.js';
import './CreateRoutingRuleDrawer.css';

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
  const [caseType, setCaseType] = useState('');
  const [channel, setChannel] = useState('');
  const [priority, setPriority] = useState('');
  const [customerSegment, setCustomerSegment] = useState('');
  const [keywords, setKeywords] = useState('');

  // Destination Team / Queue
  const [targetDepartmentId, setTargetDepartmentId] = useState('');
  const [targetQueueName, setTargetQueueName] = useState('');
  const [actionDescription, setActionDescription] = useState('');

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;

    if (editingRule) {
      setName(editingRule.name || '');
      setDescription(editingRule.description || '');
      setIsActive(editingRule.isActive !== false);

      const conds = editingRule.conditions || {};
      setMatchType(conds.matchType || 'ALL');
      setCaseType(conds.caseType || '');
      setChannel(conds.channel || '');
      setPriority(conds.priority || '');
      setCustomerSegment(conds.customerSegment || '');
      setKeywords(Array.isArray(conds.keywords) ? conds.keywords.join(', ') : '');

      setTargetDepartmentId(editingRule.targetDepartmentId || '');
      setTargetQueueName(editingRule.targetQueueName || '');
      setActionDescription(editingRule.actionDescription || '');
    } else {
      setName('');
      setDescription('');
      setIsActive(true);
      setMatchType('ALL');
      setCaseType('');
      setChannel('');
      setPriority('');
      setCustomerSegment('');
      setKeywords('');
      setTargetDepartmentId(availableDepartments[0]?.id || '');
      setTargetQueueName('');
      setActionDescription('');
    }
    setErrors({});
  }, [isOpen, editingRule, availableDepartments]);

  if (!isOpen) return null;

  const validate = () => {
    const errs = {};
    if (!name.trim()) errs.name = 'Rule name is required.';
    if (!targetDepartmentId) errs.targetDepartmentId = 'Destination team is required.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setErrors({});

    try {
      const keywordList = keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

      const conditionsPayload = {
        matchType,
        caseType: caseType || null,
        channel: channel || null,
        priority: priority || null,
        customerSegment: customerSegment || null,
        keywords: keywordList.length > 0 ? keywordList : null
      };

      const selectedDept = availableDepartments.find((d) => d.id === targetDepartmentId);
      const resolvedQueueName = targetQueueName.trim() || selectedDept?.name || 'Default Queue';

      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        isActive,
        conditions: conditionsPayload,
        targetDepartmentId,
        targetQueueName: resolvedQueueName,
        actionDescription: actionDescription.trim() || `Route to ${resolvedQueueName}`
      };

      if (editingRule) {
        await routingRuleService.updateRule(editingRule.id, payload);
      } else {
        await routingRuleService.createRule(payload);
      }

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to save routing rule:', err);
      setErrors({
        submit: err?.response?.data?.error || err.message || 'Failed to save routing rule.'
      });
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="crr-overlay" onClick={onClose}>
      <div className="crr-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="crr-header">
          <div className="crr-header__title-wrap">
            <div className="crr-icon-badge">
              <GitBranch size={20} />
            </div>
            <div>
              <h2 className="crr-header__title">
                {editingRule ? 'Edit Routing Rule' : 'Create Routing Rule'}
              </h2>
              <p className="crr-header__subtitle">
                Rules are evaluated top-down. The first match directs the case to its squad.
              </p>
            </div>
          </div>
          <button className="crr-close-btn" onClick={onClose} aria-label="Close drawer">
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form id="routing-rule-form" onSubmit={handleSubmit} className="crr-form">
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
                placeholder="e.g. Fraud keywords → Critical queue"
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
                placeholder="e.g. Type = Complaint • Channel = Any • Match: keywords 'fraud'..."
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

            <div className="crr-grid">
              <div className="crr-field">
                <label className="crr-label">Case Type</label>
                <select
                  className="crr-select"
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value)}
                >
                  <option value="">Any Type</option>
                  <option value="Complaint">Complaint</option>
                  <option value="Inquiry">Inquiry</option>
                  <option value="Service">Service</option>
                </select>
              </div>

              <div className="crr-field">
                <label className="crr-label">Intake Channel</label>
                <select
                  className="crr-select"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="">Any Channel</option>
                  <option value="Social">Social Media (Twitter/FB/IG)</option>
                  <option value="Email">Email</option>
                  <option value="Voice">Phone / Voice</option>
                  <option value="Chat">Web Chat</option>
                  <option value="WhatsApp">WhatsApp</option>
                </select>
              </div>

              <div className="crr-field">
                <label className="crr-label">Priority / Severity</label>
                <select
                  className="crr-select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  <option value="">Any Priority</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>

              <div className="crr-field">
                <label className="crr-label">Customer Segment</label>
                <select
                  className="crr-select"
                  value={customerSegment}
                  onChange={(e) => setCustomerSegment(e.target.value)}
                >
                  <option value="">Any Segment</option>
                  <option value="Priority">Priority / Premier</option>
                  <option value="SME">SME / Business</option>
                  <option value="Retail">Retail</option>
                </select>
              </div>
            </div>

            <div className="crr-field">
              <label className="crr-label">Trigger Keywords (comma-separated)</label>
              <input
                type="text"
                className="crr-input"
                placeholder="e.g. fraud, unauthorised, stolen, chargeback, phishing"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
              <span className="crr-helper-text">
                Evaluated against the case Title and Description on intake.
              </span>
            </div>
          </div>

          {/* Section 3: Destination Queue */}
          <div className="crr-section">
            <h3 className="crr-section-title">Destination & Assignment</h3>

            <div className="crr-field">
              <label className="crr-label">
                Destination Team / Queue <span className="crr-required">*</span>
              </label>
              <select
                className={`crr-select ${errors.targetDepartmentId ? 'crr-select--error' : ''}`}
                value={targetDepartmentId}
                onChange={(e) => {
                  setTargetDepartmentId(e.target.value);
                  const selected = availableDepartments.find((d) => d.id === e.target.value);
                  if (selected && !targetQueueName) {
                    setTargetQueueName(selected.name);
                  }
                }}
              >
                <option value="">Select destination team...</option>
                {availableDepartments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name} ({dept.code || 'Team'})
                  </option>
                ))}
              </select>
              {errors.targetDepartmentId && (
                <span className="crr-error-text">{errors.targetDepartmentId}</span>
              )}
            </div>

            <div className="crr-field">
              <label className="crr-label">Routing Action Description</label>
              <input
                type="text"
                className="crr-input"
                placeholder="e.g. Route to Risk & Fraud Dept (High Priority)"
                value={actionDescription}
                onChange={(e) => setActionDescription(e.target.value)}
              />
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="crr-footer">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="routing-rule-form"
            loading={saving}
            icon={Check}
          >
            {editingRule ? 'Save Changes' : 'Create Rule'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

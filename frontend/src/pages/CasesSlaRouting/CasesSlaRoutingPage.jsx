// ===== CASES SLA & ROUTING CONFIGURATION PAGE =====

import React, { useState, useEffect, useMemo } from 'react';
import {
  Sliders,
  Clock,
  Calendar,
  Layers,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Info,
  X,
  Edit2
} from 'lucide-react';
import { slaRoutingService } from '../../services/slaRoutingService.js';
import { Loader } from '../../components/common/Loader/Loader.jsx';
import './CasesSlaRoutingPage.css';

export function CasesSlaRoutingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'sla' | 'hours' | 'holidays' | 'escalation'

  // Master Configuration State
  const [priorityRules, setPriorityRules] = useState([]);
  const [businessHours, setBusinessHours] = useState([]);
  const [publicHolidays, setPublicHolidays] = useState([]);
  const [escalationLevels, setEscalationLevels] = useState([]);
  const [availableCategories, setAvailableCategories] = useState([]);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);

  // Pristine snapshot for change tracking and discard
  const [pristineState, setPristineState] = useState(null);

  // Holiday Modal State
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [holidayForm, setHolidayForm] = useState({ holidayDate: '', name: '', isActive: true });
  const [holidaySaving, setHolidaySaving] = useState(false);

  // Load configuration on mount
  useEffect(() => {
    loadConfiguration();
  }, []);

  async function loadConfiguration() {
    setLoading(true);
    setError(null);
    try {
      const data = await slaRoutingService.getConfiguration();
      setPriorityRules(data.priorityRules || []);
      setBusinessHours(data.businessHours || []);
      setPublicHolidays(data.publicHolidays || []);
      setEscalationLevels(data.escalationLevels || []);
      setAvailableCategories(data.availableCategories || []);
      setAvailableRoles(data.availableRoles || []);
      setAvailableUsers(data.availableUsers || []);

      setPristineState(JSON.stringify({
        priorityRules: data.priorityRules || [],
        businessHours: data.businessHours || [],
        escalationLevels: data.escalationLevels || []
      }));
    } catch (err) {
      console.error('Failed to load SLA & Routing configuration:', err);
      setError(err?.response?.data?.error || err.message || 'Failed to load configuration.');
    } finally {
      setLoading(false);
    }
  }

  // Dirty check: compares current working state with pristine snapshot
  const isDirty = useMemo(() => {
    if (!pristineState) return false;
    const current = JSON.stringify({
      priorityRules,
      businessHours,
      escalationLevels
    });
    return current !== pristineState;
  }, [pristineState, priorityRules, businessHours, escalationLevels]);

  // Validation: Check category collisions across priorities
  const categoryCollisions = useMemo(() => {
    const seen = new Map();
    const duplicates = new Set();
    priorityRules.forEach(rule => {
      (rule.appliedCategories || []).forEach(cat => {
        const lower = cat.toLowerCase();
        if (seen.has(lower)) {
          duplicates.add(cat);
        } else {
          seen.set(lower, rule.priority);
        }
      });
    });
    return Array.from(duplicates);
  }, [priorityRules]);

  // Discard changes
  function handleDiscard() {
    if (!pristineState) return;
    const parsed = JSON.parse(pristineState);
    setPriorityRules(parsed.priorityRules);
    setBusinessHours(parsed.businessHours);
    setEscalationLevels(parsed.escalationLevels);
    setError(null);
    setSuccessMessage('Changes discarded.');
    setTimeout(() => setSuccessMessage(null), 3000);
  }

  // Save changes
  async function handleSave() {
    if (categoryCollisions.length > 0) {
      setError(`Cannot save: Category "${categoryCollisions.join(', ')}" is assigned to multiple priorities.`);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const payload = {
      priorityRules: priorityRules.map(r => ({
        priority: r.priority,
        firstResponseValue: parseInt(r.firstResponseValue, 10) || 1,
        firstResponseUnit: r.firstResponseUnit || 'Hours',
        internalResolutionValue: parseInt(r.internalResolutionValue, 10) || 1,
        internalResolutionUnit: r.internalResolutionUnit || 'Hours',
        externalResolutionValue: parseInt(r.externalResolutionValue, 10) || 1,
        externalResolutionUnit: r.externalResolutionUnit || 'Hours',
        appliedCategories: r.appliedCategories || []
      })),
      businessHours: businessHours.map(b => ({
        dayOfWeek: b.dayOfWeek,
        dayName: b.dayName,
        isEnabled: b.isEnabled,
        startTime: b.startTime,
        endTime: b.endTime
      })),
      escalationLevels: escalationLevels.map((l, index) => ({
        levelNumber: index + 1,
        name: l.name || `Level ${index + 1}`,
        assignmentType: l.assignmentType || 'Role',
        targetRole: l.targetRole || 'Team Lead',
        targetUserId: l.assignmentType === 'User' ? l.targetUserId : null,
        triggerType: l.triggerType || 'SlaPercentage',
        triggerValue: l.triggerValue !== null && l.triggerValue !== undefined ? Number(l.triggerValue) : null,
        triggerDescription: l.triggerDescription || '',
        actionDescription: l.actionDescription || '',
        reassignOwner: Boolean(l.reassignOwner),
        isActive: l.isActive !== false
      }))
    };

    try {
      await slaRoutingService.updateConfiguration(payload);
      setSuccessMessage('Configuration saved successfully. All changes are live.');
      setPristineState(JSON.stringify({
        priorityRules: payload.priorityRules,
        businessHours: payload.businessHours,
        escalationLevels: payload.escalationLevels
      }));
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error('Failed to update configuration:', err);
      const backendErr = err?.response?.data;
      if (backendErr?.errors) {
        const msgs = Object.values(backendErr.errors).flat().join(' ');
        setError(msgs);
      } else {
        setError(backendErr?.error || err.message || 'Failed to save configuration.');
      }
    } finally {
      setSaving(false);
    }
  }

  // --- Handlers: Priority SLA Matrix ---
  function handlePriorityFieldChange(priority, field, value) {
    setPriorityRules(prev => prev.map(r => {
      if (r.priority === priority) {
        return { ...r, [field]: value };
      }
      return r;
    }));
  }

  function handleAddCategoryToPriority(priority, categoryName) {
    if (!categoryName) return;
    setPriorityRules(prev => prev.map(r => {
      if (r.priority === priority) {
        const existing = r.appliedCategories || [];
        if (!existing.includes(categoryName)) {
          return { ...r, appliedCategories: [...existing, categoryName] };
        }
      }
      return r;
    }));
  }

  function handleRemoveCategoryFromPriority(priority, categoryName) {
    setPriorityRules(prev => prev.map(r => {
      if (r.priority === priority) {
        return {
          ...r,
          appliedCategories: (r.appliedCategories || []).filter(c => c !== categoryName)
        };
      }
      return r;
    }));
  }

  // --- Handlers: Business Hours ---
  function handleBusinessHourToggle(dayOfWeek) {
    setBusinessHours(prev => prev.map(b => {
      if (b.dayOfWeek === dayOfWeek) {
        return { ...b, isEnabled: !b.isEnabled };
      }
      return r => r;
    }));
  }

  function handleBusinessHourTimeChange(dayOfWeek, field, value) {
    setBusinessHours(prev => prev.map(b => {
      if (b.dayOfWeek === dayOfWeek) {
        return { ...b, [field]: value };
      }
      return b;
    }));
  }

  function applyBusinessHourPreset(preset) {
    if (preset === 'standard') {
      // Mon-Fri 09:00 - 17:00, Sat & Sun closed
      setBusinessHours(prev => prev.map(b => ({
        ...b,
        isEnabled: b.dayOfWeek >= 1 && b.dayOfWeek <= 5,
        startTime: '09:00',
        endTime: '17:00'
      })));
    } else if (preset === 'extended') {
      // Mon-Sat 08:00 - 20:00, Sun closed
      setBusinessHours(prev => prev.map(b => ({
        ...b,
        isEnabled: b.dayOfWeek >= 1 && b.dayOfWeek <= 6,
        startTime: '08:00',
        endTime: '20:00'
      })));
    } else if (preset === '247') {
      // 7 days 00:00 - 23:59
      setBusinessHours(prev => prev.map(b => ({
        ...b,
        isEnabled: true,
        startTime: '00:00',
        endTime: '23:59'
      })));
    }
  }

  // --- Handlers: Escalation Levels ---
  function handleAddEscalationLevel() {
    const nextNum = escalationLevels.length + 1;
    const newLevel = {
      levelNumber: nextNum,
      name: `Level ${nextNum}`,
      assignmentType: 'Role',
      targetRole: availableRoles[0] || 'Team Lead',
      targetUserId: null,
      triggerType: 'ManualOnly',
      triggerValue: null,
      triggerDescription: 'Manual escalation',
      actionDescription: 'Escalate to next authority tier',
      reassignOwner: true,
      isActive: true
    };
    setEscalationLevels(prev => [...prev, newLevel]);
  }

  function handleRemoveEscalationLevel(index) {
    if (escalationLevels.length <= 1) return;
    setEscalationLevels(prev => {
      const filtered = prev.filter((_, i) => i !== index);
      // Re-index remaining levels sequentially
      return filtered.map((l, i) => ({
        ...l,
        levelNumber: i + 1,
        name: l.name.startsWith('Level ') ? `Level ${i + 1}` : l.name
      }));
    });
  }

  function handleEscalationFieldChange(index, field, value) {
    setEscalationLevels(prev => prev.map((l, i) => {
      if (i === index) {
        const updated = { ...l, [field]: value };
        // Auto-adjust trigger description helper
        if (field === 'triggerType') {
          if (value === 'SlaPercentage') {
            updated.triggerValue = 70;
            updated.triggerDescription = 'SLA 70% consumed';
          } else if (value === 'SlaBreached') {
            updated.triggerValue = 100;
            updated.triggerDescription = 'SLA Breached';
          } else if (value === 'SlaPostBreachHours') {
            updated.triggerValue = 12;
            updated.triggerDescription = 'SLA 12h Breached';
          } else if (value === 'ManualOnly') {
            updated.triggerValue = null;
            updated.triggerDescription = 'Manual escalation only';
          }
        }
        return updated;
      }
      return l;
    }));
  }

  // --- Handlers: Public Holidays ---
  function openAddHolidayModal() {
    setEditingHoliday(null);
    setHolidayForm({ holidayDate: '', name: '', isActive: true });
    setHolidayModalOpen(true);
  }

  function openEditHolidayModal(holiday) {
    setEditingHoliday(holiday);
    setHolidayForm({
      holidayDate: holiday.holidayDate ? holiday.holidayDate.split('T')[0] : '',
      name: holiday.name,
      isActive: holiday.isActive
    });
    setHolidayModalOpen(true);
  }

  async function handleSaveHoliday(e) {
    e.preventDefault();
    if (!holidayForm.holidayDate || !holidayForm.name.trim()) return;

    setHolidaySaving(true);
    try {
      if (editingHoliday) {
        const updated = await slaRoutingService.updateHoliday(editingHoliday.id, holidayForm);
        setPublicHolidays(prev => prev.map(h => h.id === editingHoliday.id ? updated : h));
      } else {
        const created = await slaRoutingService.createHoliday(holidayForm);
        setPublicHolidays(prev => [...prev, created].sort((a, b) => new Date(a.holidayDate) - new Date(b.holidayDate)));
      }
      setHolidayModalOpen(false);
      setSuccessMessage('Holiday saved.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to save holiday:', err);
      setError(err?.response?.data?.error || err.message || 'Failed to save holiday.');
    } finally {
      setHolidaySaving(false);
    }
  }

  async function handleDeleteHoliday(id) {
    if (!window.confirm('Are you sure you want to delete this public holiday?')) return;
    try {
      await slaRoutingService.deleteHoliday(id);
      setPublicHolidays(prev => prev.filter(h => h.id !== id));
      setSuccessMessage('Holiday deleted.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to delete holiday:', err);
      setError(err?.response?.data?.error || err.message || 'Failed to delete holiday.');
    }
  }

  if (loading) {
    return (
      <div className="sla-routing-page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Loader text="Loading SLA & Routing Configuration…" />
      </div>
    );
  }

  const activeDaysCount = businessHours.filter(b => b.isEnabled).length;
  const activeHolidaysCount = publicHolidays.filter(h => h.isActive).length;

  return (
    <div className="sla-routing-page">
      {/* 1. BLUE HEADER BANNER */}
      <div className="sla-routing-page__header">
        <div className="sla-routing-banner">
          <div className="sla-routing-banner__left">
            <div className="sla-routing-banner__icon-box">
              <Sliders size={26} strokeWidth={2.2} />
            </div>
            <div>
              <div className="sla-routing-banner__badge">
                <Clock size={13} />
                <span>Enterprise Service Assurance</span>
              </div>
              <h1 className="sla-routing-banner__title">Cases SLA & Routing</h1>
              <p className="sla-routing-banner__subtitle">
                Configure corporate priority SLAs, business operating windows, public holiday pauses,
                and dynamic multi-level escalation architecture.
              </p>
            </div>
          </div>

          <div className="sla-routing-banner__right">
            <div className="sla-routing-banner__stats">
              <span className="sla-stat-chip">
                <Clock size={12} />
                4 SLA Priorities
              </span>
              <span className="sla-stat-chip">
                <Calendar size={12} />
                {activeDaysCount}/7 Operating Days
              </span>
              <span className="sla-stat-chip">
                <Layers size={12} />
                {escalationLevels.length} Escalation Tiers
              </span>
              {activeHolidaysCount > 0 && (
                <span className="sla-stat-chip">
                  {activeHolidaysCount} Holidays
                </span>
              )}
            </div>

            <div className="sla-routing-actions">
              <button
                type="button"
                className="sla-btn sla-btn--secondary"
                onClick={handleDiscard}
                disabled={!isDirty || saving}
              >
                <RotateCcw size={14} />
                <span>Discard</span>
              </button>
              <button
                type="button"
                className="sla-btn sla-btn--primary"
                onClick={handleSave}
                disabled={!isDirty || saving || categoryCollisions.length > 0}
              >
                <Save size={14} />
                <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* UNSAVED CHANGES FLOATING BANNER */}
      {isDirty && (
        <div className="sla-unsaved-alert">
          <div className="sla-unsaved-alert__left">
            <AlertTriangle size={18} />
            <span>You have unsaved changes across your SLA and Routing configuration. Click Save Configuration to apply.</span>
          </div>
          <div className="sla-routing-actions">
            <button
              type="button"
              className="sla-btn sla-btn--outline"
              onClick={handleDiscard}
              disabled={saving}
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              Discard
            </button>
            <button
              type="button"
              className="sla-btn sla-btn--blue"
              onClick={handleSave}
              disabled={saving || categoryCollisions.length > 0}
              style={{ padding: '6px 14px', fontSize: '12px' }}
            >
              Save Now
            </button>
          </div>
        </div>
      )}

      {/* FEEDBACK ALERTS */}
      {error && (
        <div style={{ margin: '16px 32px 0 32px', padding: '12px 18px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div style={{ margin: '16px 32px 0 32px', padding: '12px 18px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* CATEGORY COLLISION WARNING */}
      {categoryCollisions.length > 0 && (
        <div style={{ margin: '16px 32px 0 32px', padding: '12px 18px', background: '#fef2f2', border: '1px solid #f87171', borderRadius: '10px', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
          <AlertCircle size={16} />
          <span><strong>Category Conflict:</strong> The following categories are assigned to multiple priorities: <em>{categoryCollisions.join(', ')}</em>. Each category must map to exactly one priority.</span>
        </div>
      )}

      {/* TAB STRIP */}
      <div className="sla-routing-nav">
        <button
          type="button"
          className={`sla-nav-tab ${activeTab === 'all' ? 'sla-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          <Sliders size={14} />
          <span>All Sections</span>
        </button>
        <button
          type="button"
          className={`sla-nav-tab ${activeTab === 'sla' ? 'sla-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('sla')}
        >
          <Clock size={14} />
          <span>Priority SLA Matrix</span>
          <span className="sla-nav-tab__count">4</span>
        </button>
        <button
          type="button"
          className={`sla-nav-tab ${activeTab === 'hours' ? 'sla-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('hours')}
        >
          <Calendar size={14} />
          <span>Business Hours</span>
          <span className="sla-nav-tab__count">{activeDaysCount}/7</span>
        </button>
        <button
          type="button"
          className={`sla-nav-tab ${activeTab === 'holidays' ? 'sla-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('holidays')}
        >
          <Info size={14} />
          <span>Public Holidays</span>
          <span className="sla-nav-tab__count">{publicHolidays.length}</span>
        </button>
        <button
          type="button"
          className={`sla-nav-tab ${activeTab === 'escalation' ? 'sla-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('escalation')}
        >
          <Layers size={14} />
          <span>Escalation Matrix</span>
          <span className="sla-nav-tab__count">{escalationLevels.length}</span>
        </button>
      </div>

      {/* MAIN CONTENT BODY */}
      <div className="sla-routing-content">

        {/* ==================== SECTION A: PRIORITY-BASED SLA MATRIX ==================== */}
        {(activeTab === 'all' || activeTab === 'sla') && (
          <section className="sla-card" id="sla-priority-matrix">
            <div className="sla-card__header">
              <div className="sla-card__header-left">
                <div className="sla-card__header-icon">
                  <Clock size={20} />
                </div>
                <div>
                  <h2 className="sla-card__title">Priority-Based SLA Matrix</h2>
                  <p className="sla-card__subtitle">
                    Configure first response and internal/external resolution targets for each priority. Mapped categories automatically assign their priority during case creation.
                  </p>
                </div>
              </div>
            </div>

            <div className="sla-card__body">
              <table className="sla-matrix-table">
                <thead>
                  <tr>
                    <th style={{ width: '14%' }}>Priority</th>
                    <th style={{ width: '20%' }}>First Response Target</th>
                    <th style={{ width: '20%' }}>Internal Resolution</th>
                    <th style={{ width: '20%' }}>External Resolution</th>
                    <th style={{ width: '26%' }}>Apply To Categories</th>
                  </tr>
                </thead>
                <tbody>
                  {priorityRules.map(rule => {
                    const badgeClass = `sla-priority-badge--${rule.priority.toLowerCase()}`;
                    // Find categories not currently assigned to this priority
                    const unassignedCategories = availableCategories.filter(
                      c => !(rule.appliedCategories || []).includes(c.name)
                    );

                    return (
                      <tr key={rule.priority} className="sla-matrix-row">
                        <td>
                          <div className={`sla-priority-badge ${badgeClass}`}>
                            <span>{rule.priority}</span>
                          </div>
                        </td>

                        {/* First Response */}
                        <td>
                          <div className="sla-time-input-group">
                            <input
                              type="number"
                              min="1"
                              value={rule.firstResponseValue}
                              onChange={(e) => handlePriorityFieldChange(rule.priority, 'firstResponseValue', e.target.value)}
                            />
                            <select
                              value={rule.firstResponseUnit}
                              onChange={(e) => handlePriorityFieldChange(rule.priority, 'firstResponseUnit', e.target.value)}
                            >
                              <option value="Minutes">Minutes</option>
                              <option value="Hours">Hours</option>
                            </select>
                          </div>
                          <div className="sla-time-hint">
                            = {rule.firstResponseUnit === 'Hours' ? (rule.firstResponseValue * 60) : rule.firstResponseValue} min
                          </div>
                        </td>

                        {/* Internal Resolution */}
                        <td>
                          <div className="sla-time-input-group">
                            <input
                              type="number"
                              min="1"
                              value={rule.internalResolutionValue}
                              onChange={(e) => handlePriorityFieldChange(rule.priority, 'internalResolutionValue', e.target.value)}
                            />
                            <select
                              value={rule.internalResolutionUnit}
                              onChange={(e) => handlePriorityFieldChange(rule.priority, 'internalResolutionUnit', e.target.value)}
                            >
                              <option value="Minutes">Minutes</option>
                              <option value="Hours">Hours</option>
                            </select>
                          </div>
                          <div className="sla-time-hint">
                            = {rule.internalResolutionUnit === 'Hours' ? (rule.internalResolutionValue * 60) : rule.internalResolutionValue} min
                          </div>
                        </td>

                        {/* External Resolution */}
                        <td>
                          <div className="sla-time-input-group">
                            <input
                              type="number"
                              min="1"
                              value={rule.externalResolutionValue}
                              onChange={(e) => handlePriorityFieldChange(rule.priority, 'externalResolutionValue', e.target.value)}
                            />
                            <select
                              value={rule.externalResolutionUnit}
                              onChange={(e) => handlePriorityFieldChange(rule.priority, 'externalResolutionUnit', e.target.value)}
                            >
                              <option value="Minutes">Minutes</option>
                              <option value="Hours">Hours</option>
                            </select>
                          </div>
                          <div className="sla-time-hint">
                            = {rule.externalResolutionUnit === 'Hours' ? (rule.externalResolutionValue * 60) : rule.externalResolutionValue} min
                          </div>
                        </td>

                        {/* Applied Categories */}
                        <td className="sla-categories-cell">
                          <div className="sla-category-tags">
                            {(rule.appliedCategories || []).map(catName => (
                              <span key={catName} className="sla-cat-pill">
                                <span>{catName}</span>
                                <button
                                  type="button"
                                  className="sla-cat-pill__remove"
                                  onClick={() => handleRemoveCategoryFromPriority(rule.priority, catName)}
                                  title={`Remove ${catName}`}
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>

                          {unassignedCategories.length > 0 && (
                            <select
                              className="sla-add-category-select"
                              value=""
                              onChange={(e) => {
                                handleAddCategoryToPriority(rule.priority, e.target.value);
                              }}
                            >
                              <option value="" disabled>+ Add Category…</option>
                              {unassignedCategories.map(cat => (
                                <option key={cat.id || cat.name} value={cat.name}>
                                  {cat.name} ({cat.departmentName || 'General'})
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ==================== SECTION B: BUSINESS HOURS ==================== */}
        {(activeTab === 'all' || activeTab === 'hours') && (
          <section className="sla-card" id="business-hours">
            <div className="sla-card__header">
              <div className="sla-card__header-left">
                <div className="sla-card__header-icon">
                  <Calendar size={20} />
                </div>
                <div>
                  <h2 className="sla-card__title">Business Operating Hours</h2>
                  <p className="sla-card__subtitle">
                    SLA clocks only consume elapsed time during active business windows. Clocks pause outside working hours and resume when the window reopens.
                  </p>
                </div>
              </div>

              {/* Preset buttons */}
              <div className="sla-bh-presets">
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Presets:</span>
                <button
                  type="button"
                  className="sla-bh-preset-btn"
                  onClick={() => applyBusinessHourPreset('standard')}
                >
                  Standard Banking (Mon-Fri 09:00-17:00)
                </button>
                <button
                  type="button"
                  className="sla-bh-preset-btn"
                  onClick={() => applyBusinessHourPreset('extended')}
                >
                  Extended Support (Mon-Sat 08:00-20:00)
                </button>
                <button
                  type="button"
                  className="sla-bh-preset-btn"
                  onClick={() => applyBusinessHourPreset('247')}
                >
                  24/7 Operations
                </button>
              </div>
            </div>

            <div className="sla-card__body">
              <div className="sla-business-hours-grid">
                {businessHours.map(bh => {
                  let durationText = 'Closed / Non-Working';
                  if (bh.isEnabled && bh.startTime && bh.endTime) {
                    const [sH, sM] = bh.startTime.split(':').map(Number);
                    const [eH, eM] = bh.endTime.split(':').map(Number);
                    const totalMin = Math.max(0, (eH * 60 + eM) - (sH * 60 + sM));
                    const hrs = (totalMin / 60).toFixed(1);
                    durationText = `${hrs} hrs / day`;
                  }

                  return (
                    <div
                      key={bh.dayOfWeek}
                      className={`sla-bh-row ${!bh.isEnabled ? 'sla-bh-row--disabled' : ''}`}
                    >
                      <div className="sla-bh-row__left">
                        <label className="sla-switch" title={bh.isEnabled ? 'Enabled' : 'Disabled'}>
                          <input
                            type="checkbox"
                            checked={bh.isEnabled}
                            onChange={() => handleBusinessHourToggle(bh.dayOfWeek)}
                          />
                          <span className="sla-slider" />
                        </label>
                        <span className="sla-bh-day-name">{bh.dayName}</span>
                      </div>

                      <div className="sla-bh-row__times">
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Opens:</span>
                        <input
                          type="time"
                          className="sla-bh-time-input"
                          value={bh.startTime}
                          disabled={!bh.isEnabled}
                          onChange={(e) => handleBusinessHourTimeChange(bh.dayOfWeek, 'startTime', e.target.value)}
                        />
                        <span className="sla-bh-time-sep">—</span>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>Closes:</span>
                        <input
                          type="time"
                          className="sla-bh-time-input"
                          value={bh.endTime}
                          disabled={!bh.isEnabled}
                          onChange={(e) => handleBusinessHourTimeChange(bh.dayOfWeek, 'endTime', e.target.value)}
                        />
                      </div>

                      <div className={`sla-bh-duration-pill ${!bh.isEnabled ? 'sla-bh-duration-pill--closed' : ''}`}>
                        <Clock size={12} />
                        <span>{durationText}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ==================== SECTION C: PUBLIC HOLIDAYS ==================== */}
        {(activeTab === 'all' || activeTab === 'holidays') && (
          <section className="sla-card" id="public-holidays">
            <div className="sla-card__header">
              <div className="sla-card__header-left">
                <div className="sla-card__header-icon">
                  <Info size={20} />
                </div>
                <div>
                  <h2 className="sla-card__title">Public Holidays & Non-Working Days</h2>
                  <p className="sla-card__subtitle">
                    Corporate holidays automatically pause the SLA countdown clock for all open cases and extend target due dates by the paused duration.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="sla-btn sla-btn--blue"
                onClick={openAddHolidayModal}
              >
                <Plus size={14} />
                <span>Add Public Holiday</span>
              </button>
            </div>

            <div className="sla-card__body">
              <div className="sla-holidays-notice">
                <Info size={18} style={{ flexShrink: 0 }} />
                <span>
                  <strong>Automated Clock Suspension:</strong> Any public holiday registered here acts as a zero-consumption window. If a case’s SLA window spans across a holiday, the deadline is dynamically extended to preserve service commitments.
                </span>
              </div>

              {publicHolidays.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: '#64748b', fontSize: '13px' }}>
                  No public holidays registered. Click "Add Public Holiday" above to add statutory holidays.
                </div>
              ) : (
                <table className="sla-holidays-table">
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>Holiday Date</th>
                      <th style={{ width: '40%' }}>Holiday Name</th>
                      <th style={{ width: '20%' }}>Status</th>
                      <th style={{ width: '15%', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publicHolidays.map(holiday => {
                      const dateObj = new Date(holiday.holidayDate);
                      const formattedDate = dateObj.toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      });

                      return (
                        <tr key={holiday.id}>
                          <td>
                            <span className="sla-holiday-date-badge">
                              <Calendar size={13} />
                              {formattedDate}
                            </span>
                          </td>
                          <td>
                            <strong>{holiday.name}</strong>
                          </td>
                          <td>
                            <span className={`sla-cat-pill ${holiday.isActive ? '' : 'sla-bh-duration-pill--closed'}`}>
                              {holiday.isActive ? 'Active (Pauses SLA)' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '8px' }}>
                              <button
                                type="button"
                                className="sla-btn sla-btn--outline"
                                style={{ padding: '4px 8px' }}
                                onClick={() => openEditHolidayModal(holiday)}
                                title="Edit Holiday"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                type="button"
                                className="sla-btn sla-btn--danger-outline"
                                style={{ padding: '4px 8px' }}
                                onClick={() => handleDeleteHoliday(holiday.id)}
                                title="Delete Holiday"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {/* ==================== SECTION D: ESCALATION MATRIX ==================== */}
        {(activeTab === 'all' || activeTab === 'escalation') && (
          <section className="sla-card" id="escalation-matrix">
            <div className="sla-card__header">
              <div className="sla-card__header-left">
                <div className="sla-card__header-icon">
                  <Layers size={20} />
                </div>
                <div>
                  <h2 className="sla-card__title">Escalation Matrix</h2>
                  <p className="sla-card__subtitle">
                    Sequential multi-tier escalation hierarchy. Agents can manually escalate cases step-by-step with mandatory audit reasons, or background workers can escalate automatically upon SLA breach.
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="sla-btn sla-btn--blue"
                onClick={handleAddEscalationLevel}
              >
                <Plus size={14} />
                <span>Add Escalation Level</span>
              </button>
            </div>

            <div className="sla-card__body">
              {/* Stepper Flow Progression Diagram */}
              <div className="sla-escalation-flow">
                {escalationLevels.map((lvl, index) => (
                  <React.Fragment key={lvl.levelNumber || index}>
                    <div className="sla-flow-node">
                      <div className="sla-flow-node__num">{index + 1}</div>
                      <div className="sla-flow-node__info">
                        <span className="sla-flow-node__title">{lvl.name || `Level ${index + 1}`}</span>
                        <span className="sla-flow-node__role">
                          {lvl.assignmentType === 'User' ? (lvl.targetUserName || 'User Assignee') : lvl.targetRole}
                        </span>
                      </div>
                    </div>
                    {index < escalationLevels.length - 1 && (
                      <div className="sla-flow-arrow">
                        <ChevronRight size={18} strokeWidth={2.5} />
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Sequential Level Cards List */}
              <div className="sla-escalation-levels-list">
                {escalationLevels.map((lvl, index) => (
                  <div key={index} className="sla-level-card">
                    <div className="sla-level-card__header">
                      <div className="sla-level-card__left">
                        <span className="sla-level-pill">LEVEL {index + 1}</span>
                        <input
                          type="text"
                          className="sla-field-input"
                          style={{ fontWeight: 700, width: '240px' }}
                          value={lvl.name}
                          onChange={(e) => handleEscalationFieldChange(index, 'name', e.target.value)}
                        />
                      </div>

                      {escalationLevels.length > 1 && (
                        <button
                          type="button"
                          className="sla-btn sla-btn--danger-outline"
                          style={{ padding: '5px 10px', fontSize: '12px' }}
                          onClick={() => handleRemoveEscalationLevel(index)}
                          title="Remove Escalation Level"
                        >
                          <Trash2 size={13} />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>

                    <div className="sla-level-card__body">
                      {/* 1. Assignment */}
                      <div className="sla-field-col">
                        <label className="sla-field-label">Assignment Method</label>
                        <select
                          className="sla-field-select"
                          value={lvl.assignmentType}
                          onChange={(e) => handleEscalationFieldChange(index, 'assignmentType', e.target.value)}
                        >
                          <option value="Role">Target Role (Department / Enterprise)</option>
                          <option value="User">Specific Individual User</option>
                        </select>

                        {lvl.assignmentType === 'Role' ? (
                          <div style={{ marginTop: '8px' }}>
                            <label className="sla-field-label">Target Role</label>
                            <select
                              className="sla-field-select"
                              value={lvl.targetRole}
                              onChange={(e) => handleEscalationFieldChange(index, 'targetRole', e.target.value)}
                            >
                              {availableRoles.map(role => (
                                <option key={role} value={role}>{role}</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div style={{ marginTop: '8px' }}>
                            <label className="sla-field-label">Target User</label>
                            <select
                              className="sla-field-select"
                              value={lvl.targetUserId || ''}
                              onChange={(e) => {
                                const uid = e.target.value;
                                const userObj = availableUsers.find(u => u.id === uid);
                                handleEscalationFieldChange(index, 'targetUserId', uid);
                                handleEscalationFieldChange(index, 'targetUserName', userObj?.name || '');
                              }}
                            >
                              <option value="" disabled>Select User Assignee…</option>
                              {availableUsers.map(user => (
                                <option key={user.id} value={user.id}>
                                  {user.name} ({user.role} • {user.team || 'CX'})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {/* 2. Trigger Condition */}
                      <div className="sla-field-col">
                        <label className="sla-field-label">Trigger Condition</label>
                        <select
                          className="sla-field-select"
                          value={lvl.triggerType}
                          onChange={(e) => handleEscalationFieldChange(index, 'triggerType', e.target.value)}
                        >
                          <option value="SlaPercentage">SLA Consumption % Reached</option>
                          <option value="SlaBreached">Resolution SLA Breached (100%)</option>
                          <option value="SlaPostBreachHours">Hours Post-SLA Breach</option>
                          <option value="ManualOnly">Manual Escalation Only (Agent Action)</option>
                        </select>

                        {lvl.triggerType === 'SlaPercentage' && (
                          <div style={{ marginTop: '8px' }}>
                            <label className="sla-field-label">Threshold Percentage (%)</label>
                            <input
                              type="number"
                              min="1"
                              max="100"
                              className="sla-field-input"
                              value={lvl.triggerValue || 70}
                              onChange={(e) => handleEscalationFieldChange(index, 'triggerValue', e.target.value)}
                            />
                          </div>
                        )}

                        {lvl.triggerType === 'SlaPostBreachHours' && (
                          <div style={{ marginTop: '8px' }}>
                            <label className="sla-field-label">Hours Elapsed After Breach</label>
                            <input
                              type="number"
                              min="1"
                              max="168"
                              className="sla-field-input"
                              value={lvl.triggerValue || 12}
                              onChange={(e) => handleEscalationFieldChange(index, 'triggerValue', e.target.value)}
                            />
                          </div>
                        )}
                      </div>

                      {/* 3. Action Description */}
                      <div className="sla-field-col">
                        <label className="sla-field-label">Action Description</label>
                        <input
                          type="text"
                          className="sla-field-input"
                          placeholder="e.g. Reassign to team lead and notify"
                          value={lvl.actionDescription}
                          onChange={(e) => handleEscalationFieldChange(index, 'actionDescription', e.target.value)}
                        />
                        <div className="sla-time-hint">
                          Preview: {lvl.actionDescription || 'No action defined'}
                        </div>
                      </div>

                      {/* 4. Options & Behavior */}
                      <div className="sla-field-col">
                        <label className="sla-field-label">Workflow Behavior</label>
                        <label className="sla-reassign-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(lvl.reassignOwner)}
                            onChange={(e) => handleEscalationFieldChange(index, 'reassignOwner', e.target.checked)}
                          />
                          <span>Reassign Case Owner upon Escalation</span>
                        </label>
                        <div className="sla-time-hint" style={{ marginTop: '6px' }}>
                          {lvl.reassignOwner
                            ? 'Case will be automatically reassigned to the target role/user.'
                            : 'Case owner is preserved; target receives notification & oversight.'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

      </div>

      {/* ==================== ADD / EDIT PUBLIC HOLIDAY MODAL ==================== */}
      {holidayModalOpen && (
        <div className="sla-modal-overlay">
          <div className="sla-modal">
            <div className="sla-modal__header">
              <h3 className="sla-modal__title">
                {editingHoliday ? 'Edit Public Holiday' : 'Add Public Holiday'}
              </h3>
              <button
                type="button"
                className="sla-modal__close-btn"
                onClick={() => setHolidayModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveHoliday}>
              <div className="sla-modal__body">
                <div className="sla-field-col">
                  <label className="sla-field-label">Holiday Date</label>
                  <input
                    type="date"
                    required
                    className="sla-field-input"
                    value={holidayForm.holidayDate}
                    onChange={(e) => setHolidayForm(prev => ({ ...prev, holidayDate: e.target.value }))}
                  />
                </div>

                <div className="sla-field-col">
                  <label className="sla-field-label">Holiday Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. National Day, Christmas Day"
                    className="sla-field-input"
                    value={holidayForm.name}
                    onChange={(e) => setHolidayForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <label className="sla-reassign-toggle" style={{ marginTop: '4px' }}>
                  <input
                    type="checkbox"
                    checked={holidayForm.isActive}
                    onChange={(e) => setHolidayForm(prev => ({ ...prev, isActive: e.target.checked }))}
                  />
                  <span>Active Holiday (Pause SLA Timers on this day)</span>
                </label>
              </div>

              <div className="sla-modal__footer">
                <button
                  type="button"
                  className="sla-btn sla-btn--outline"
                  onClick={() => setHolidayModalOpen(false)}
                  disabled={holidaySaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sla-btn sla-btn--blue"
                  disabled={holidaySaving || !holidayForm.holidayDate || !holidayForm.name.trim()}
                >
                  {holidaySaving ? 'Saving...' : 'Save Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

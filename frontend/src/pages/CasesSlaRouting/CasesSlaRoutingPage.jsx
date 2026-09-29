// ===== CASES SLA & ROUTING CONFIGURATION PAGE =====

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Info,
  X,
  Edit2,
  GitBranch,
  ArrowRight,
  GripVertical
} from 'lucide-react';
import { slaRoutingService } from '../../services/slaRoutingService.js';
import { routingRuleService } from '../../services/routingRuleService.js';
import { teamService } from '../../services/teamService.js';
import { Loader } from '../../components/common/Loader/Loader.jsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog/ConfirmDialog.jsx';
import { CreateRoutingRuleDrawer } from '../../components/drawer/CreateRoutingRuleDrawer/CreateRoutingRuleDrawer.jsx';
import './CasesSlaRoutingPage.css';

export function CasesSlaRoutingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [activeTab, setActiveTab] = useState('sla'); // 'sla' | 'operating-hours' | 'escalation'

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

  // Holiday Drawer State
  const [holidayDrawerOpen, setHolidayDrawerOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [holidayForm, setHolidayForm] = useState({ holidayDate: '', name: '', isActive: true, description: '' });
  const [holidaySaving, setHolidaySaving] = useState(false);
  const [holidayDrawerError, setHolidayDrawerError] = useState(null);

  // Delete Holiday Confirmation State
  const [holidayToDelete, setHolidayToDelete] = useState(null);
  const [isDeletingHoliday, setIsDeletingHoliday] = useState(false);

  // Quick Add Holiday State
  const [quickHolidayText, setQuickHolidayText] = useState('');

  // Escalation Level Drawer State
  const [escalationDrawerOpen, setEscalationDrawerOpen] = useState(false);
  const [escalationSaving, setEscalationSaving] = useState(false);
  const [escalationDrawerError, setEscalationDrawerError] = useState(null);
  const [escalationForm, setEscalationForm] = useState({
    levelNumber: 5,
    name: 'Level 5',
    targetRole: 'Team Lead',
    triggerCondition: 'SLA Consumption Breached',
    actionDescription: 'Send notification to target role'
  });

  // Delete Escalation Level Confirmation State
  const [levelToDelete, setLevelToDelete] = useState(null);
  const [isDeletingLevel, setIsDeletingLevel] = useState(false);

  // Routing Rules & Assignment State
  const [routingRules, setRoutingRules] = useState([]);
  const [assignmentConfig, setAssignmentConfig] = useState({ algorithm: 'RoundRobin', maxConcurrentCapacity: 5 });
  const [availableDepartments, setAvailableDepartments] = useState([]);
  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [ruleToDelete, setRuleToDelete] = useState(null);
  const [isDeletingRule, setIsDeletingRule] = useState(false);

  // Load configuration on mount
  useEffect(() => {
    loadConfiguration();
  }, []);

  async function loadConfiguration() {
    setLoading(true);
    setError(null);
    try {
      const [data, rulesData, configData, teamsData] = await Promise.all([
        slaRoutingService.getConfiguration(),
        routingRuleService.getRules().catch(() => []),
        routingRuleService.getAssignmentConfig().catch(() => ({ algorithm: 'RoundRobin', maxConcurrentCapacity: 5 })),
        teamService.getAllTeams().catch(() => [])
      ]);

      setPriorityRules(data.priorityRules || []);
      setBusinessHours(data.businessHours || []);
      setPublicHolidays(data.publicHolidays || []);
      setEscalationLevels(data.escalationLevels || []);
      setAvailableCategories(data.availableCategories || []);
      setAvailableRoles(data.availableRoles || []);
      setAvailableUsers(data.availableUsers || []);

      setRoutingRules(rulesData || []);
      setAssignmentConfig(configData || { algorithm: 'RoundRobin', maxConcurrentCapacity: 5 });
      setAvailableDepartments(teamsData || []);

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

  async function refreshRoutingRules() {
    try {
      const [rulesData, configData] = await Promise.all([
        routingRuleService.getRules(),
        routingRuleService.getAssignmentConfig()
      ]);
      setRoutingRules(rulesData || []);
      setAssignmentConfig(configData || { algorithm: 'RoundRobin', maxConcurrentCapacity: 5 });
    } catch (err) {
      console.error('Failed to refresh routing rules:', err);
    }
  }

  async function handleToggleRule(ruleId) {
    try {
      // Optimistic update
      setRoutingRules(prev => prev.map(r => r.id === ruleId ? { ...r, isActive: !r.isActive } : r));
      const updated = await routingRuleService.toggleRule(ruleId);
      setRoutingRules(prev => prev.map(r => r.id === ruleId ? updated : r));
      setSuccessMessage(`Routing rule '${updated.name}' is now ${updated.isActive ? 'Active' : 'Inactive'}.`);
    } catch (err) {
      console.error('Failed to toggle routing rule:', err);
      setError('Failed to update rule status. Please try again.');
      refreshRoutingRules();
    }
  }

  async function handleConfirmDeleteRule() {
    if (!ruleToDelete) return;
    setIsDeletingRule(true);
    try {
      await routingRuleService.deleteRule(ruleToDelete.id);
      setRoutingRules(prev => prev.filter(r => r.id !== ruleToDelete.id));
      setSuccessMessage(`Routing rule '${ruleToDelete.name}' deleted successfully.`);
      setRuleToDelete(null);
    } catch (err) {
      console.error('Failed to delete routing rule:', err);
      setError('Failed to delete routing rule.');
    } finally {
      setIsDeletingRule(false);
    }
  }

  async function handleMoveRule(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= routingRules.length) return;

    const newRules = [...routingRules];
    const temp = newRules[index];
    newRules[index] = newRules[targetIndex];
    newRules[targetIndex] = temp;

    // Update evaluation orders
    const updatedWithOrder = newRules.map((r, i) => ({ ...r, evaluationOrder: i + 1 }));
    setRoutingRules(updatedWithOrder);

    try {
      await routingRuleService.reorderRules(updatedWithOrder.map(r => r.id));
    } catch (err) {
      console.error('Failed to reorder rules:', err);
      refreshRoutingRules();
    }
  }

  async function handleSelectAlgorithm(algo) {
    try {
      setAssignmentConfig(prev => ({ ...prev, algorithm: algo }));
      const updated = await routingRuleService.updateAssignmentConfig({
        algorithm: algo,
        maxConcurrentCapacity: assignmentConfig.maxConcurrentCapacity
      });
      setAssignmentConfig(updated);
      setSuccessMessage(`Assignment algorithm updated to '${algo}'.`);
    } catch (err) {
      console.error('Failed to update assignment algorithm:', err);
      setError('Failed to update assignment algorithm.');
    }
  }

  async function handleCapacityChange(capacity) {
    try {
      setAssignmentConfig(prev => ({ ...prev, maxConcurrentCapacity: capacity }));
      const updated = await routingRuleService.updateAssignmentConfig({
        algorithm: assignmentConfig.algorithm,
        maxConcurrentCapacity: capacity
      });
      setAssignmentConfig(updated);
    } catch (err) {
      console.error('Failed to update capacity:', err);
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

  // Business Hours Validation (Check start time < end time for enabled days)
  const businessHoursError = useMemo(() => {
    for (const bh of businessHours) {
      if (bh.isEnabled && bh.startTime && bh.endTime) {
        if (bh.startTime >= bh.endTime) {
          const dayLabel = (bh.dayOfWeek >= 1 && bh.dayOfWeek <= 5) ? 'Monday - Friday' : bh.dayName;
          return `${dayLabel}: Opening time (${bh.startTime}) must be earlier than closing time (${bh.endTime}).`;
        }
      }
    }
    return null;
  }, [businessHours]);

  // Discard changes and restore last persisted configuration
  function handleDiscard() {
    if (!pristineState) return;
    const parsed = JSON.parse(pristineState);
    setPriorityRules(parsed.priorityRules);
    setBusinessHours(parsed.businessHours);
    setEscalationLevels(parsed.escalationLevels);
    setError(null);
    setSuccessMessage('Changes discarded. Restored last saved configuration.');
    setTimeout(() => setSuccessMessage(null), 3500);
  }

  // Save changes
  async function handleSave() {
    if (categoryCollisions.length > 0) {
      setError(`Cannot save: Category "${categoryCollisions.join(', ')}" is assigned to multiple priorities.`);
      return;
    }

    if (businessHoursError) {
      setError(`Cannot save: ${businessHoursError}`);
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
        setError(backendErr?.error || err.message || 'Unable to save configuration. Please try again.');
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

  // --- Handlers: Business Hours (Unified 3-Row Representation: Mon-Fri, Sat, Sun) ---
  const monFriRow = useMemo(() => {
    const monday = businessHours.find(b => b.dayOfWeek === 1) || {};
    return {
      isEnabled: monday.isEnabled !== false,
      startTime: monday.startTime || '09:00',
      endTime: monday.endTime || '17:00'
    };
  }, [businessHours]);

  const satRow = useMemo(() => {
    const saturday = businessHours.find(b => b.dayOfWeek === 6) || {};
    return {
      dayOfWeek: 6,
      dayName: 'Saturday',
      isEnabled: Boolean(saturday.isEnabled),
      startTime: saturday.startTime || '09:00',
      endTime: saturday.endTime || '13:00'
    };
  }, [businessHours]);

  const sunRow = useMemo(() => {
    const sunday = businessHours.find(b => b.dayOfWeek === 0) || {};
    return {
      dayOfWeek: 0,
      dayName: 'Sunday',
      isEnabled: Boolean(sunday.isEnabled),
      startTime: sunday.startTime || '09:00',
      endTime: sunday.endTime || '13:00'
    };
  }, [businessHours]);

  function handleMonFriToggle() {
    const nextState = !monFriRow.isEnabled;
    setBusinessHours(prev => prev.map(b => {
      if (b.dayOfWeek >= 1 && b.dayOfWeek <= 5) {
        return { ...b, isEnabled: nextState };
      }
      return b;
    }));
  }

  function handleMonFriTimeChange(field, value) {
    setBusinessHours(prev => prev.map(b => {
      if (b.dayOfWeek >= 1 && b.dayOfWeek <= 5) {
        return { ...b, [field]: value };
      }
      return b;
    }));
  }

  function handleBusinessHourToggle(dayOfWeek) {
    setBusinessHours(prev => prev.map(b => {
      if (b.dayOfWeek === dayOfWeek) {
        return { ...b, isEnabled: !b.isEnabled };
      }
      return b;
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

  // --- Handlers: Escalation Levels ---
  function handleOpenAddEscalationDrawer() {
    const nextNum = escalationLevels.length > 0
      ? Math.max(...escalationLevels.map(l => l.levelNumber || 0)) + 1
      : 1;
    setEscalationForm({
      levelNumber: nextNum,
      name: `Level ${nextNum}`,
      targetRole: availableRoles[0] || 'Team Lead',
      triggerCondition: 'SLA Consumption Breached',
      actionDescription: `Notify ${availableRoles[0] || 'Team Lead'} and flag for escalation review`
    });
    setEscalationDrawerError(null);
    setEscalationDrawerOpen(true);
  }

  async function handleSaveEscalationLevel(e) {
    e.preventDefault();
    if (!escalationForm.targetRole.trim()) {
      setEscalationDrawerError('Target Role is required.');
      return;
    }
    setEscalationSaving(true);
    setEscalationDrawerError(null);

    try {
      const payload = {
        levelNumber: escalationForm.levelNumber,
        name: escalationForm.name,
        targetRole: escalationForm.targetRole,
        triggerCondition: escalationForm.triggerCondition || 'SLA Consumption Breached',
        actionDescription: escalationForm.actionDescription || `Notify ${escalationForm.targetRole}`
      };
      await slaRoutingService.createEscalationLevel(payload);
      const refreshed = await slaRoutingService.getConfiguration();
      setEscalationLevels(refreshed.escalationLevels || []);
      setSuccessMessage(`Escalation Level ${payload.levelNumber} added successfully.`);
      setEscalationDrawerOpen(false);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err) {
      console.error('Failed to create escalation level:', err);
      // Fallback local addition if needed
      const fallbackLevel = {
        id: crypto.randomUUID(),
        levelNumber: escalationForm.levelNumber,
        name: escalationForm.name,
        assignmentType: 'Role',
        targetRole: escalationForm.targetRole,
        triggerType: 'SlaPercentage',
        triggerDescription: escalationForm.triggerCondition || 'SLA Consumption Breached',
        actionDescription: escalationForm.actionDescription || `Notify ${escalationForm.targetRole}`,
        reassignOwner: true,
        isActive: true
      };
      setEscalationLevels(prev => [...prev, fallbackLevel]);
      setSuccessMessage(`Escalation Level ${fallbackLevel.levelNumber} added.`);
      setEscalationDrawerOpen(false);
      setTimeout(() => setSuccessMessage(null), 3500);
    } finally {
      setEscalationSaving(false);
    }
  }

  function handleRequestDeleteLevel(lvl) {
    setLevelToDelete(lvl);
  }

  async function handleConfirmDeleteLevel() {
    if (!levelToDelete) return;
    setIsDeletingLevel(true);
    try {
      if (levelToDelete.id) {
        await slaRoutingService.deleteEscalationLevel(levelToDelete.id);
        const refreshed = await slaRoutingService.getConfiguration();
        setEscalationLevels(refreshed.escalationLevels || []);
      } else {
        setEscalationLevels(prev => {
          const filtered = prev.filter(l => l.levelNumber !== levelToDelete.levelNumber);
          return filtered.map((l, i) => ({
            ...l,
            levelNumber: i + 1,
            name: l.name.startsWith('Level ') ? `Level ${i + 1}` : l.name
          }));
        });
      }
      setSuccessMessage(`Escalation Level ${levelToDelete.levelNumber} deleted.`);
      setTimeout(() => setSuccessMessage(null), 3500);
      setLevelToDelete(null);
    } catch (err) {
      console.error('Failed to delete escalation level:', err);
      setError(err?.response?.data?.error || err.message || 'Failed to delete escalation level.');
    } finally {
      setIsDeletingLevel(false);
    }
  }

  function handleEscalationFieldChange(index, field, value) {
    setEscalationLevels(prev => prev.map((l, i) => {
      if (i === index) {
        return { ...l, [field]: value };
      }
      return l;
    }));
  }

  function handleQuickAddHoliday(e) {
    e.preventDefault();
    if (!quickHolidayText.trim()) {
      openAddHolidayDrawer();
      return;
    }
    const parts = quickHolidayText.split(/[—–-]/);
    if (parts.length >= 2) {
      const namePart = parts[0].trim();
      const datePart = parts.slice(1).join('-').trim();
      const parsedDate = new Date(datePart);
      if (!isNaN(parsedDate.getTime())) {
        const isoDate = parsedDate.toISOString().split('T')[0];
        setHolidayForm({
          holidayDate: isoDate,
          name: namePart,
          isActive: true,
          description: ''
        });
        setHolidayDrawerError(null);
        setHolidayDrawerOpen(true);
        setQuickHolidayText('');
        return;
      }
    }
    setHolidayForm({
      holidayDate: '',
      name: quickHolidayText.trim(),
      isActive: true,
      description: ''
    });
    setHolidayDrawerError(null);
    setHolidayDrawerOpen(true);
    setQuickHolidayText('');
  }

  // --- Handlers: Public Holidays Side Drawer ---
  function openAddHolidayDrawer() {
    setEditingHoliday(null);
    setHolidayForm({ holidayDate: '', name: '', isActive: true, description: '' });
    setHolidayDrawerError(null);
    setHolidayDrawerOpen(true);
  }

  function openEditHolidayDrawer(holiday) {
    setEditingHoliday(holiday);
    setHolidayForm({
      holidayDate: holiday.holidayDate ? holiday.holidayDate.split('T')[0] : '',
      name: holiday.name,
      isActive: holiday.isActive,
      description: holiday.description || ''
    });
    setHolidayDrawerError(null);
    setHolidayDrawerOpen(true);
  }

  function handleCloseHolidayDrawer() {
    if (holidaySaving) return;
    setHolidayDrawerOpen(false);
    setEditingHoliday(null);
    setHolidayDrawerError(null);
  }

  async function handleSaveHoliday(e) {
    e.preventDefault();
    if (!holidayForm.holidayDate || !holidayForm.name.trim()) return;

    setHolidaySaving(true);
    setHolidayDrawerError(null);
    try {
      if (editingHoliday) {
        const updated = await slaRoutingService.updateHoliday(editingHoliday.id, {
          holidayDate: holidayForm.holidayDate,
          name: holidayForm.name.trim(),
          isActive: holidayForm.isActive
        });
        setPublicHolidays(prev => prev.map(h => h.id === editingHoliday.id ? updated : h));
        setSuccessMessage(`Public holiday '${updated.name}' updated successfully.`);
      } else {
        const created = await slaRoutingService.createHoliday({
          holidayDate: holidayForm.holidayDate,
          name: holidayForm.name.trim(),
          isActive: holidayForm.isActive
        });
        setPublicHolidays(prev => [...prev, created].sort((a, b) => new Date(a.holidayDate) - new Date(b.holidayDate)));
        setSuccessMessage(`Public holiday '${created.name}' created successfully.`);
      }
      setHolidayDrawerOpen(false);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err) {
      console.error('Failed to save holiday:', err);
      const errMsg = err?.response?.data?.error || err.message || 'Unable to save public holiday.';
      setHolidayDrawerError(errMsg);
    } finally {
      setHolidaySaving(false);
    }
  }

  // --- Handlers: Delete Public Holiday Confirmation ---
  function handleRequestDeleteHoliday(holiday) {
    setHolidayToDelete(holiday);
  }

  async function handleConfirmDeleteHoliday() {
    if (!holidayToDelete) return;
    setIsDeletingHoliday(true);
    try {
      await slaRoutingService.deleteHoliday(holidayToDelete.id);
      setPublicHolidays(prev => prev.filter(h => h.id !== holidayToDelete.id));
      setSuccessMessage(`Public holiday '${holidayToDelete.name}' deleted.`);
      setTimeout(() => setSuccessMessage(null), 3500);
      setHolidayToDelete(null);
    } catch (err) {
      console.error('Failed to delete holiday:', err);
      setError(err?.response?.data?.error || err.message || 'Failed to delete holiday.');
    } finally {
      setIsDeletingHoliday(false);
    }
  }

  if (loading) {
    return (
      <div className="sla-routing-page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Loader text="Loading SLA & Routing Configuration…" />
      </div>
    );
  }

  return (
    <div className="sla-routing-page">
      {/* 1. HEADER BANNER */}
      <div className="sla-routing-page__header">
        <div className="sla-routing-banner">
          <div className="sla-routing-banner__left">
            <div className="sla-routing-banner__icon-box">
              <Sliders size={24} strokeWidth={2.2} />
            </div>
            <div>
              <h1 className="sla-routing-banner__title">Cases SLA & Routing</h1>
              <p className="sla-routing-banner__subtitle">
                Configure SLA, operating calendar and escalation rules.
              </p>
            </div>
          </div>

          <div className="sla-routing-banner__right">
            <div className="sla-routing-actions">
              <button
                type="button"
                id="btn-sla-discard"
                className="sla-btn sla-btn--secondary"
                onClick={handleDiscard}
                disabled={!isDirty || saving}
                title={isDirty ? 'Discard unsaved changes' : 'No unsaved changes'}
              >
                <RotateCcw size={14} />
                <span>Discard</span>
              </button>
              <button
                type="button"
                id="btn-sla-save"
                className="sla-btn sla-btn--primary"
                onClick={handleSave}
                disabled={!isDirty || saving || categoryCollisions.length > 0 || Boolean(businessHoursError)}
                title={categoryCollisions.length > 0 ? 'Resolve category conflicts before saving' : 'Save configuration'}
              >
                <Save size={14} />
                <span>{saving ? 'Saving...' : 'Save Configuration'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FEEDBACK ALERTS */}
      {error && (
        <div className="sla-feedback-alert sla-feedback-alert--error">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button type="button" className="sla-feedback-alert__close" onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="sla-feedback-alert sla-feedback-alert--success">
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
          <button type="button" className="sla-feedback-alert__close" onClick={() => setSuccessMessage(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {categoryCollisions.length > 0 && (
        <div className="sla-feedback-alert sla-feedback-alert--error">
          <AlertCircle size={16} />
          <span><strong>Category Conflict:</strong> The following categories are assigned to multiple priorities: <em>{categoryCollisions.join(', ')}</em>. Each category must map to exactly one priority.</span>
        </div>
      )}

      {/* 2. TAB STRIP (EXACTLY 3 SECTIONS) */}
      <div className="sla-routing-nav">
        <button
          type="button"
          id="tab-priority-sla"
          className={`sla-nav-tab ${activeTab === 'sla' ? 'sla-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('sla')}
        >
          <Clock size={14} />
          <span>Priority SLA Matrix</span>
        </button>
        <button
          type="button"
          id="tab-operating-hours"
          className={`sla-nav-tab ${activeTab === 'operating-hours' ? 'sla-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('operating-hours')}
        >
          <Calendar size={14} />
          <span>Operating Hours & Holidays</span>
        </button>
        <button
          type="button"
          id="tab-escalation"
          className={`sla-nav-tab ${activeTab === 'escalation' ? 'sla-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('escalation')}
        >
          <Layers size={14} />
          <span>Escalation Matrix</span>
        </button>
        <button
          type="button"
          id="tab-routing-rules"
          className={`sla-nav-tab ${activeTab === 'routing-rules' ? 'sla-nav-tab--active' : ''}`}
          onClick={() => setActiveTab('routing-rules')}
        >
          <GitBranch size={14} />
          <span>Routing Rules</span>
        </button>
      </div>

      {/* 3. MAIN CONTENT BODY */}
      <div className="sla-routing-content">

        {/* ==================== TAB 1: PRIORITY-BASED SLA MATRIX ==================== */}
        {activeTab === 'sla' && (
          <section className="sla-card" id="sla-priority-matrix">
            <div className="sla-card__header">
              <div className="sla-card__header-left">
                <div className="sla-card__header-icon">
                  <Clock size={18} />
                </div>
                <div>
                  <h2 className="sla-card__title">Priority-Based SLA Matrix</h2>
                </div>
              </div>
            </div>

            <div className="sla-card__body">
              <table className="sla-matrix-table">
                <thead>
                  <tr>
                    <th style={{ width: '14%' }}>Priority</th>
                    <th style={{ width: '21%' }}>First Response Target</th>
                    <th style={{ width: '21%' }}>Internal Resolution</th>
                    <th style={{ width: '21%' }}>External Resolution</th>
                    <th style={{ width: '23%' }}>Apply To Categories</th>
                  </tr>
                </thead>
                <tbody>
                  {priorityRules.map(rule => {
                    const badgeClass = `sla-priority-badge--${rule.priority.toLowerCase()}`;
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

                        {/* First Response Target (Clean inputs, no redundant conversion text) */}
                        <td>
                          <div className="sla-time-input-group">
                            <input
                              type="number"
                              min="1"
                              id={`input-fr-val-${rule.priority.toLowerCase()}`}
                              value={rule.firstResponseValue}
                              onChange={(e) => handlePriorityFieldChange(rule.priority, 'firstResponseValue', e.target.value)}
                            />
                            <select
                              id={`select-fr-unit-${rule.priority.toLowerCase()}`}
                              value={rule.firstResponseUnit}
                              onChange={(e) => handlePriorityFieldChange(rule.priority, 'firstResponseUnit', e.target.value)}
                            >
                              <option value="Minutes">Minutes</option>
                              <option value="Hours">Hours</option>
                            </select>
                          </div>
                        </td>

                        {/* Internal Resolution Target (Clean inputs, no redundant conversion text) */}
                        <td>
                          <div className="sla-time-input-group">
                            <input
                              type="number"
                              min="1"
                              id={`input-int-val-${rule.priority.toLowerCase()}`}
                              value={rule.internalResolutionValue}
                              onChange={(e) => handlePriorityFieldChange(rule.priority, 'internalResolutionValue', e.target.value)}
                            />
                            <select
                              id={`select-int-unit-${rule.priority.toLowerCase()}`}
                              value={rule.internalResolutionUnit}
                              onChange={(e) => handlePriorityFieldChange(rule.priority, 'internalResolutionUnit', e.target.value)}
                            >
                              <option value="Minutes">Minutes</option>
                              <option value="Hours">Hours</option>
                            </select>
                          </div>
                        </td>

                        {/* External Resolution Target (Clean inputs, no redundant conversion text) */}
                        <td>
                          <div className="sla-time-input-group">
                            <input
                              type="number"
                              min="1"
                              id={`input-ext-val-${rule.priority.toLowerCase()}`}
                              value={rule.externalResolutionValue}
                              onChange={(e) => handlePriorityFieldChange(rule.priority, 'externalResolutionValue', e.target.value)}
                            />
                            <select
                              id={`select-ext-unit-${rule.priority.toLowerCase()}`}
                              value={rule.externalResolutionUnit}
                              onChange={(e) => handlePriorityFieldChange(rule.priority, 'externalResolutionUnit', e.target.value)}
                            >
                              <option value="Minutes">Minutes</option>
                              <option value="Hours">Hours</option>
                            </select>
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

        {/* ==================== TAB 2: OPERATING HOURS & HOLIDAYS ==================== */}
        {activeTab === 'operating-hours' && (
          <div className="sla-operating-hours-container">
            {/* SUB-SECTION 1: BUSINESS OPERATING HOURS (LEFT COLUMN) */}
            <section className="sla-bh-card" id="business-operating-hours">
              <div className="sla-bh-card__header">
                <div>
                  <h2 className="sla-bh-card__title">Business hours</h2>
                </div>
                <span className="sla-bh-card__badge">MY · GMT+8 · drives SLA clocks</span>
              </div>

              <div className="sla-bh-card__body">
                <div className="sla-business-hours-grid">
                  {[
                    {
                      id: 'mon-fri',
                      label: 'Mon–Fri',
                      isEnabled: monFriRow.isEnabled,
                      startTime: monFriRow.startTime,
                      endTime: monFriRow.endTime,
                      onToggle: handleMonFriToggle,
                      onTimeChange: handleMonFriTimeChange
                    },
                    {
                      id: 'saturday',
                      label: 'Saturday',
                      isEnabled: satRow.isEnabled,
                      startTime: satRow.startTime,
                      endTime: satRow.endTime,
                      onToggle: () => handleBusinessHourToggle(6),
                      onTimeChange: (field, val) => handleBusinessHourTimeChange(6, field, val)
                    },
                    {
                      id: 'sunday',
                      label: 'Sunday',
                      isEnabled: sunRow.isEnabled,
                      startTime: sunRow.startTime,
                      endTime: sunRow.endTime,
                      onToggle: () => handleBusinessHourToggle(0),
                      onTimeChange: (field, val) => handleBusinessHourTimeChange(0, field, val)
                    }
                  ].map(row => {
                    const isInvalidTime = row.isEnabled && row.startTime && row.endTime &&
                      row.startTime >= row.endTime;

                    return (
                      <div
                        key={row.id}
                        className={`sla-bh-row2 ${!row.isEnabled ? 'sla-bh-row2--disabled' : ''} ${isInvalidTime ? 'sla-bh-row2--error' : ''}`}
                      >
                        {/* Toggle + Day Name */}
                        <div className="sla-bh-row2__left">
                          <label className="sla-switch2" title={row.isEnabled ? `${row.label} Enabled` : `${row.label} Disabled`}>
                            <input
                              type="checkbox"
                              id={`toggle-day-${row.id}`}
                              checked={row.isEnabled}
                              onChange={row.onToggle}
                            />
                            <span className="sla-slider2" />
                          </label>
                          <span className="sla-bh-row2__day">{row.label}</span>
                        </div>

                        {/* Time Range */}
                        <div className="sla-bh-row2__times">
                          {row.isEnabled ? (
                            <>
                              <input
                                type="time"
                                id={`input-time-start-${row.id}`}
                                className="sla-bh-time2"
                                value={row.startTime}
                                onChange={(e) => row.onTimeChange('startTime', e.target.value)}
                              />
                              <span className="sla-bh-sep">–</span>
                              <input
                                type="time"
                                id={`input-time-end-${row.id}`}
                                className="sla-bh-time2"
                                value={row.endTime}
                                onChange={(e) => row.onTimeChange('endTime', e.target.value)}
                              />
                            </>
                          ) : (
                            <>
                              <span className="sla-bh-dash">—</span>
                              <span className="sla-bh-sep">–</span>
                              <span className="sla-bh-dash">—</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="sla-bh-notice">
                  <Info size={14} style={{ color: '#2563eb', flexShrink: 0 }} />
                  <span>SLA timers pause outside business hours and on public holidays.</span>
                </div>
              </div>
            </section>

            {/* SUB-SECTION 2: PUBLIC HOLIDAYS */}
            <section className="sla-ph-card" id="public-holidays">
              <div className="sla-ph-card__header">
                <h2 className="sla-ph-card__title">Public holidays</h2>
                <span className="sla-ph-card__badge">SLA-exempt days</span>
              </div>

              <div className="sla-ph-card__body">
                {publicHolidays.length === 0 ? (
                  <div className="sla-empty-holidays">
                    <Calendar size={32} strokeWidth={1.5} style={{ color: '#94a3b8', marginBottom: '8px' }} />
                    <p>No public holidays registered yet. Use the field below to add one.</p>
                  </div>
                ) : (
                  <div className="sla-ph-list">
                    {publicHolidays.map(holiday => {
                      const dateObj = new Date(holiday.holidayDate);
                      const formattedDate = dateObj.toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      });

                      return (
                        <div key={holiday.id} className="sla-ph-row">
                          <span className="sla-ph-row__name">{holiday.name}</span>
                          <div className="sla-ph-row__right">
                            <span className="sla-ph-date-pill">{formattedDate}</span>
                            <button
                              type="button"
                              id={`btn-delete-holiday-${holiday.id}`}
                              className="sla-ph-delete-btn"
                              onClick={() => handleRequestDeleteHoliday(holiday)}
                              title="Remove Holiday"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Quick Add Row */}
                <form className="sla-ph-quick-add" onSubmit={handleQuickAddHoliday}>
                  <input
                    type="text"
                    className="sla-ph-quick-input"
                    placeholder="e.g. Nuzul Al-Quran — 14 Mar 2027"
                    value={quickHolidayText}
                    onChange={(e) => setQuickHolidayText(e.target.value)}
                  />
                  <button type="submit" className="sla-ph-add-btn">
                    Add
                  </button>
                </form>
              </div>
            </section>
          </div>
        )}

        {/* ==================== TAB 3: ESCALATION MATRIX ==================== */}
        {activeTab === 'escalation' && (
          <section className="sla-card" id="escalation-matrix">
            <div className="sla-card__header">
              <div className="sla-card__header-left">
                <div className="sla-card__header-icon">
                  <Layers size={18} />
                </div>
                <div>
                  <h2 className="sla-card__title">Escalation matrix</h2>
                  <span className="sla-card__subtitle">fully configurable — auto-fires from SLA consumption; all triggers audit-logged</span>
                </div>
              </div>

              <button
                type="button"
                id="btn-add-escalation-level"
                className="sla-btn sla-btn--blue"
                onClick={handleOpenAddEscalationDrawer}
              >
                <Plus size={14} />
                <span>Add Escalation Level</span>
              </button>
            </div>

            <div className="sla-card__body">
              {/* Horizontal Escalation Flow Cards */}
              <div className="sla-horizontal-escalation-flow">
                {escalationLevels.map((lvl, index) => {
                  const isLast = index === escalationLevels.length - 1;
                  const currentRoleList = availableRoles.concat(
                    lvl.targetRole && !availableRoles.includes(lvl.targetRole) ? [lvl.targetRole] : []
                  );

                  return (
                    <React.Fragment key={lvl.id || lvl.levelNumber || index}>
                      <div className="sla-hlevel-card" id={`sla-level-card-${lvl.levelNumber || index + 1}`}>
                        {/* Header: Level Pill & Delete Action */}
                        <div className="sla-hlevel-header">
                          <span className="sla-hlevel-pill">LEVEL {lvl.levelNumber || index + 1}</span>
                          <button
                            type="button"
                            id={`btn-delete-level-${lvl.levelNumber || index + 1}`}
                            className="sla-hlevel-delete-btn"
                            onClick={() => handleRequestDeleteLevel(lvl)}
                            title={`Delete Level ${lvl.levelNumber || index + 1}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {/* 1. Target Role */}
                        <div className="sla-hlevel-role-block">
                          <select
                            className="sla-hlevel-role-select"
                            value={lvl.targetRole || availableRoles[0] || 'Team Lead'}
                            onChange={(e) => handleEscalationFieldChange(index, 'targetRole', e.target.value)}
                            title="Target Role"
                          >
                            {currentRoleList.map(role => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                        </div>

                        {/* 2. Trigger Condition */}
                        <div className="sla-hlevel-field-group">
                          <label className="sla-hlevel-field-label">TRIGGER</label>
                          <input
                            type="text"
                            className="sla-hlevel-input"
                            value={lvl.triggerDescription || lvl.triggerCondition || ''}
                            placeholder="e.g. SLA 70% consumed"
                            onChange={(e) => {
                              handleEscalationFieldChange(index, 'triggerDescription', e.target.value);
                              handleEscalationFieldChange(index, 'triggerCondition', e.target.value);
                            }}
                          />
                        </div>

                        {/* 3. Action */}
                        <div className="sla-hlevel-field-group">
                          <label className="sla-hlevel-field-label">ACTION</label>
                          <input
                            type="text"
                            className="sla-hlevel-input"
                            value={lvl.actionDescription || ''}
                            placeholder="e.g. Reminder + queue flag"
                            onChange={(e) => handleEscalationFieldChange(index, 'actionDescription', e.target.value)}
                          />
                        </div>
                      </div>

                      {!isLast && (
                        <div className="sla-hlevel-arrow" aria-hidden="true">
                          <ChevronRight size={18} strokeWidth={2.5} />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ==================== TAB 4: ROUTING RULES & CASE ASSIGNMENT ENGINE ==================== */}
        {activeTab === 'routing-rules' && (
          <section className="routing-rules-tab-content" aria-label="Routing Rules & Case Assignment">
            {/* Header with Title, Subtitle, and Add Rule Button */}
            <div className="routing-tab-header">
              <div className="routing-tab-header__left">
                <h2 className="routing-tab-header__title">Routing Rules</h2>
                <p className="routing-tab-header__subtitle">
                  Rules are evaluated top-down on intake. The first matching rule determines the initial queue and priority.
                </p>
              </div>
              <button
                type="button"
                id="btn-add-routing-rule"
                className="sla-btn sla-btn--primary"
                onClick={() => {
                  setEditingRule(null);
                  setRuleDrawerOpen(true);
                }}
              >
                <Plus size={16} />
                <span>Add Rule</span>
              </button>
            </div>

            {/* Rules Cards List */}
            <div className="routing-rules-list">
              {routingRules.length === 0 ? (
                <div className="sla-empty-holidays">
                  No routing rules configured. Click &quot;Add Rule&quot; to define intake routing logic.
                </div>
              ) : (
                routingRules.map((rule, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === routingRules.length - 1;

                  return (
                    <div
                      key={rule.id}
                      className={`routing-rule-card ${!rule.isActive ? 'routing-rule-card--inactive' : ''}`}
                    >
                      <div className="routing-rule-card__top">
                        <div className="routing-rule-card__title-wrap">
                          <div className="routing-rule-card__drag-handle" title="Rule order">
                            <GripVertical size={16} />
                          </div>
                          <span className="routing-rule-card__order-badge">#{rule.evaluationOrder || idx + 1}</span>
                          <span className="routing-rule-card__name">{rule.name}</span>
                        </div>

                        <div className="routing-rule-card__actions">
                          {/* STRICT ENTERPRISE BLUE TOGGLE */}
                          <div className="routing-toggle-wrap">
                            <button
                              type="button"
                              className={`routing-toggle-switch ${rule.isActive ? 'routing-toggle-switch--active' : ''}`}
                              onClick={() => handleToggleRule(rule.id)}
                              title={rule.isActive ? 'Deactivate rule' : 'Activate rule'}
                              aria-pressed={rule.isActive}
                            >
                              <span className="routing-toggle-knob" />
                            </button>
                            <span className="routing-toggle-label">{rule.isActive ? 'Active' : 'Inactive'}</span>
                          </div>

                          {/* Order Buttons */}
                          <div className="routing-order-btns">
                            <button
                              type="button"
                              className="routing-icon-btn"
                              title="Move up"
                              disabled={isFirst}
                              onClick={() => handleMoveRule(idx, -1)}
                            >
                              <ChevronUp size={15} />
                            </button>
                            <button
                              type="button"
                              className="routing-icon-btn"
                              title="Move down"
                              disabled={isLast}
                              onClick={() => handleMoveRule(idx, 1)}
                            >
                              <ChevronDown size={15} />
                            </button>
                          </div>

                          {/* Edit Button */}
                          <button
                            type="button"
                            className="routing-icon-btn"
                            title="Edit rule"
                            onClick={() => {
                              setEditingRule(rule);
                              setRuleDrawerOpen(true);
                            }}
                          >
                            <Edit2 size={15} />
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            className="routing-icon-btn routing-icon-btn--delete"
                            title="Delete rule"
                            onClick={() => setRuleToDelete(rule)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      {rule.description && (
                        <div className="routing-rule-card__desc">
                          {rule.description}
                        </div>
                      )}

                      <div className="routing-rule-card__bottom">
                        <span className="routing-dest-badge">
                          <ArrowRight size={13} className="routing-dest-badge__arrow" />
                          <span>{rule.targetDepartmentName || rule.targetQueueName || 'Destination Team'}</span>
                        </span>
                        {rule.actionDescription && (
                          <span className="routing-action-note">{rule.actionDescription}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Case Assignment Algorithm Section (Matching Reference Screenshot) */}
            <div className="routing-algo-section">
              <div className="routing-algo-section__header">
                <h3 className="routing-algo-section__title">Case Assignment Algorithm</h3>
                <p className="routing-algo-section__subtitle">
                  How cases are distributed to agents within the routed queue.
                </p>
              </div>

              <div className="routing-algo-grid">
                {/* 1. Round-robin */}
                <div
                  className={`routing-algo-card ${assignmentConfig.algorithm === 'RoundRobin' ? 'routing-algo-card--selected' : ''}`}
                  onClick={() => handleSelectAlgorithm('RoundRobin')}
                >
                  <div className="routing-algo-card__radio-row">
                    <div className="routing-algo-card__radio-circle">
                      {assignmentConfig.algorithm === 'RoundRobin' && <div className="routing-algo-card__radio-inner" />}
                    </div>
                    <span className="routing-algo-card__title">Round-robin</span>
                    {assignmentConfig.algorithm === 'RoundRobin' && (
                      <span className="routing-algo-card__badge">Active default</span>
                    )}
                  </div>
                  <p className="routing-algo-card__desc">
                    Sequentially distributes cases evenly across all online queue members.
                  </p>
                </div>

                {/* 2. Skill-based */}
                <div
                  className={`routing-algo-card ${assignmentConfig.algorithm === 'SkillBased' ? 'routing-algo-card--selected' : ''}`}
                  onClick={() => handleSelectAlgorithm('SkillBased')}
                >
                  <div className="routing-algo-card__radio-row">
                    <div className="routing-algo-card__radio-circle">
                      {assignmentConfig.algorithm === 'SkillBased' && <div className="routing-algo-card__radio-inner" />}
                    </div>
                    <span className="routing-algo-card__title">Skill-based</span>
                    {assignmentConfig.algorithm === 'SkillBased' && (
                      <span className="routing-algo-card__badge">Active</span>
                    )}
                  </div>
                  <p className="routing-algo-card__desc">
                    Matches case category, language, and complexity to agent proficiency ratings.
                  </p>
                </div>

                {/* 3. Least occupancy */}
                <div
                  className={`routing-algo-card ${assignmentConfig.algorithm === 'LeastOccupancy' ? 'routing-algo-card--selected' : ''}`}
                  onClick={() => handleSelectAlgorithm('LeastOccupancy')}
                >
                  <div className="routing-algo-card__radio-row">
                    <div className="routing-algo-card__radio-circle">
                      {assignmentConfig.algorithm === 'LeastOccupancy' && <div className="routing-algo-card__radio-inner" />}
                    </div>
                    <span className="routing-algo-card__title">Least occupancy</span>
                    {assignmentConfig.algorithm === 'LeastOccupancy' && (
                      <span className="routing-algo-card__badge">Active</span>
                    )}
                  </div>
                  <p className="routing-algo-card__desc">
                    Assigns to the agent with the lowest number of currently open cases.
                  </p>
                </div>
              </div>

              {/* Agent Capacity Input */}
              <div className="routing-capacity-row">
                <span className="routing-capacity-label">Agent Max Concurrent Capacity:</span>
                <input
                  type="number"
                  min="1"
                  max="50"
                  className="routing-capacity-input"
                  value={assignmentConfig.maxConcurrentCapacity || 5}
                  onChange={(e) => handleCapacityChange(parseInt(e.target.value, 10) || 5)}
                />
                <span className="routing-capacity-hint">active cases per agent before queueing</span>
              </div>
            </div>
          </section>
        )}

      </div>

      {/* ==================== PUBLIC HOLIDAY RIGHT-SIDE DRAWER ==================== */}
      {holidayDrawerOpen && createPortal(
        <>
          <div className="sla-drawer-overlay" onClick={handleCloseHolidayDrawer} aria-hidden="true" />
          <aside className="sla-drawer" role="dialog" aria-modal="true" aria-label={editingHoliday ? 'Edit Public Holiday' : 'Add Public Holiday'}>
            <div className="sla-drawer__header">
              <div className="sla-drawer__header-content">
                <h3 className="sla-drawer__title">
                  {editingHoliday ? 'Edit Public Holiday' : 'Add Public Holiday'}
                </h3>
                <p className="sla-drawer__subtitle">
                  {editingHoliday
                    ? 'Update statutory holiday details and SLA countdown pause behavior.'
                    : 'Register a statutory holiday to pause SLA consumption for all open cases.'}
                </p>
              </div>
              <button
                type="button"
                id="btn-close-holiday-drawer"
                className="sla-drawer__close-btn"
                onClick={handleCloseHolidayDrawer}
                disabled={holidaySaving}
                title="Close Drawer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveHoliday} className="sla-drawer__form">
              <div className="sla-drawer__body">
                {holidayDrawerError && (
                  <div className="sla-drawer-error">
                    <AlertCircle size={16} />
                    <span>{holidayDrawerError}</span>
                  </div>
                )}

                <div className="sla-field-col">
                  <label className="sla-field-label">
                    Holiday Name <span className="sla-field-required">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    id="holiday-name-input"
                    placeholder="e.g. National Malaysia Day"
                    className="sla-field-input"
                    value={holidayForm.name}
                    onChange={(e) => setHolidayForm(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="sla-field-col">
                  <label className="sla-field-label">
                    Holiday Date <span className="sla-field-required">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    id="holiday-date-input"
                    className="sla-field-input"
                    value={holidayForm.holidayDate}
                    onChange={(e) => setHolidayForm(prev => ({ ...prev, holidayDate: e.target.value }))}
                  />
                </div>

                <div className="sla-field-col">
                  <label className="sla-field-label">Status</label>
                  <label className="sla-reassign-toggle">
                    <input
                      type="checkbox"
                      id="holiday-active-input"
                      checked={holidayForm.isActive}
                      onChange={(e) => setHolidayForm(prev => ({ ...prev, isActive: e.target.checked }))}
                    />
                    <span>Active (Pauses SLA Countdown Clocks)</span>
                  </label>
                  <div className="sla-time-hint" style={{ marginTop: '4px' }}>
                    When active, open case SLAs will pause on this calendar date and resume on the next operating window.
                  </div>
                </div>

                <div className="sla-field-col">
                  <label className="sla-field-label">Description / Operational Notes</label>
                  <textarea
                    rows={3}
                    id="holiday-description-input"
                    placeholder="Optional notes or regulatory reference for this statutory holiday..."
                    className="sla-field-input"
                    style={{ resize: 'vertical' }}
                    value={holidayForm.description || ''}
                    onChange={(e) => setHolidayForm(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>
              </div>

              <div className="sla-drawer__footer">
                <button
                  type="button"
                  id="btn-cancel-holiday-drawer"
                  className="sla-btn sla-btn--outline"
                  onClick={handleCloseHolidayDrawer}
                  disabled={holidaySaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-save-holiday-drawer"
                  className="sla-btn sla-btn--blue"
                  disabled={holidaySaving || !holidayForm.holidayDate || !holidayForm.name.trim()}
                >
                  {holidaySaving ? 'Saving...' : (editingHoliday ? 'Update Holiday' : 'Save Holiday')}
                </button>
              </div>
            </form>
          </aside>
        </>,
        document.body
      )}

      {/* ==================== DELETE HOLIDAY CONFIRMATION DIALOG ==================== */}
      {holidayToDelete && (
        <ConfirmDialog
          isOpen={Boolean(holidayToDelete)}
          title="Delete Public Holiday"
          message={`Are you sure you want to delete "${holidayToDelete.name}" (${new Date(holidayToDelete.holidayDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })})? Open cases will resume standard SLA calculation on this date.`}
          confirmLabel="Delete Holiday"
          isBusy={isDeletingHoliday}
          onCancel={() => setHolidayToDelete(null)}
          onConfirm={handleConfirmDeleteHoliday}
          variant="destructive"
          itemDetails={{
            name: holidayToDelete.name,
            itemName: holidayToDelete.name
          }}
        />
      )}

      {/* ==================== ESCALATION LEVEL RIGHT-SIDE DRAWER ==================== */}
      {escalationDrawerOpen && createPortal(
        <>
          <div className="sla-drawer-overlay" onClick={() => setEscalationDrawerOpen(false)} aria-hidden="true" />
          <aside className="sla-drawer" role="dialog" aria-modal="true" aria-label="Add Escalation Level">
            <div className="sla-drawer__header">
              <div className="sla-drawer__header-content">
                <h3 className="sla-drawer__title">Add Escalation Level</h3>
                <p className="sla-drawer__subtitle">
                  Configure automatic threshold escalation sequence, action, and target role.
                </p>
              </div>
              <button
                type="button"
                id="btn-close-escalation-drawer"
                className="sla-drawer__close-btn"
                onClick={() => setEscalationDrawerOpen(false)}
                disabled={escalationSaving}
                title="Close Drawer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveEscalationLevel} className="sla-drawer__form">
              <div className="sla-drawer__body">
                {escalationDrawerError && (
                  <div className="sla-drawer-error">
                    <AlertCircle size={16} />
                    <span>{escalationDrawerError}</span>
                  </div>
                )}

                {/* 1. Escalation Level (Auto-generated & Readonly) */}
                <div className="sla-field-col">
                  <label className="sla-field-label">Escalation Level</label>
                  <input
                    type="text"
                    readOnly
                    id="escalation-level-number-input"
                    className="sla-field-input"
                    style={{ backgroundColor: '#f8fafc', color: '#1e40af', fontWeight: 700 }}
                    value={`Level ${escalationForm.levelNumber}`}
                  />
                  <div className="sla-time-hint">
                    Sequence is automatically determined by the escalation engine.
                  </div>
                </div>

                {/* 2. Target Role */}
                <div className="sla-field-col">
                  <label className="sla-field-label">
                    Target Role <span className="sla-field-required">*</span>
                  </label>
                  <select
                    id="escalation-target-role-select"
                    className="sla-field-select"
                    value={escalationForm.targetRole}
                    onChange={(e) => setEscalationForm(prev => ({ ...prev, targetRole: e.target.value }))}
                  >
                    {availableRoles.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>

                {/* 3. Trigger Condition */}
                <div className="sla-field-col">
                  <label className="sla-field-label">
                    Trigger Condition <span className="sla-field-required">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    id="escalation-trigger-input"
                    placeholder="e.g. SLA Breached or SLA 95% consumed"
                    className="sla-field-input"
                    value={escalationForm.triggerCondition}
                    onChange={(e) => setEscalationForm(prev => ({ ...prev, triggerCondition: e.target.value }))}
                  />
                </div>

                {/* 4. Action Description */}
                <div className="sla-field-col">
                  <label className="sla-field-label">Action Description</label>
                  <input
                    type="text"
                    id="escalation-action-input"
                    placeholder="e.g. Notify Target Role and reassign case"
                    className="sla-field-input"
                    value={escalationForm.actionDescription}
                    onChange={(e) => setEscalationForm(prev => ({ ...prev, actionDescription: e.target.value }))}
                  />
                </div>
              </div>

              <div className="sla-drawer__footer">
                <button
                  type="button"
                  id="btn-cancel-escalation-drawer"
                  className="sla-btn sla-btn--outline"
                  onClick={() => setEscalationDrawerOpen(false)}
                  disabled={escalationSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="btn-create-escalation-level"
                  className="sla-btn sla-btn--blue"
                  disabled={escalationSaving || !escalationForm.targetRole}
                >
                  {escalationSaving ? 'Creating...' : 'Create Escalation Level'}
                </button>
              </div>
            </form>
          </aside>
        </>,
        document.body
      )}

      {/* ==================== DELETE ESCALATION LEVEL CONFIRMATION DIALOG ==================== */}
      {levelToDelete && (
        <ConfirmDialog
          isOpen={Boolean(levelToDelete)}
          title="Delete Escalation Level"
          message={`Are you sure you want to delete Level ${levelToDelete.levelNumber}? Escalation ordering will be safely reorganized.`}
          confirmLabel="Delete Level"
          isBusy={isDeletingLevel}
          onCancel={() => setLevelToDelete(null)}
          onConfirm={handleConfirmDeleteLevel}
          variant="destructive"
          itemDetails={{
            name: `Level ${levelToDelete.levelNumber}`,
            itemName: `Level ${levelToDelete.levelNumber} (${levelToDelete.targetRole || 'Escalation Step'})`
          }}
        />
      )}

      {/* ==================== CREATE / EDIT ROUTING RULE DRAWER ==================== */}
      <CreateRoutingRuleDrawer
        isOpen={ruleDrawerOpen}
        onClose={() => {
          setRuleDrawerOpen(false);
          setEditingRule(null);
        }}
        onSuccess={refreshRoutingRules}
        editingRule={editingRule}
        availableDepartments={availableDepartments}
      />

      {/* ==================== DELETE ROUTING RULE CONFIRMATION DIALOG ==================== */}
      {ruleToDelete && (
        <ConfirmDialog
          isOpen={Boolean(ruleToDelete)}
          title="Delete Routing Rule"
          message={`Are you sure you want to delete the routing rule "${ruleToDelete.name}"? Incoming cases will no longer be routed by this rule.`}
          confirmLabel="Delete Rule"
          isBusy={isDeletingRule}
          onCancel={() => setRuleToDelete(null)}
          onConfirm={handleConfirmDeleteRule}
          variant="destructive"
          itemDetails={{
            name: ruleToDelete.name,
            itemName: ruleToDelete.name
          }}
        />
      )}

    </div>
  );
}

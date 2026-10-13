import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Save,
  Plus,
  Eye,
  EyeOff,
  Pencil,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Building2,
  ShieldAlert,
  Sliders,
  Filter,
  Search,
  ChevronDown,
} from 'lucide-react';
import { Button } from '../../components/common/Button/Button.jsx';
import { Loader } from '../../components/common/Loader/Loader.jsx';
import { Input } from '../../components/common/Input/Input.jsx';
import { configurableSettingsService } from '../../services/configurableSettingsService.js';
import { departmentService } from '../../services/departmentService.js';
import { useToast } from '../../hooks/useToast.js';
import { FieldEditorDrawer } from './FieldEditorDrawer.jsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog/ConfirmDialog.jsx';
import { Modal } from '../../components/common/Modal/Modal.jsx';
import { MasterItem } from './MasterItem.jsx';
import { UnsavedChangesDialog } from '../../components/common/UnsavedChangesDialog/UnsavedChangesDialog.jsx';
import { AssignmentSettingsTab } from './AssignmentSettingsTab.jsx';
import './ConfigurableSettingsPage.css';

const MASKING_OPTIONS = [
  { value: 'None', label: 'No masking' },
  { value: 'FullMask', label: 'Full mask' },
  { value: 'HideMiddle', label: 'Hide Middle, Show Ends' },
  { value: 'HideFirstShowLast', label: 'Hide first, show last' },
];

const SEVERITY_BADGES = {
  Critical: { bg: '#fee2e2', text: '#dc2626', border: '#fca5a5', desc: 'System outages, severe financial risk, urgent regulatory breaches' },
  High: { bg: '#fef3c7', text: '#b45309', border: '#fde68a', desc: 'Major account issues, high priority customer complaints' },
  Medium: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', desc: 'Standard customer requests and routine inquiries' },
  Low: { bg: '#dcfce7', text: '#15803d', border: '#86efac', desc: 'Low impact queries, general feedback, non-urgent tasks' },
};

const SEVERITY_BADGE_FALLBACK = {
  bg: '#f3e8ff',
  text: '#7c3aed',
  border: '#ddd6fe',
  desc: 'Custom severity level configured by an administrator',
};

/** Tabs whose contents are a field-configuration table saved by the header Save button. */
const FIELD_SECTIONS = ['AddNewCustomer', 'ExistingCustomer', 'Filters', 'CreateCase'];

/** The key the server derives from a label for a new custom field (mirrors ConfigurableSettingsService.SanitizeApiField). */
function previewApiField(label) {
  const cleaned = String(label || '').replace(/[^A-Za-z0-9]/g, '');
  return cleaned ? cleaned[0].toLowerCase() + cleaned.slice(1) : 'newField';
}

const sortByOrder = (list) => [...(list || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
const fieldKey = (f) => f.id || f.draftKey || f.apiField;
const isSameField = (a, b) => fieldKey(a) === fieldKey(b);

/**
 * Display orders must be unique within a form. Mirrors the server's rule so the administrator is told before saving: only a
 * NEW field or one whose order was just changed is checked (old duplicates among untouched fields never block a save).
 * @returns {Record<string,string>} message per field key
 */
function findOrderConflicts(current, saved) {
  const out = {};
  for (const f of current) {
    const orig = saved.find((s) => s.id && s.id === f.id);
    const touched = !orig || Number(orig.displayOrder) !== Number(f.displayOrder);
    if (touched && current.some((o) => o !== f && Number(o.displayOrder) === Number(f.displayOrder))) {
      out[fieldKey(f)] = `Display order ${f.displayOrder} is already assigned to another field. Please choose a different display order.`;
    }
  }
  return out;
}

/** Every per-field message the server returned, flattened (first few), falling back to the error's own text. */
function serverMessages(err) {
  const raw = err?.original?.response?.data?.errors;
  if (raw && typeof raw === 'object') {
    const all = [...new Set(Object.values(raw).flat().map(String))];
    if (all.length) return all.slice(0, 3).join(' • ') + (all.length > 3 ? ` • (+${all.length - 3} more)` : '');
  }
  return err?.message || 'Failed to save settings.';
}

export function ConfigurableSettingsPage() {
  const toast = useToast();
  const navigate = useNavigate();

  // Top level selector state: 'Customer360' vs 'CaseManagement'
  const [topSelector, setTopSelector] = useState('Customer360');
  const [activeSection, setActiveSection] = useState('AddNewCustomer');
  const [caseSection, setCaseSection] = useState('CreateCase');

  const [fields, setFields] = useState([]);
  const [savedFields, setSavedFields] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Add / Edit field drawer
  const [isFieldDrawerOpen, setIsFieldDrawerOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  // Option changes made in the field drawer, per list: { [typeCode]: { name, values: [{ id?, value, label, displayOrder, isActive }] } }.
  // They are saved together with the fields (one Save Changes) and reported in the unsaved-changes summary.
  const [lookupDrafts, setLookupDrafts] = useState({});
  const [serverLookups, setServerLookups] = useState({});   // list code -> options as stored, for the summary diff
  const [fieldErrors, setFieldErrors] = useState({});         // field key -> message from the last failed save

  // Shared confirmation dialog — no browser confirm() anywhere on this page
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: 'Delete Confirmation',
    message: '',
    confirmLabel: 'Delete',
    isBusy: false,
    onConfirmAction: null,
  });

  // Customer 360 master lookups



  // Case Management master data
  const [caseTypes, setCaseTypes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentsError, setDepartmentsError] = useState(null);
  const [severities, setSeverities] = useState([]);
  const [lookupTypes, setLookupTypes] = useState([]);
  const [quickActions, setQuickActions] = useState([]);
  const [dateRanges, setDateRanges] = useState([]);
  const [caseStatuses, setCaseStatuses] = useState([]);
  const [slaStatuses, setSlaStatuses] = useState([]);

  // Inputs
  const [newQuickActionInput, setNewQuickActionInput] = useState('');
  const [newDateRangeInput, setNewDateRangeInput] = useState('');
  const [newCaseStatusInput, setNewCaseStatusInput] = useState('');
  const [newSlaStatusInput, setNewSlaStatusInput] = useState('');

  // Dashboard Search States (SEARCH = YES, ADD = NO for fixed categories)
  const [dashQaSearch, setDashQaSearch] = useState('');
  const [dashDateRangeSearch, setDashDateRangeSearch] = useState('');
  const [dashDeptSearch, setDashDeptSearch] = useState('');
  const [dashStatusSearch, setDashStatusSearch] = useState('');
  const [dashCaseTypeSearch, setDashCaseTypeSearch] = useState('');
  const [dashSeveritySearch, setDashSeveritySearch] = useState('');
  const [dashSlaStatusSearch, setDashSlaStatusSearch] = useState('');

  // Per-action busy flags so buttons cannot be double-submitted
  const [pending, setPending] = useState({});
  const isPending = (key) => Boolean(pending[key]);
  const runPending = useCallback(async (key, fn) => {
    setPending((prev) => ({ ...prev, [key]: true }));
    try {
      return await fn();
    } finally {
      setPending((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  const currentSectionKey = topSelector === 'Customer360' ? activeSection : caseSection;

  // Assign & Reassign tab: it owns its data and reports whether it has unsaved edits (and which), so the page's one guard covers it.
  const isAssignmentTab = topSelector === 'CaseManagement' && caseSection === 'AssignReassign';
  const assignmentTabRef = useRef(null);
  const [assignmentStatus, setAssignmentStatus] = useState({ isDirty: false, changes: [] });
  const handleAssignmentDirtyChange = useCallback((status) => setAssignmentStatus(status), []);
  useEffect(() => {
    if (!isAssignmentTab) setAssignmentStatus({ isDirty: false, changes: [] });   // leaving the tab discards its draft
  }, [isAssignmentTab]);
  const isFieldTab = FIELD_SECTIONS.includes(currentSectionKey) || (topSelector === 'CaseManagement' && caseSection === 'Filters');
  // Filters are search inputs: masking does not apply to them (the server refuses it), so the masking columns are not offered.
  const isFilterSection = currentSectionKey === 'Filters';

  // Unsaved changes dirty state calculation across all modules
  const hasUnsavedChanges = useMemo(() => {
    if (isAssignmentTab) return assignmentStatus.isDirty;
    // 1. Field configuration tabs (Customer 360: AddNewCustomer, ExistingCustomer, Filters; Case Management: CreateCase, Filters)
    if (isFieldTab) {
      return JSON.stringify(fields) !== JSON.stringify(savedFields) || Object.keys(lookupDrafts).length > 0;
    }
    return false;
  }, [isAssignmentTab, assignmentStatus, isFieldTab, fields, savedFields, lookupDrafts]);

  // Dynamic Changes Summary calculation: compares draft states with saved snapshots
  const unsavedChangesList = useMemo(() => {
    if (isAssignmentTab) return assignmentStatus.changes;
    const list = [];
    if (!isFieldTab) return list;

    const MASKING_MAP = Object.fromEntries(MASKING_OPTIONS.map((o) => [o.value, o.label]));
    const same = (a, b) => (a ?? '') === (b ?? '');
    const yesNo = (v) => (v ? 'Yes' : 'No');

    fields.forEach((f) => {
      const orig = savedFields.find((sf) => sf.id && sf.id === f.id);
      if (!orig) {
        // A field added in this session: described from its own settings, whatever it is called.
        list.push({
          id: f.draftKey || f.apiField,
          title: f.displayLabel || f.apiField || 'New Field',
          type: 'added',
          badgeLabel: 'Added',
          addedDetails: {
            'Field': f.displayLabel || f.apiField,
            'Status': 'New field',
            'Type': f.fieldType || 'Text',
            'Required': yesNo(f.isRequired),
            'Visibility': f.isVisible ? 'Visible' : 'Hidden',
            ...(f.fieldType === 'Dropdown' && f.lookupTypeCode ? { 'List': f.lookupTypeCode } : {}),
            ...(f.maskingRule && f.maskingRule !== 'None' ? { 'Masking': MASKING_MAP[f.maskingRule] || f.maskingRule } : {}),
          },
        });
        return;
      }

      const props = [];
      const diff = (label, a, b) => { if (!same(a, b)) props.push({ label, oldVal: a === undefined || a === null || a === '' ? '—' : a, newVal: b === undefined || b === null || b === '' ? '—' : b }); };
      diff('Display Label', orig.displayLabel, f.displayLabel);
      diff('Field Type', orig.fieldType, f.fieldType);
      if (Number(orig.displayOrder) !== Number(f.displayOrder)) props.push({ label: 'Order', oldVal: orig.displayOrder, newVal: f.displayOrder });
      if (Boolean(orig.isVisible) !== Boolean(f.isVisible)) props.push({ label: 'Visibility', isVisibility: true, oldVal: orig.isVisible, newVal: f.isVisible });
      if (Boolean(orig.isRequired) !== Boolean(f.isRequired)) props.push({ label: 'Required', oldVal: yesNo(orig.isRequired), newVal: yesNo(f.isRequired) });
      if ((orig.maskingRule || 'None') !== (f.maskingRule || 'None')) {
        props.push({ label: 'Masking Rule', oldVal: MASKING_MAP[orig.maskingRule] || orig.maskingRule || 'No masking', newVal: MASKING_MAP[f.maskingRule] || f.maskingRule || 'No masking' });
      }
      if (Number(orig.visibleChars ?? 4) !== Number(f.visibleChars ?? 4)) props.push({ label: 'Visible Chars', oldVal: orig.visibleChars ?? 4, newVal: f.visibleChars ?? 4 });
      diff('Validation Pattern', orig.validationRegex, f.validationRegex);
      diff('Validation Message', orig.validationMessage, f.validationMessage);
      diff('Min Length', orig.minLength, f.minLength);
      diff('Max Length', orig.maxLength, f.maxLength);
      diff('Min Value', orig.minValue, f.minValue);
      diff('Max Value', orig.maxValue, f.maxValue);
      diff('List', orig.lookupTypeCode, f.lookupTypeCode);

      if (props.length > 0) {
        const onlyVisibility = props.length === 1 && props[0].isVisibility;
        list.push({
          id: f.id,
          title: f.displayLabel || orig.displayLabel || f.apiField,
          type: onlyVisibility ? 'visibility' : 'modified',
          badgeLabel: onlyVisibility ? 'Visibility Changed' : 'Modified',
          properties: props,
        });
      }
    });

    // Option changes made from a dropdown's "Manage options".
    Object.entries(lookupDrafts).forEach(([code, draft]) => {
      const stored = serverLookups[code] || [];
      draft.values.forEach((v) => {
        const orig = v.id ? stored.find((s) => s.id === v.id) : null;
        const listName = draft.name || lookupTypes.find((t) => t.code === code)?.name || code;
        if (!orig) {
          list.push({ id: `${code}:${v.value}`, title: `${listName}: ${v.label || v.value}`, type: 'added', badgeLabel: 'Added', addedDetails: { Status: 'New option', List: listName } });
          return;
        }
        const props = [];
        if (!same(orig.label, v.label)) props.push({ label: 'Label', oldVal: orig.label, newVal: v.label });
        if (Boolean(orig.isActive) !== Boolean(v.isActive)) props.push({ label: 'Status', oldVal: orig.isActive ? 'Active' : 'Inactive', newVal: v.isActive ? 'Active' : 'Inactive' });
        if (!same(orig.formatRule, v.formatRule)) props.push({ label: 'ID Format Rule', oldVal: orig.formatRule || 'Default', newVal: v.formatRule || 'Default' });
        if (!same(orig.formatRegex, v.formatRegex)) props.push({ label: 'ID Format Pattern', oldVal: orig.formatRegex || '—', newVal: v.formatRegex || '—' });
        if (props.length) list.push({ id: `${code}:${v.id}`, title: `${listName}: ${orig.label || orig.value}`, type: 'modified', badgeLabel: 'Modified', properties: props });
      });
    });

    return list;
  }, [isAssignmentTab, assignmentStatus.changes, isFieldTab, fields, savedFields, lookupDrafts, serverLookups, lookupTypes]);

  const getSectionName = useCallback(() => {
    if (topSelector === 'CaseManagement') {
      if (caseSection === 'CreateCase') return 'Create Case Form';
      if (caseSection === 'Filters') return 'Case Filters';
      if (caseSection === 'AssignReassign') return 'Assign & Reassign settings';
    } else if (topSelector === 'Customer360') {
      if (activeSection === 'AddNewCustomer') return 'Add New Customer Form';
      if (activeSection === 'ExistingCustomer') return 'Existing Customer Details';
      if (activeSection === 'Filters') return 'Customer Directory Filters';
    }
    return 'this page';
  }, [topSelector, caseSection, activeSection]);

  // Unsaved changes protection modal state
  const [unsavedModal, setUnsavedModal] = useState({
    isOpen: false,
    message: null,
    pendingAction: null,
  });

  const handleTopSelectorClick = (target) => {
    if (topSelector === target) return;
    if (hasUnsavedChanges) {
      setUnsavedModal({
        isOpen: true,
        message: `You have unsaved changes on the ${getSectionName()}. If you leave now, your changes will be lost.`,
        pendingAction: () => setTopSelector(target),
      });
    } else {
      setTopSelector(target);
    }
  };

  const handleSectionClick = (target) => {
    if (activeSection === target) return;
    if (hasUnsavedChanges) {
      setUnsavedModal({
        isOpen: true,
        message: `You have unsaved changes on the ${getSectionName()}. If you leave now, your changes will be lost.`,
        pendingAction: () => setActiveSection(target),
      });
    } else {
      setActiveSection(target);
    }
  };

  const handleCaseSectionClick = (target) => {
    if (caseSection === target) return;
    if (hasUnsavedChanges) {
      setUnsavedModal({
        isOpen: true,
        message: `You have unsaved changes on the ${getSectionName()}. If you leave now, your changes will be lost.`,
        pendingAction: () => setCaseSection(target),
      });
    } else {
      setCaseSection(target);
    }
  };

  const isLeavingRef = useRef(false);

  useEffect(() => {
    isLeavingRef.current = false;
  }, [topSelector, caseSection, activeSection]);

  const handleStayOnPage = () => {
    setUnsavedModal({ isOpen: false, message: null, pendingAction: null });
  };

  const handleLeaveWithoutSaving = () => {
    isLeavingRef.current = true;
    // Revert local changes to last saved state
    setFields(JSON.parse(JSON.stringify(savedFields)));

    const action = unsavedModal.pendingAction;
    setUnsavedModal({ isOpen: false, message: null, pendingAction: null });
    if (action) {
      action();
    }
  };

  // Intercept outer sidebar navigation links (e.g. Dashboard, Customer 360, Case Management, Audit Logs)
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleAnchorClick = (e) => {
      const link = e.target.closest('a');
      if (link) {
        const href = link.getAttribute('href');
        if (href && href !== '/configurable-settings' && href !== '/field-settings' && !href.startsWith('#')) {
          e.preventDefault();
          e.stopPropagation();
          setUnsavedModal({
            isOpen: true,
            message: `You have unsaved changes on the ${getSectionName()}. If you leave now, your changes will be lost.`,
            pendingAction: () => navigate(href),
          });
        }
      }
    };

    document.addEventListener('click', handleAnchorClick, true);
    return () => document.removeEventListener('click', handleAnchorClick, true);
  }, [hasUnsavedChanges, getSectionName, navigate]);

  // Intercept browser back/forward buttons
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    window.history.pushState({ unsavedGuard: true }, '', window.location.href);

    const handlePopState = () => {
      if (isLeavingRef.current) return;
      setUnsavedModal({
        isOpen: true,
        message: `You have unsaved changes on the ${getSectionName()}. If you leave now, your changes will be lost.`,
        pendingAction: () => {
          isLeavingRef.current = true;
          window.history.go(-2);
        },
      });
      window.history.pushState({ unsavedGuard: true }, '', window.location.href);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [hasUnsavedChanges, getSectionName]);

  // Intercept browser window refresh / reload / close tab
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // ===== CONFIRMATION DIALOG =====
  const openConfirm = (title, message, onConfirmAction, confirmLabel = 'Delete', itemDetails = null) => {
    setConfirmState({ isOpen: true, title, message, confirmLabel, isBusy: false, onConfirmAction, itemDetails });
  };

  const closeConfirm = () => setConfirmState((prev) => ({ ...prev, isOpen: false, onConfirmAction: null, itemDetails: null }));

  const handleExecuteConfirm = async () => {
    if (!confirmState.onConfirmAction) return;
    setConfirmState((prev) => ({ ...prev, isBusy: true }));
    try {
      await confirmState.onConfirmAction();
      closeConfirm();
    } catch (err) {
      // The record is left untouched and the dialog stays open so the admin can retry.
      toast.error(err?.message || 'The delete could not be completed.');
      setConfirmState((prev) => ({ ...prev, isBusy: false }));
    }
  };

  // ===== LOADERS =====
  const loadFields = useCallback(async (moduleKey, sectionKey) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [data, types] = await Promise.all([
        configurableSettingsService.getFields(moduleKey, sectionKey, true),
        configurableSettingsService.getLookupTypes().catch(() => null),   // lists a dropdown field can be bound to
      ]);
      const sorted = sortByOrder(data);
      setFields(sorted);
      setSavedFields(JSON.parse(JSON.stringify(sorted)));
      setLookupDrafts({});
      setServerLookups({});
      setFieldErrors({});
      if (types) setLookupTypes(types);
    } catch (err) {
      console.error('Failed to load field settings:', err);
      setFields([]);
      setSavedFields([]);
      setLoadError(err.message || 'Unable to load field configuration.');
      toast.error(err.message || 'Unable to load field configuration.');
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const loadDepartments = useCallback(async () => {
    try {
      const depts = await departmentService.getAllDepartments(true);
      setDepartments(depts || []);
      setDepartmentsError(null);
      return depts || [];
    } catch (err) {
      console.error('Failed to load departments:', err);
      setDepartments([]);
      setDepartmentsError(err.message || 'Unable to load departments.');
      toast.error(err.message || 'Unable to load departments.');
      return [];
    }
  }, [toast]);

  // Deliberately has no dependency on the selected department: selecting one must not
  // re-trigger a full metadata reload.
  const loadCaseMetadata = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    await loadDepartments();

    try {
      const [cts, slaList, qaList, drList, csList, ssList, lkTypes] = await Promise.all([
        configurableSettingsService.getCaseTypes(false),
        configurableSettingsService.getSeverities(),
        configurableSettingsService.getLookupValues('DASHBOARD_QUICK_ACTION', true, false),
        configurableSettingsService.getLookupValues('DASHBOARD_DATE_RANGE', true, false),
        configurableSettingsService.getLookupValues('CASE_STATUS', true, false),
        configurableSettingsService.getLookupValues('SLA_STATUS', true, false),
        configurableSettingsService.getLookupTypes().catch(() => []),
      ]);
      setCaseTypes(cts || []);
      setSeverities(slaList || []);
      setLookupTypes(lkTypes || []);
      setQuickActions(qaList || []);
      setDateRanges(drList || []);
      setCaseStatuses(csList || []);
      setSlaStatuses(ssList || []);
    } catch (err) {
      console.error('Failed to load case metadata:', err);
      setLoadError(err.message || 'Unable to load case management configuration.');
      toast.error(err.message || 'Unable to load case management configuration.');
    } finally {
      setIsLoading(false);
    }

  }, [loadDepartments, toast]);

  useEffect(() => {
    if (topSelector === 'Customer360') {
      loadFields('Customer360', activeSection);
    } else if (topSelector === 'Dashboard') {
      loadCaseMetadata();
    } else if (caseSection === 'CreateCase' || caseSection === 'Filters') {
      loadFields('CaseManagement', caseSection);
    }
    // Assign & Reassign loads its own data.
  }, [topSelector, activeSection, caseSection, loadFields, loadCaseMetadata]);

  // ===== FIELD CONFIGURATION =====
  // ===== FIELD CONFIGURATION =====
  const handleFieldChange = (index, key, value) => {
    setFields((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [key]: value };
      return updated;
    });
  };

  /** Live display-order conflicts, so the offending order boxes turn red while the administrator is still typing. */
  const liveOrderConflicts = useMemo(() => (isFieldTab ? findOrderConflicts(fields, savedFields) : {}), [isFieldTab, fields, savedFields]);

  const handleSaveAllChanges = async () => {
    if (!isFieldTab) return true;   // every other tab saves each change as it is made

    const conflicts = findOrderConflicts(fields, savedFields);
    if (Object.keys(conflicts).length > 0) {
      setFieldErrors(conflicts);
      toast.error(Object.values(conflicts)[0]);
      return false;
    }

    setIsSaving(true);
    try {
      // 1. Options first: a new dropdown's list has to exist before the field that uses it is saved.
      const draftCodes = Object.keys(lookupDrafts);
      for (const code of draftCodes) {
        const draft = lookupDrafts[code];
        await configurableSettingsService.saveLookupValues(
          code,
          draft.values.map(({ id, value, label, displayOrder, isActive }) => ({ id, value, label, displayOrder, isActive })),
          draft.name
        );
      }
      if (draftCodes.length > 0) {
        setLookupDrafts({});
        setServerLookups({});
        configurableSettingsService.getLookupTypes().then((types) => setLookupTypes(types || [])).catch(() => {});
      }

      // 2. Fields: existing ones are sent with the id the server issued; new ones carry NO id (the server generates it).
      const update = fields.filter((f) => f.id);
      const create = fields.filter((f) => !f.id).map(({ draftKey: _draftKey, apiField: _apiField, isCustomField: _custom, ...definition }) => definition);
      const result = await configurableSettingsService.saveFields(topSelector, currentSectionKey, { update, create });

      // 3. Show exactly what the server stored — not what the page assumes it stored.
      const stored = sortByOrder(result?.fields);
      setFields(stored);
      setSavedFields(JSON.parse(JSON.stringify(stored)));
      setFieldErrors({});
      toast.success('Field settings saved successfully. Changes apply immediately.');
      return true;
    } catch (err) {
      // Everything the administrator entered stays on screen so it can be corrected and saved again.
      const raw = err?.original?.response?.data?.errors;
      if (raw && typeof raw === 'object') {
        setFieldErrors(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, [].concat(v)[0]])));
      }
      toast.error(serverMessages(err));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveFields = handleSaveAllChanges;

  /**
   * The Add / Edit drawer hands over the field's settings (and, for a dropdown, any option changes). Both stay drafts until
   * the page's Save Changes, so a field and the options it needs are saved together or not at all.
   */
  const handleSubmitField = async (payload, editing, lookupDraft) => {
    if (lookupDraft) {
      setLookupDrafts((prev) => ({ ...prev, [lookupDraft.typeCode]: { name: lookupDraft.name, values: lookupDraft.values } }));
      setServerLookups((prev) => ({ ...prev, [lookupDraft.typeCode]: lookupDraft.stored || [] }));
    }

    if (editing) {
      setFields((prev) => prev.map((f) => (isSameField(f, editing) ? { ...f, ...payload } : f)));
      toast.info(`Updated "${payload.displayLabel}" in draft. Click "Save Changes" to persist.`);
      return;
    }

    // No id: a brand-new field is identified by the server once it is saved. `draftKey` only tells drafts apart on screen.
    const { sectionKey: _ignored, ...definition } = payload;
    setFields((prev) => [...prev, { draftKey: `new-${Date.now()}`, apiField: previewApiField(payload.displayLabel), isCustomField: true, ...definition }]);
    toast.info(`Added custom field "${payload.displayLabel}" to draft. Click "Save Changes" to persist.`);
  };

  // ===== MASTER LOOKUPS (shared by Customer 360, Communication Channels, and Dashboard) =====
  const refreshLookup = useCallback(async (typeCode) => {
    const updated = await configurableSettingsService.getLookupValues(typeCode, true, false);
    if (typeCode === 'DASHBOARD_QUICK_ACTION') setQuickActions(updated || []);
    if (typeCode === 'DASHBOARD_DATE_RANGE') setDateRanges(updated || []);
    if (typeCode === 'CASE_STATUS') setCaseStatuses(updated || []);
    if (typeCode === 'SLA_STATUS') setSlaStatuses(updated || []);
  }, []);


  const handleToggleVisibility = (item, typeCode, label) => {
    runPending(`toggle:${item.id}`, async () => {
      const newIsActive = !item.isActive;
      try {
        await configurableSettingsService.updateLookupValue(
          item.id,
          typeCode,
          item.value,
          item.label || item.value,
          item.displayOrder,
          newIsActive
        );
        await refreshLookup(typeCode);
        toast.success(`${label} "${item.label || item.value}" is now ${newIsActive ? 'Visible' : 'Not Visible'}.`);
      } catch (err) {
        toast.error(err.message || `Failed to update visibility for ${label.toLowerCase()}.`);
      }
    });
  };


  const handleUpdateLookup = async (item, typeCode, values, label) => {
    const newText = (values.label || values.value || '').trim();
    if (!newText) {
      toast.error(`${label} name cannot be empty.`);
      throw new Error('empty');
    }

    if (['PREFERRED_LANGUAGE', 'HOME_BRANCH', 'ID_TYPE'].includes(typeCode)) {
      const updateList = (prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, value: newText, label: newText } : i));
      if (typeCode === 'PREFERRED_LANGUAGE') setLanguages(updateList);
      if (typeCode === 'HOME_BRANCH') setBranches(updateList);
      if (typeCode === 'ID_TYPE') setIdTypes(updateList);
      toast.info(`Updated ${label} to "${newText}" (Draft). Click "Save Changes" to persist.`);
      return;
    }

    try {
      const valueToSave = (typeCode === 'DASHBOARD_QUICK_ACTION' || typeCode === 'DASHBOARD_DATE_RANGE')
        ? item.value
        : newText;
      const labelToSave = newText;
      await configurableSettingsService.updateLookupValue(item.id, typeCode, valueToSave, labelToSave, item.displayOrder, item.isActive);
      await refreshLookup(typeCode);
      toast.success(`${label} updated to "${labelToSave}".`);
    } catch (err) {
      toast.error(err.message || `Failed to update ${label.toLowerCase()}.`);
      throw err;
    }
  };


  // ===== DEPARTMENTS =====

  const handleUpdateDepartment = async (dept, values) => {
    const name = (values.name || '').trim();
    const code = (values.code || '').trim().toUpperCase();
    if (!name || !code) {
      toast.error('Department name and code are both required.');
      throw new Error('invalid');
    }
    try {
      await departmentService.updateDepartment(dept.id, { name, code, isActive: dept.isActive });
      await loadDepartments();
      toast.success(`Department updated to "${name}".`);
    } catch (err) {
      toast.error(err.message || 'Failed to update department.');
      throw err;
    }
  };

  const handleToggleDepartmentVisibility = (dept) => {
    runPending(`toggle:dept:${dept.id}`, async () => {
      const newActive = !dept.isActive;
      try {
        await departmentService.updateDepartment(dept.id, {
          name: dept.name,
          code: dept.code,
          isActive: newActive,
        });
        await loadDepartments();
        toast.success(`Department "${dept.name}" is now ${newActive ? 'Visible' : 'Not Visible'}.`);
      } catch (err) {
        toast.error(err.message || 'Failed to update visibility for department.');
      }
    });
  };

  const handleDeleteDepartment = (dept) => {
    openConfirm(
      'Delete Department',
      `Are you sure you want to delete "${dept.name}"? Its sub-categories and escalation templates will be removed too. This action cannot be undone.`,
      async () => {
        await departmentService.deleteDepartment(dept.id);
        await loadCaseMetadata();
        toast.success(`Department "${dept.name}" deleted successfully.`);
      },
      'Delete',
      {
        name: dept.name,
        code: dept.code,
        type: 'Department',
        impactNote: 'Sub-categories and escalation templates assigned to this department will also be deleted.',
      }
    );
  };

  // ===== CASE TYPES =====

  const handleUpdateCaseType = async (item, values) => {
    const code = (values.code || '').trim();
    const name = (values.name || '').trim();
    const prefix = (values.prefix || '').trim().toUpperCase();
    if (!code || !name || !prefix) {
      toast.error('Code, Name and Prefix are all required.');
      throw new Error('invalid');
    }
    try {
      await configurableSettingsService.updateCaseType(item.id, {
        code,
        name,
        prefix,
        displayOrder: item.displayOrder,
        isActive: item.isActive,
      });
      setCaseTypes(await configurableSettingsService.getCaseTypes(false));
      toast.success(`Case Type updated to "${name}".`);
    } catch (err) {
      toast.error(err.message || 'Failed to update Case Type.');
      throw err;
    }
  };

  const handleToggleCaseTypeVisibility = (item) => {
    runPending(`toggle:casetype:${item.id}`, async () => {
      const newActive = !item.isActive;
      try {
        await configurableSettingsService.updateCaseType(item.id, {
          code: item.code,
          name: item.name,
          prefix: item.prefix,
          displayOrder: item.displayOrder,
          isActive: newActive,
        });
        setCaseTypes(await configurableSettingsService.getCaseTypes(false));
        toast.success(`Case Type "${item.name}" is now ${newActive ? 'Visible' : 'Not Visible'}.`);
      } catch (err) {
        toast.error(err.message || 'Failed to update visibility for Case Type.');
      }
    });
  };

  const handleDeleteCaseType = (item) => {
    openConfirm(
      'Delete Case Type',
      `Are you sure you want to delete Case Type "${item.name}"? This action cannot be undone.`,
      async () => {
        await configurableSettingsService.deleteCaseType(item.id);
        setCaseTypes(await configurableSettingsService.getCaseTypes(false));
        toast.success(`Case Type "${item.name}" deleted successfully.`);
      },
      'Delete',
      {
        name: item.name,
        code: item.code,
        prefix: item.prefix,
        type: 'Case Type Configuration',
      }
    );
  };

  // ===== SUB-CATEGORIES =====




  // ===== SEVERITIES (master data + SLA rows are written together by the API) =====
  const refreshSeverities = useCallback(async () => {
    const list = await configurableSettingsService.getSeverities();
    setSeverities(list || []);
    return list || [];
  }, []);


  const handleUpdateSeverity = async (item, values) => {
    const name = (values.name || '').trim();
    if (!name) {
      toast.error('Severity name cannot be empty.');
      throw new Error('invalid');
    }
    try {
      await configurableSettingsService.updateSeverity(item.id, name, item.displayOrder, item.isActive);
      await refreshSeverities();
      toast.success(`Severity updated to "${name}".`);
    } catch (err) {
      toast.error(err.message || 'Failed to update severity.');
      throw err;
    }
  };

  const handleToggleSeverityVisibility = (item) => {
    runPending(`toggle:severity:${item.id}`, async () => {
      const newActive = !item.isActive;
      try {
        await configurableSettingsService.updateSeverity(item.id, item.name, item.displayOrder, newActive);
        await refreshSeverities();
        toast.success(`Severity "${item.name}" is now ${newActive ? 'Visible' : 'Not Visible'}.`);
      } catch (err) {
        toast.error(err.message || 'Failed to update visibility for Severity.');
      }
    });
  };

  const handleDeleteSeverity = (item) => {
    openConfirm(
      'Delete Severity',
      item.casesUsing > 0
        ? `"${item.name}" is used by ${item.casesUsing} case(s) and cannot be deleted until those cases move to another severity.`
        : `Are you sure you want to delete severity "${item.name}"? Its SLA configuration will be removed too. This action cannot be undone.`,
      async () => {
        await configurableSettingsService.deleteSeverity(item.id);
        await refreshSeverities();
        toast.success(`Severity "${item.name}" deleted successfully.`);
      },
      'Delete',
      {
        name: item.name,
        type: 'Severity Level',
        slaHours: `${item.internalHours}h internal / ${item.externalHours}h external`,
        casesUsing: item.casesUsing > 0 ? `${item.casesUsing} active case(s)` : null,
      }
    );
  };

  // "Save changes" in the unsaved-changes dialog: save what this section edits; the dialog then carries on (or, on failure,
  // returns to the page with the edits and the error).
  const handleSaveFromDialog = () => (isAssignmentTab ? assignmentTabRef.current?.save() : handleSaveAllChanges());

  const handleProceedAfterSave = () => {
    isLeavingRef.current = true;
    const action = unsavedModal.pendingAction;
    setUnsavedModal({ isOpen: false, message: null, pendingAction: null });
    action?.();
  };

  // ===== RENDER HELPERS =====
  const renderListState = (isEmpty, emptyText) => {
    if (isLoading) return <div className="master-card__loading"><Loader size="sm" /> <span>Loading…</span></div>;
    if (loadError) {
      return (
        <div className="master-card__error">
          <AlertCircle size={14} /> {loadError}
        </div>
      );
    }
    if (isEmpty) return <div className="master-card__empty">{emptyText}</div>;
    return null;
  };


  const renderFieldTable = (showAddButton = true) => (
    <div className="table-responsive">
      <table className="field-table">
        <thead>
          <tr>
            <th>API FIELD</th>
            <th>DISPLAY LABEL</th>
            <th style={{ width: 80, textAlign: 'center' }}>ORDER</th>
            <th style={{ width: 70, textAlign: 'center' }}>VISIBLE</th>
            <th style={{ width: 80, textAlign: 'center' }}>REQUIRED</th>
            {!isFilterSection && <th>MASKING RULE</th>}
            {!isFilterSection && <th style={{ width: 100, textAlign: 'center' }}>VISIBLE CHARS</th>}
            <th style={{ width: 110, textAlign: 'center' }}>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {fields.length === 0 ? (
            <tr>
              <td colSpan={8}>
                <div className="master-card__empty">
                  {loadError || (showAddButton ? 'No fields configured for this section yet. Use “ADD NEW FIELD” to create one.' : 'No fields configured for this section yet.')}
                </div>
              </td>
            </tr>
          ) : (
            fields.map((f, i) => (
              <tr key={fieldKey(f)}>
                <td className="cell-api-field">
                  <code>{f.apiField}</code>
                  {f.isCustomField && <span className="custom-badge">CUSTOM</span>}
                </td>
                <td>
                  <input
                    type="text"
                    className="input-cell-label"
                    value={f.displayLabel}
                    onChange={(e) => handleFieldChange(i, 'displayLabel', e.target.value)}
                  />
                  {(fieldErrors[fieldKey(f)] || fieldErrors[f.apiField] || fieldErrors[f.displayLabel]) && (
                    <span className="field-order-error" role="alert">{fieldErrors[fieldKey(f)] || fieldErrors[f.apiField] || fieldErrors[f.displayLabel]}</span>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="number"
                    min={0}
                    className={`input-cell-order ${liveOrderConflicts[fieldKey(f)] ? 'input-cell-order--conflict' : ''}`}
                    value={f.displayOrder}
                    title={liveOrderConflicts[fieldKey(f)]}
                    aria-invalid={Boolean(liveOrderConflicts[fieldKey(f)])}
                    onChange={(e) => handleFieldChange(i, 'displayOrder', parseInt(e.target.value, 10) || 0)}
                  />
                  {liveOrderConflicts[fieldKey(f)] && <span className="field-order-error" role="alert">Already used</span>}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <button
                    className={`btn-toggle-eye ${f.isVisible ? 'btn-toggle-eye--active' : ''}`}
                    onClick={() => handleFieldChange(i, 'isVisible', !f.isVisible)}
                    title={f.isVisible ? 'Visible' : 'Hidden'}
                  >
                    {f.isVisible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    className="checkbox-custom"
                    checked={f.isRequired || f.isSystemRequired}
                    disabled={f.isSystemRequired}
                    title={f.isSystemRequired ? 'Required by the system: a case or customer cannot be created without it' : undefined}
                    onChange={(e) => handleFieldChange(i, 'isRequired', e.target.checked)}
                  />
                </td>
                {!isFilterSection && (
                  <>
                <td>
                  <select
                    className="input-cell-masking"
                    value={f.maskingRule || 'None'}
                    onChange={(e) => handleFieldChange(i, 'maskingRule', e.target.value)}
                  >
                    {MASKING_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="number"
                    min={0}
                    className="input-cell-chars"
                    value={f.visibleChars ?? 4}
                    onChange={(e) => handleFieldChange(i, 'visibleChars', parseInt(e.target.value, 10) || 0)}
                  />
                </td>
                  </>
                )}
                <td>
                  <div className="field-table__actions">
                    <button
                      className="btn-icon-neutral"
                      onClick={() => {
                        setEditingField(f);
                        setIsFieldDrawerOpen(true);
                      }}
                      title={`Edit ${f.displayLabel || f.apiField}`}
                      aria-label="Edit field"
                                          >
                      <Pencil size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  const renderFieldCard = (title, showAddButton = true) => (
    <div className="config-card">
      <div className="config-card__header">
        <div>
          <h2 className="config-card__title">{title}</h2>
          <p className="config-card__desc">
            Configure label, visibility, requirement, order, and masking per field.
            Use Edit for the full field definition, or Save Changes for inline edits.
          </p>
        </div>

        {showAddButton && (
          <Button
            variant="primary"
            leftIcon={<Plus size={15} />}
            onClick={() => {
              setEditingField(null);
              setIsFieldDrawerOpen(true);
            }}
            id="btn-add-new-field"
          >
            ADD NEW FIELD
          </Button>
        )}
      </div>

      {isLoading ? <div className="config-card__loading"><Loader /></div> : renderFieldTable(showAddButton)}
    </div>
  );


  const renderDashboardConfig = () => {
    const filteredQuickActions = quickActions.filter((qa) =>
      (qa.label || qa.value || '').toLowerCase().includes(dashQaSearch.toLowerCase())
    );

    const filteredDateRanges = dateRanges.filter((dr) =>
      (dr.label || dr.value || '').toLowerCase().includes(dashDateRangeSearch.toLowerCase())
    );

    const filteredDepartments = departments.filter((d) =>
      (d.name || '').toLowerCase().includes(dashDeptSearch.toLowerCase()) ||
      (d.code || '').toLowerCase().includes(dashDeptSearch.toLowerCase())
    );

    const filteredCaseStatuses = caseStatuses.filter((st) =>
      (st.label || st.value || '').toLowerCase().includes(dashStatusSearch.toLowerCase())
    );

    const filteredCaseTypes = caseTypes.filter((ct) =>
      (ct.name || ct.code || '').toLowerCase().includes(dashCaseTypeSearch.toLowerCase())
    );

    const filteredSeverities = severities.filter((sev) =>
      (sev.name || '').toLowerCase().includes(dashSeveritySearch.toLowerCase())
    );

    const filteredSlaStatuses = slaStatuses.filter((sla) =>
      (sla.label || sla.value || '').toLowerCase().includes(dashSlaStatusSearch.toLowerCase())
    );

    return (
      <div className="config-settings-body">
        <div className="master-data-grid">
          {/* 1. DASHBOARD QUICK ACTIONS */}
          <div className="master-card">
            <div>
              <h3 className="master-card__title">Dashboard Quick Actions</h3>
              <p className="master-card__desc">
                Manage action items displayed in the Dashboard header Quick Actions dropdown menu.
              </p>
            </div>
            <div className="master-card__form">
              <div className="master-card__input-row">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search quick actions..."
                  value={dashQaSearch}
                  onChange={(e) => setDashQaSearch(e.target.value)}
                  id="input-dash-search-qa"
                />
              </div>
            </div>
            <div className="master-card__list scrollbar-thin">
              {renderListState(filteredQuickActions.length === 0, 'No matching quick actions found.') ||
                filteredQuickActions.map((item) => (
                  <MasterItem
                    key={item.id}
                    fields={[{ key: 'value', placeholder: 'Quick Action Label' }]}
                    initial={{ value: item.label || item.value }}
                    onSave={(values) => handleUpdateLookup(item, 'DASHBOARD_QUICK_ACTION', values, 'Quick Action')}
                    showDelete={false}
                    showVisibility={true}
                    isVisible={item.isActive !== false}
                    onToggleVisibility={() => handleToggleVisibility(item, 'DASHBOARD_QUICK_ACTION', 'Quick Action')}
                    isTogglingVisibility={isPending(`toggle:${item.id}`)}
                  >
                    <span className="master-card__item-title">{item.label || item.value}</span>
                  </MasterItem>
                ))}
            </div>
          </div>

          {/* 2. DATE & TIME FILTER OPTIONS */}
          <div className="master-card">
            <div>
              <h3 className="master-card__title">Date &amp; Time Filter Options</h3>
              <p className="master-card__desc">
                Manage preset date filter options in the Dashboard header date picker popover.
              </p>
            </div>
            <div className="master-card__form">
              <div className="master-card__input-row">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search date presets (e.g. Month)..."
                  value={dashDateRangeSearch}
                  onChange={(e) => setDashDateRangeSearch(e.target.value)}
                  id="input-dash-search-dr"
                />
              </div>
            </div>
            <div className="master-card__list scrollbar-thin">
              {renderListState(filteredDateRanges.length === 0, 'No matching date options found.') ||
                filteredDateRanges.map((item) => (
                  <MasterItem
                    key={item.id}
                    fields={[{ key: 'value', placeholder: 'Date Option Label' }]}
                    initial={{ value: item.label || item.value }}
                    onSave={(values) => handleUpdateLookup(item, 'DASHBOARD_DATE_RANGE', values, 'Date Range Option')}
                    showDelete={false}
                    showVisibility={true}
                    isVisible={item.isActive !== false}
                    onToggleVisibility={() => handleToggleVisibility(item, 'DASHBOARD_DATE_RANGE', 'Date Range Option')}
                    isTogglingVisibility={isPending(`toggle:${item.id}`)}
                  >
                    <span className="master-card__item-title">{item.label || item.value}</span>
                  </MasterItem>
                ))}
            </div>
          </div>

          {/* 3. ALL DEPARTMENTS FILTER */}
          <div className="master-card">
            <div>
              <h3 className="master-card__title"><Building2 size={15} /> All Departments Filter</h3>
              <p className="master-card__desc">
                Departments available in the Dashboard "All Departments" filter dropdown.
              </p>
            </div>
            <div className="master-card__form">
              <div className="master-card__input-row">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search departments..."
                  value={dashDeptSearch}
                  onChange={(e) => setDashDeptSearch(e.target.value)}
                  id="input-dash-search-dept"
                />
              </div>
            </div>
            <div className="master-card__list scrollbar-thin">
              {isLoading ? (
                <div className="master-card__loading"><Loader size="sm" /> <span>Loading…</span></div>
              ) : departmentsError ? (
                <div className="master-card__error"><AlertCircle size={14} /> {departmentsError}</div>
              ) : filteredDepartments.length === 0 ? (
                <div className="master-card__empty">No matching departments found.</div>
              ) : (
                filteredDepartments.map((d) => (
                  <MasterItem
                    key={d.id}
                    fields={[{ key: 'name', placeholder: 'Department name' }]}
                    initial={{ name: d.name }}
                    onSave={(values) => handleUpdateDepartment(d, { name: values.name, code: d.code, isActive: d.isActive })}
                    showDelete={false}
                    showVisibility={true}
                    isVisible={d.isActive !== false}
                    onToggleVisibility={() => handleToggleDepartmentVisibility(d)}
                    isTogglingVisibility={isPending(`toggle:dept:${d.id}`)}
                  >
                    <span className="master-card__item-title">{d.name}</span>
                  </MasterItem>
                ))
              )}
            </div>
          </div>

          {/* 4. ALL STATUSES FILTER */}
          <div className="master-card">
            <div>
              <h3 className="master-card__title">All Statuses Filter</h3>
              <p className="master-card__desc">
                Status options available in the Dashboard "All Statuses" filter dropdown.
              </p>
            </div>
            <div className="master-card__form">
              <div className="master-card__input-row">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search statuses (e.g. Open, Closed)..."
                  value={dashStatusSearch}
                  onChange={(e) => setDashStatusSearch(e.target.value)}
                  id="input-dash-search-status"
                />
              </div>
            </div>
            <div className="master-card__list scrollbar-thin">
              {renderListState(filteredCaseStatuses.length === 0, 'No matching case statuses found.') ||
                filteredCaseStatuses.map((item) => (
                  <MasterItem
                    key={item.id}
                    fields={[{ key: 'value', placeholder: 'Case Status Label' }]}
                    initial={{ value: item.label || item.value }}
                    onSave={(values) => handleUpdateLookup(item, 'CASE_STATUS', values, 'Case Status')}
                    showDelete={false}
                    showVisibility={true}
                    isVisible={item.isActive !== false}
                    onToggleVisibility={() => handleToggleVisibility(item, 'CASE_STATUS', 'Case Status')}
                    isTogglingVisibility={isPending(`toggle:${item.id}`)}
                  >
                    <span className="master-card__item-title">{item.label || item.value}</span>
                  </MasterItem>
                ))}
            </div>
          </div>

          {/* 5. ALL CASE TYPES FILTER */}
          <div className="master-card">
            <div>
              <h3 className="master-card__title">All Case Types Filter</h3>
              <p className="master-card__desc">
                Case Types available in the Dashboard "All Case Types" filter dropdown.
              </p>
            </div>
            <div className="master-card__form">
              <div className="master-card__input-row">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search case types (e.g. Complaint)..."
                  value={dashCaseTypeSearch}
                  onChange={(e) => setDashCaseTypeSearch(e.target.value)}
                  id="input-dash-search-casetype"
                />
              </div>
            </div>
            <div className="master-card__list scrollbar-thin">
              {renderListState(filteredCaseTypes.length === 0, 'No matching case types found.') ||
                filteredCaseTypes.map((c) => (
                  <MasterItem
                    key={c.id}
                    fields={[
                      { key: 'name', placeholder: 'Name' },
                      { key: 'prefix', placeholder: 'Prefix', width: 90 },
                    ]}
                    initial={{ name: c.name, prefix: c.prefix }}
                    onSave={(values) => handleUpdateCaseType(c, { ...c, name: values.name, prefix: values.prefix })}
                    showDelete={false}
                    showVisibility={true}
                    isVisible={c.isActive !== false}
                    onToggleVisibility={() => handleToggleCaseTypeVisibility(c)}
                    isTogglingVisibility={isPending(`toggle:casetype:${c.id}`)}
                  >
                    <span className="master-card__item-title">{c.name}</span>
                    <span className="prefix-badge">Prefix: {c.prefix}</span>
                  </MasterItem>
                ))}
            </div>
          </div>

          {/* 6. ALL SEVERITIES FILTER */}
          <div className="master-card">
            <div>
              <h3 className="master-card__title"><ShieldAlert size={15} /> All Severities Filter</h3>
              <p className="master-card__desc">
                Severity levels available in the Dashboard "All Severities" filter dropdown.
              </p>
            </div>
            <div className="master-card__form">
              <div className="master-card__input-row">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search severities (e.g. Critical, Low)..."
                  value={dashSeveritySearch}
                  onChange={(e) => setDashSeveritySearch(e.target.value)}
                  id="input-dash-search-severity"
                />
              </div>
            </div>
            <div className="master-card__list scrollbar-thin">
              {renderListState(filteredSeverities.length === 0, 'No matching severities found.') ||
                filteredSeverities.map((s) => (
                  <MasterItem
                    key={s.id}
                    fields={[{ key: 'name', placeholder: 'Severity name' }]}
                    initial={{ name: s.name }}
                    onSave={(values) => handleUpdateSeverity(s, values)}
                    showDelete={false}
                    showVisibility={true}
                    isVisible={s.isActive !== false}
                    onToggleVisibility={() => handleToggleSeverityVisibility(s)}
                    isTogglingVisibility={isPending(`toggle:severity:${s.id}`)}
                  >
                    <span
                      className="severity-pill-badge"
                      style={{
                        backgroundColor: (SEVERITY_BADGES[s.name] || SEVERITY_BADGE_FALLBACK).bg,
                        color: (SEVERITY_BADGES[s.name] || SEVERITY_BADGE_FALLBACK).text,
                        borderColor: (SEVERITY_BADGES[s.name] || SEVERITY_BADGE_FALLBACK).border,
                      }}
                    >
                      {s.name}
                    </span>
                    <span className="master-card__item-meta">
                      {s.internalHours}h / {s.externalHours}h
                    </span>
                  </MasterItem>
                ))}
            </div>
          </div>

          {/* 7. ALL SLA STATUSES FILTER */}
          <div className="master-card">
            <div>
              <h3 className="master-card__title">All SLA Statuses Filter</h3>
              <p className="master-card__desc">
                SLA status options available in the Dashboard "All SLA Statuses" filter dropdown.
              </p>
            </div>
            <div className="master-card__form">
              <div className="master-card__input-row">
                <input
                  type="text"
                  className="input-field"
                  placeholder="Search SLA statuses (e.g. Within SLA)..."
                  value={dashSlaStatusSearch}
                  onChange={(e) => setDashSlaStatusSearch(e.target.value)}
                  id="input-dash-search-slastatus"
                />
              </div>
            </div>
            <div className="master-card__list scrollbar-thin">
              {renderListState(filteredSlaStatuses.length === 0, 'No matching SLA statuses found.') ||
                filteredSlaStatuses.map((item) => (
                  <MasterItem
                    key={item.id}
                    fields={[{ key: 'value', placeholder: 'SLA Status Label' }]}
                    initial={{ value: item.label || item.value }}
                    onSave={(values) => handleUpdateLookup(item, 'SLA_STATUS', values, 'SLA Status')}
                    showDelete={false}
                    showVisibility={true}
                    isVisible={item.isActive !== false}
                    onToggleVisibility={() => handleToggleVisibility(item, 'SLA_STATUS', 'SLA Status')}
                    isTogglingVisibility={isPending(`toggle:${item.id}`)}
                  >
                    <span className="master-card__item-title">{item.label || item.value}</span>
                  </MasterItem>
                ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const showHeaderSave = isFieldTab;

  return (
    <div className="config-settings-page scrollbar-thin">
      {/* 1. HEADER BANNER */}
      <div className="config-settings-page__header">
        <div className="config-settings-banner">
          <div className="config-settings-banner__left">
            <div className="config-settings-banner__icon-box">
              <Settings size={24} color="#ffffff" />
            </div>
            <div>
              <div className="config-settings-banner__badge">
                <Sparkles size={11} /> Admin &middot; System Settings
              </div>
              <h1 className="config-settings-banner__title">Configurable Settings</h1>
              <p className="config-settings-banner__subtitle">
                Configure labels, visibility, requirements, order, masking, SLA, and master lookups per module.
              </p>
            </div>
          </div>

          {isAssignmentTab ? (
            <span className="config-settings-banner__note">
              <Save size={13} />
              Review, then save with the bar at the bottom of this tab
            </span>
          ) : showHeaderSave ? (
            <button
              className="btn-save-changes"
              onClick={handleSaveFields}
              disabled={isSaving || isLoading}
              id="btn-save-field-changes"
            >
              <Save size={15} />
              <span>{isSaving ? 'Saving…' : 'Save Changes'}</span>
            </button>
          ) : (
            <span className="config-settings-banner__note">
              <CheckCircle2 size={13} />
              Every change on this tab saves immediately
            </span>
          )}
        </div>
      </div>

      {/* 2. TOP LEVEL SELECTOR */}
      <div className="top-selector-wrapper">
        <div className="top-selector-card">
          <div className="top-level-selector">
            <button
              className={`top-level-btn ${topSelector === 'Dashboard' ? 'top-level-btn--active' : ''}`}
              onClick={() => handleTopSelectorClick('Dashboard')}
              id="btn-top-selector-dashboard"
            >
              Dashboard
            </button>
            <button
              className={`top-level-btn ${topSelector === 'Customer360' ? 'top-level-btn--active' : ''}`}
              onClick={() => handleTopSelectorClick('Customer360')}
              id="btn-top-selector-c360"
            >
              Customer 360
            </button>
            <button
              className={`top-level-btn ${topSelector === 'CaseManagement' ? 'top-level-btn--active' : ''}`}
              onClick={() => handleTopSelectorClick('CaseManagement')}
              id="btn-top-selector-case"
            >
              Case Management
            </button>
          </div>
        </div>
      </div>

      {topSelector === 'Dashboard' ? (
        renderDashboardConfig()
      ) : topSelector === 'CaseManagement' ? (
        <>
          <div className="config-section-nav">
            <button className={`config-section-tab ${caseSection === 'CreateCase' ? 'config-section-tab--active' : ''}`} onClick={() => handleCaseSectionClick('CreateCase')} id="tab-case-create">Create Case Form</button>
            <button className={`config-section-tab ${caseSection === 'Filters' ? 'config-section-tab--active' : ''}`} onClick={() => handleCaseSectionClick('Filters')} id="tab-case-filters">Case Filters</button>
            <button className={`config-section-tab ${caseSection === 'AssignReassign' ? 'config-section-tab--active' : ''}`} onClick={() => handleCaseSectionClick('AssignReassign')} id="tab-case-assign-reassign">Assign &amp; Reassign</button>
          </div>

          <div className="config-settings-body">
            {caseSection === 'AssignReassign' ? (
              <AssignmentSettingsTab ref={assignmentTabRef} onDirtyChange={handleAssignmentDirtyChange} />
            ) : (
              renderFieldCard(
                caseSection === 'CreateCase' ? 'Create Case Field Settings' : 'Case Directory Filter Settings',
                caseSection !== 'Filters'
              )
            )}
          </div>
        </>
      ) : (
        <>
          <div className="config-section-nav">
            <button className={`config-section-tab ${activeSection === 'AddNewCustomer' ? 'config-section-tab--active' : ''}`} onClick={() => handleSectionClick('AddNewCustomer')} id="tab-add-new-customer">Add New Customer</button>
            <button className={`config-section-tab ${activeSection === 'ExistingCustomer' ? 'config-section-tab--active' : ''}`} onClick={() => handleSectionClick('ExistingCustomer')} id="tab-existing-customer">Existing Customer</button>
            <button className={`config-section-tab ${activeSection === 'Filters' ? 'config-section-tab--active' : ''}`} onClick={() => handleSectionClick('Filters')} id="tab-c360-filters">Customer 360 Filters</button>
          </div>

          <div className="config-settings-body">
            {renderFieldCard(
              activeSection === 'AddNewCustomer'
                ? 'Add New Customer Field Settings'
                : activeSection === 'ExistingCustomer'
                  ? 'Existing Customer Search Settings'
                  : 'Customer 360 Filter Settings',
              activeSection !== 'Filters'
            )}
          </div>
        </>
      )}

      {/* ADD / EDIT FIELD SIDE DRAWER */}
      <FieldEditorDrawer
        isOpen={isFieldDrawerOpen}
        onClose={() => {
          setIsFieldDrawerOpen(false);
          setEditingField(null);
        }}
        onAdd={handleSubmitField}
        editingField={editingField}
        sectionKey={currentSectionKey}
        existingFields={fields}
        savedFields={savedFields}
        lookupTypes={lookupTypes}
        lookupDrafts={lookupDrafts}
      />

      {/* SHARED CONFIRMATION DIALOG (never a browser confirm) */}
      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        isBusy={confirmState.isBusy}
        itemDetails={confirmState.itemDetails}
        onCancel={closeConfirm}
        onConfirm={handleExecuteConfirm}
      />

      {/* CENTERED UNSAVED CHANGES CONFIRMATION MODAL WITH CHANGES SUMMARY */}
      <UnsavedChangesDialog
        isOpen={unsavedModal.isOpen}
        subject="configuration"
        itemName={getSectionName()}
        changes={unsavedChangesList}
        onContinue={handleStayOnPage}
        onDiscard={handleLeaveWithoutSaving}
        onSave={handleSaveFromDialog}
        onSaved={handleProceedAfterSave}
      />
    </div>
  );
}

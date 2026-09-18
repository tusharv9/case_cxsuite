import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Save,
  Plus,
  Eye,
  EyeOff,
  Trash2,
  Pencil,
  Sparkles,
  Clock,
  FileText,
  CheckCircle2,
  AlertCircle,
  Building2,
  ShieldAlert,
  Bell,
  Sliders,
  Filter,
  Search,
  ChevronDown,
} from 'lucide-react';
import { Button } from '../../components/common/Button/Button.jsx';
import { Loader } from '../../components/common/Loader/Loader.jsx';
import { Input, Select, Textarea } from '../../components/common/Input/Input.jsx';
import { configurableSettingsService } from '../../services/configurableSettingsService.js';
import { departmentService } from '../../services/departmentService.js';
import { useToast } from '../../hooks/useToast.js';
import { AddFieldModal } from './AddFieldModal.jsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog/ConfirmDialog.jsx';
import { Modal } from '../../components/common/Modal/Modal.jsx';
import { MasterItem } from './MasterItem.jsx';
import { UnsavedChangesModal } from './UnsavedChangesModal.jsx';
import './ConfigurableSettingsPage.css';

const MASKING_OPTIONS = [
  { value: 'None', label: 'No masking' },
  { value: 'FullMask', label: 'Full mask' },
  { value: 'HideMiddle', label: 'Hide Middle, Show Ends' },
  { value: 'HideFirstShowLast', label: 'Hide first, show last' },
];

const ESCALATION_REASONS = [
  'SLA Breach',
  'Customer Complaint Repeat',
  'Regulatory / BNM',
  'Sharia Concern',
  'Fraud Risk',
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

const DEFAULT_TEMPLATE_SUBJECT = '[Escalation Required] Case {caseNumber} - {severity} Priority';
const DEFAULT_TEMPLATE_BODY = `Dear {departmentName} Team,

This is to notify you that Case {caseNumber} for customer {customerName} has been escalated and requires your attention.

Case Details
------------------------------
Case Number: {caseNumber}
Customer Name: {customerName}
Severity: {severity}
Target Department: {departmentName}
------------------------------

Please review the case details and take the necessary action at the earliest opportunity.

If additional information is required, please refer to the case record in the Case Management system.

Regards,
Omni Suite
Customer Experience Team`;

/** Tabs whose contents are a field-configuration table saved by the header Save button. */
const FIELD_SECTIONS = ['AddNewCustomer', 'ExistingCustomer', 'Filters', 'CreateCase'];

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

  // Notification Rules state
  const [notificationRules, setNotificationRules] = useState([]);
  const [isLoadingRules, setIsLoadingRules] = useState(false);

  const loadNotificationRules = useCallback(async () => {
    setIsLoadingRules(true);
    try {
      const data = await configurableSettingsService.getNotificationRules();
      setNotificationRules(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load notification rules:', err);
    } finally {
      setIsLoadingRules(false);
    }
  }, []);

  const handleToggleRule = async (ruleId) => {
    try {
      const updated = await configurableSettingsService.toggleNotificationRule(ruleId);
      setNotificationRules((prev) => prev.map((r) => (r.id === ruleId ? updated : r)));
      toast.success(`Rule '${updated.name}' is now ${updated.isEnabled ? 'Active' : 'Disabled'}`);
    } catch (err) {
      toast.error('Failed to toggle notification rule');
    }
  };

  const handleSaveRule = async (ruleId, formData) => {
    try {
      const updated = await configurableSettingsService.updateNotificationRule(ruleId, formData);
      setNotificationRules((prev) => prev.map((r) => (r.id === ruleId ? updated : r)));
      toast.success(`Notification rule '${updated.name}' updated successfully!`);
    } catch (err) {
      toast.error('Failed to update notification rule');
    }
  };

  // Add / Edit field drawer
  const [isFieldDrawerOpen, setIsFieldDrawerOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);

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
  const [languages, setLanguages] = useState([]);
  const [savedLanguages, setSavedLanguages] = useState([]);
  const [branches, setBranches] = useState([]);
  const [savedBranches, setSavedBranches] = useState([]);
  const [idTypes, setIdTypes] = useState([]);
  const [savedIdTypes, setSavedIdTypes] = useState([]);
  const [langSearch, setLangSearch] = useState('');
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState('');
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);


  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.smart-dropdown-wrapper')) {
        setIsLangDropdownOpen(false);
        setIsBranchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Case Management master data
  const [caseTypes, setCaseTypes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentsError, setDepartmentsError] = useState(null);
  const [subCategories, setSubCategories] = useState([]);
  const [severities, setSeverities] = useState([]);
  const [channels, setChannels] = useState([]);
  const [escalationTemplates, setEscalationTemplates] = useState([]);
  const [quickActions, setQuickActions] = useState([]);
  const [dateRanges, setDateRanges] = useState([]);
  const [caseStatuses, setCaseStatuses] = useState([]);
  const [slaStatuses, setSlaStatuses] = useState([]);

  // Inputs
  const [newCaseTypeCode, setNewCaseTypeCode] = useState('');
  const [newCaseTypeName, setNewCaseTypeName] = useState('');
  const [newCaseTypePrefix, setNewCaseTypePrefix] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');
  const [selectedDeptForSub, setSelectedDeptForSub] = useState('');
  const [newSubCategoryName, setNewSubCategoryName] = useState('');
  const [newChannelInput, setNewChannelInput] = useState('');
  const [newQuickActionInput, setNewQuickActionInput] = useState('');
  const [newDateRangeInput, setNewDateRangeInput] = useState('');
  const [newCaseStatusInput, setNewCaseStatusInput] = useState('');
  const [newSlaStatusInput, setNewSlaStatusInput] = useState('');
  const [newSeverityName, setNewSeverityName] = useState('');
  const [newSeverityInternal, setNewSeverityInternal] = useState('22');
  const [newSeverityExternal, setNewSeverityExternal] = useState('24');

  // Dashboard Search States (SEARCH = YES, ADD = NO for fixed categories)
  const [dashQaSearch, setDashQaSearch] = useState('');
  const [dashDateRangeSearch, setDashDateRangeSearch] = useState('');
  const [dashDeptSearch, setDashDeptSearch] = useState('');
  const [dashStatusSearch, setDashStatusSearch] = useState('');
  const [dashCaseTypeSearch, setDashCaseTypeSearch] = useState('');
  const [dashSeveritySearch, setDashSeveritySearch] = useState('');
  const [dashSlaStatusSearch, setDashSlaStatusSearch] = useState('');

  // SLA drafts keyed by severity name so the inputs stay controlled and only changed rows save
  const [slaDrafts, setSlaDrafts] = useState({});
  const [isSavingSla, setIsSavingSla] = useState(false);

  // Escalation template form
  const [selectedDeptForTemplate, setSelectedDeptForTemplate] = useState('');
  const [selectedReasonForTemplate, setSelectedReasonForTemplate] = useState(ESCALATION_REASONS[0]);
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

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
  const isFieldTab = FIELD_SECTIONS.includes(currentSectionKey) || (topSelector === 'CaseManagement' && caseSection === 'Filters');

  // SLA dirty detection: compare current drafts against severities returned from backend
  const slaDirtyRows = useMemo(
    () =>
      severities.filter((s) => {
        const draft = slaDrafts[s.name];
        if (!draft) return false;
        return Number(draft.internal) !== s.internalHours || Number(draft.external) !== s.externalHours;
      }),
    [severities, slaDrafts]
  );

  // Unsaved changes dirty state calculation across all modules
  const hasUnsavedChanges = useMemo(() => {
    // 1. Field configuration tabs (Customer 360: AddNewCustomer, ExistingCustomer, Filters; Case Management: CreateCase, Filters)
    if (isFieldTab) {
      return JSON.stringify(fields) !== JSON.stringify(savedFields);
    }
    // 2. Customer 360 Master Lookups drafts
    if (topSelector === 'Customer360' && activeSection === 'MasterLookups') {
      const langDirty = JSON.stringify(languages) !== JSON.stringify(savedLanguages);
      const branchDirty = JSON.stringify(branches) !== JSON.stringify(savedBranches);
      const idTypeDirty = JSON.stringify(idTypes) !== JSON.stringify(savedIdTypes);
      return langDirty || branchDirty || idTypeDirty;
    }
    // 3. Case Management SLA Configuration drafts
    if (topSelector === 'CaseManagement' && caseSection === 'SlaConfiguration') {
      return slaDirtyRows.length > 0;
    }
    return false;
  }, [
    isFieldTab,
    fields,
    savedFields,
    topSelector,
    activeSection,
    caseSection,
    languages,
    savedLanguages,
    branches,
    savedBranches,
    idTypes,
    savedIdTypes,
    slaDirtyRows,
  ]);

  // Dynamic Changes Summary calculation: compares draft states with saved snapshots
  const unsavedChangesList = useMemo(() => {
    const list = [];
    const MASKING_MAP = {
      None: 'No masking',
      FullMask: 'Full mask',
      HideMiddle: 'Hide Middle, Show Ends',
      HideFirstShowLast: 'Hide first, show last',
    };

    if (isFieldTab) {
      // 1. Check for added or modified fields
      fields.forEach((f) => {
        const orig = savedFields.find((sf) => (sf.id && sf.id === f.id) || sf.apiField === f.apiField);
        if (!orig) {
          // Added field
          list.push({
            id: f.id || f.apiField,
            title: f.displayLabel || f.apiField || 'New Field',
            type: 'added',
            badgeLabel: 'Added',
            addedDetails: {
              'Field': f.displayLabel || f.apiField,
              'Status': 'New field',
              'Type': f.fieldType || f.type || 'Text',
              'Required': f.isRequired ? 'Yes' : 'No',
              'Visibility': f.isVisible ? 'Visible' : 'Hidden',
              ...(f.maskingRule && f.maskingRule !== 'None' ? { 'Masking': MASKING_MAP[f.maskingRule] || f.maskingRule } : {}),
            },
          });
        } else {
          // Existing field - check changed properties
          const props = [];
          if (orig.displayLabel !== f.displayLabel) {
            props.push({ label: 'Display Label', oldVal: orig.displayLabel, newVal: f.displayLabel });
          }
          if (Number(orig.displayOrder) !== Number(f.displayOrder)) {
            props.push({ label: 'Order', oldVal: orig.displayOrder, newVal: f.displayOrder });
          }
          if (Boolean(orig.isVisible) !== Boolean(f.isVisible)) {
            props.push({ label: 'Visibility', isVisibility: true, oldVal: orig.isVisible, newVal: f.isVisible });
          }
          if (Boolean(orig.isRequired) !== Boolean(f.isRequired)) {
            props.push({ label: 'Required', oldVal: orig.isRequired ? 'Yes' : 'No', newVal: f.isRequired ? 'Yes' : 'No' });
          }
          if (Boolean(orig.isEditable) !== Boolean(f.isEditable)) {
            props.push({ label: 'Editable', oldVal: orig.isEditable ? 'Yes' : 'No', newVal: f.isEditable ? 'Yes' : 'No' });
          }
          if (Boolean(orig.isSensitive) !== Boolean(f.isSensitive)) {
            props.push({ label: 'Sensitive Data', oldVal: orig.isSensitive ? 'Yes' : 'No', newVal: f.isSensitive ? 'Yes' : 'No' });
          }
          if ((orig.maskingRule || 'None') !== (f.maskingRule || 'None')) {
            props.push({
              label: 'Masking Rule',
              oldVal: MASKING_MAP[orig.maskingRule] || orig.maskingRule || 'No masking',
              newVal: MASKING_MAP[f.maskingRule] || f.maskingRule || 'No masking',
            });
          }
          if (Number(orig.visibleChars ?? 4) !== Number(f.visibleChars ?? 4)) {
            props.push({ label: 'Visible Chars', oldVal: orig.visibleChars ?? 4, newVal: f.visibleChars ?? 4 });
          }

          if (props.length > 0) {
            const isOnlyVis = props.length === 1 && props[0].isVisibility;
            list.push({
              id: f.id || f.apiField,
              title: f.displayLabel || orig.displayLabel || f.apiField,
              type: isOnlyVis ? 'visibility' : 'modified',
              badgeLabel: isOnlyVis ? 'Visibility Changed' : 'Modified',
              properties: props,
            });
          }
        }
      });
    } else if (topSelector === 'CaseManagement' && caseSection === 'SlaConfiguration') {
      slaDirtyRows.forEach((row) => {
        const draft = slaDrafts[row.name];
        if (!draft) return;
        const props = [];
        if (draft.internal !== '' && Number(draft.internal) !== row.internalHours) {
          props.push({ label: 'Internal SLA', oldVal: `${row.internalHours} hrs`, newVal: `${draft.internal} hrs` });
        }
        if (draft.external !== '' && Number(draft.external) !== row.externalHours) {
          props.push({ label: 'External SLA', oldVal: `${row.externalHours} hrs`, newVal: `${draft.external} hrs` });
        }
        if (props.length > 0) {
          list.push({
            id: row.name,
            title: row.name,
            type: 'modified',
            badgeLabel: 'Modified',
            properties: props,
          });
        }
      });
    } else if (topSelector === 'Customer360' && activeSection === 'MasterLookups') {
      languages.forEach((l) => {
        const orig = savedLanguages.find((sl) => sl.id === l.id);
        if (l.isNew) {
          list.push({
            id: l.id || l.value,
            title: `Preferred Language: ${l.value}`,
            type: 'added',
            badgeLabel: 'Added',
            addedDetails: { Status: 'New lookup value' },
          });
        } else if (orig && orig.isActive !== l.isActive) {
          list.push({
            id: l.id,
            title: `Preferred Language: ${l.value}`,
            type: 'visibility',
            badgeLabel: 'Status Changed',
            properties: [{ label: 'Status', oldVal: orig.isActive ? 'Active' : 'Inactive', newVal: l.isActive ? 'Active' : 'Inactive' }],
          });
        }
      });
      branches.forEach((b) => {
        const orig = savedBranches.find((sb) => sb.id === b.id);
        if (b.isNew) {
          list.push({
            id: b.id || b.value,
            title: `Home Branch: ${b.value}`,
            type: 'added',
            badgeLabel: 'Added',
            addedDetails: { Status: 'New lookup value' },
          });
        } else if (orig && orig.isActive !== b.isActive) {
          list.push({
            id: b.id,
            title: `Home Branch: ${b.value}`,
            type: 'visibility',
            badgeLabel: 'Status Changed',
            properties: [{ label: 'Status', oldVal: orig.isActive ? 'Active' : 'Inactive', newVal: b.isActive ? 'Active' : 'Inactive' }],
          });
        }
      });
      idTypes.forEach((i) => {
        const orig = savedIdTypes.find((si) => si.id === i.id);
        if (i.isNew) {
          list.push({
            id: i.id || i.value,
            title: `ID Type: ${i.value}`,
            type: 'added',
            badgeLabel: 'Added',
            addedDetails: { Status: 'New lookup value' },
          });
        } else if (orig && orig.isActive !== i.isActive) {
          list.push({
            id: i.id,
            title: `ID Type: ${i.value}`,
            type: 'visibility',
            badgeLabel: 'Status Changed',
            properties: [{ label: 'Status', oldVal: orig.isActive ? 'Active' : 'Inactive', newVal: i.isActive ? 'Active' : 'Inactive' }],
          });
        }
      });
    }

    return list;
  }, [
    isFieldTab,
    fields,
    savedFields,
    topSelector,
    caseSection,
    activeSection,
    slaDirtyRows,
    slaDrafts,
    languages,
    savedLanguages,
    branches,
    savedBranches,
    idTypes,
    savedIdTypes,
  ]);

  const getSectionName = useCallback(() => {
    if (topSelector === 'CaseManagement') {
      if (caseSection === 'CreateCase') return 'Create Case Form';
      if (caseSection === 'Filters') return 'Case Filters';
      if (caseSection === 'SlaConfiguration') return 'SLA Configuration';
    } else if (topSelector === 'Customer360') {
      if (activeSection === 'AddNewCustomer') return 'Add New Customer Form';
      if (activeSection === 'ExistingCustomer') return 'Existing Customer Details';
      if (activeSection === 'Filters') return 'Customer Directory Filters';
      if (activeSection === 'MasterLookups') return 'Master Lookups';
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
    setLanguages(JSON.parse(JSON.stringify(savedLanguages)));
    setBranches(JSON.parse(JSON.stringify(savedBranches)));
    setIdTypes(JSON.parse(JSON.stringify(savedIdTypes)));
    setSlaDrafts(
      Object.fromEntries(
        severities.map((s) => [s.name, { internal: String(s.internalHours), external: String(s.externalHours) }])
      )
    );

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
      const data = await configurableSettingsService.getFields(moduleKey, sectionKey, true);
      const sorted = [...(data || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      setFields(sorted);
      setSavedFields(JSON.parse(JSON.stringify(sorted)));
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

  const loadLookups = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [langs, brs, ids] = await Promise.all([
        configurableSettingsService.getLookupValues('PREFERRED_LANGUAGE', true, false),
        configurableSettingsService.getLookupValues('HOME_BRANCH', true, false),
        configurableSettingsService.getLookupValues('ID_TYPE', true, false),
      ]);
      const cleanLangs = langs || [];
      const cleanBrs = brs || [];
      const cleanIds = ids || [];
      setLanguages(cleanLangs);
      setSavedLanguages(JSON.parse(JSON.stringify(cleanLangs)));
      setBranches(cleanBrs);
      setSavedBranches(JSON.parse(JSON.stringify(cleanBrs)));
      setIdTypes(cleanIds);
      setSavedIdTypes(JSON.parse(JSON.stringify(cleanIds)));
    } catch (err) {
      console.error('Failed to load lookups:', err);
      setLoadError(err.message || 'Unable to load master lookup data.');
      toast.error(err.message || 'Unable to load master lookup data.');
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

    const depts = await loadDepartments();

    try {
      const [cts, subs, slaList, chns, tmpls, qaList, drList, csList, ssList] = await Promise.all([
        configurableSettingsService.getCaseTypes(false),
        configurableSettingsService.getSubCategories(null, false),
        configurableSettingsService.getSeverities(),
        configurableSettingsService.getLookupValues('COMMUNICATION_CHANNEL', true, false),
        configurableSettingsService.getEscalationTemplates(),
        configurableSettingsService.getLookupValues('DASHBOARD_QUICK_ACTION', true, false),
        configurableSettingsService.getLookupValues('DASHBOARD_DATE_RANGE', true, false),
        configurableSettingsService.getLookupValues('CASE_STATUS', true, false),
        configurableSettingsService.getLookupValues('SLA_STATUS', true, false),
      ]);
      setCaseTypes(cts || []);
      setSubCategories(subs || []);
      setSeverities(slaList || []);
      setChannels(chns || []);
      setEscalationTemplates(tmpls || []);
      setQuickActions(qaList || []);
      setDateRanges(drList || []);
      setCaseStatuses(csList || []);
      setSlaStatuses(ssList || []);
      setSlaDrafts(
        Object.fromEntries(
          (slaList || []).map((s) => [s.name, { internal: String(s.internalHours), external: String(s.externalHours) }])
        )
      );
    } catch (err) {
      console.error('Failed to load case metadata:', err);
      setLoadError(err.message || 'Unable to load case management configuration.');
      toast.error(err.message || 'Unable to load case management configuration.');
    } finally {
      setIsLoading(false);
    }

    setSelectedDeptForSub((prev) => (prev && depts.some((d) => d.id === prev) ? prev : depts[0]?.id || ''));
    setSelectedDeptForTemplate((prev) => (prev && depts.some((d) => d.id === prev) ? prev : depts[0]?.id || ''));
  }, [loadDepartments, toast]);

  useEffect(() => {
    if (topSelector === 'NotificationRules') {
      loadNotificationRules();
    } else if (topSelector === 'Customer360') {
      if (activeSection === 'MasterLookups') loadLookups();
      else loadFields('Customer360', activeSection);
    } else if (topSelector === 'Dashboard') {
      loadCaseMetadata();
    } else if (caseSection === 'CreateCase' || caseSection === 'Filters') {
      loadFields('CaseManagement', caseSection);
    } else {
      loadCaseMetadata();
    }
  }, [topSelector, activeSection, caseSection, loadFields, loadLookups, loadCaseMetadata, loadNotificationRules]);

  // Pre-fill the escalation form from the saved template for the selected department + reason.
  useEffect(() => {
    if (!selectedDeptForTemplate || !selectedReasonForTemplate) return;
    const match = escalationTemplates.find(
      (t) =>
        t.departmentId === selectedDeptForTemplate &&
        t.escalationReason?.toLowerCase() === selectedReasonForTemplate?.toLowerCase()
    );
    setTemplateSubject(match ? match.subjectTemplate || '' : DEFAULT_TEMPLATE_SUBJECT);
    setTemplateBody(match ? match.bodyTemplate || '' : DEFAULT_TEMPLATE_BODY);
  }, [selectedDeptForTemplate, selectedReasonForTemplate, escalationTemplates]);

  // ===== FIELD CONFIGURATION =====
  // ===== FIELD CONFIGURATION =====
  const handleFieldChange = (index, key, value) => {
    setFields((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [key]: value };
      return updated;
    });
  };

  const handleSaveAllChanges = async () => {
    setIsSaving(true);
    try {
      if (topSelector === 'Customer360') {
        if (activeSection === 'MasterLookups') {
          // Persist all pending master lookup changes (languages, branches, idTypes)
          for (const lang of languages) {
            const orig = savedLanguages.find((l) => l.id === lang.id);
            if (lang.isNew) {
              await configurableSettingsService.addLookupValue('PREFERRED_LANGUAGE', lang.value);
            } else if (orig && (orig.isActive !== lang.isActive || orig.value !== lang.value)) {
              await configurableSettingsService.updateLookupValue(
                lang.id,
                'PREFERRED_LANGUAGE',
                lang.value,
                lang.label || lang.value,
                lang.displayOrder,
                lang.isActive
              );
            }
          }
          for (const br of branches) {
            const orig = savedBranches.find((b) => b.id === br.id);
            if (br.isNew) {
              await configurableSettingsService.addLookupValue('HOME_BRANCH', br.value);
            } else if (orig && (orig.isActive !== br.isActive || orig.value !== br.value)) {
              await configurableSettingsService.updateLookupValue(
                br.id,
                'HOME_BRANCH',
                br.value,
                br.label || br.value,
                br.displayOrder,
                br.isActive
              );
            }
          }
          for (const idt of idTypes) {
            const orig = savedIdTypes.find((i) => i.id === idt.id);
            if (idt.isNew) {
              await configurableSettingsService.addLookupValue('ID_TYPE', idt.value);
            } else if (orig && (orig.isActive !== idt.isActive || orig.value !== idt.value)) {
              await configurableSettingsService.updateLookupValue(
                idt.id,
                'ID_TYPE',
                idt.value,
                idt.label || idt.value,
                idt.displayOrder,
                idt.isActive
              );
            }
          }
          await loadLookups();
          toast.success('Master lookup settings saved successfully.');
        } else {
          // Field settings: AddNewCustomer, ExistingCustomer, Filters
          await configurableSettingsService.saveFields('Customer360', activeSection, fields);
          const data = await configurableSettingsService.getFields('Customer360', activeSection, true);
          const sorted = [...(data || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
          setFields(sorted);
          setSavedFields(JSON.parse(JSON.stringify(sorted)));
          toast.success('Field settings saved successfully. Changes apply immediately.');
        }
      } else if (topSelector === 'CaseManagement' && caseSection === 'SlaConfiguration') {
        return await handleSaveSla();
      } else if (isFieldTab) {
        await configurableSettingsService.saveFields(topSelector, currentSectionKey, fields);
        const data = await configurableSettingsService.getFields(topSelector, currentSectionKey, true);
        const sorted = [...(data || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
        setFields(sorted);
        setSavedFields(JSON.parse(JSON.stringify(sorted)));
        toast.success('Field settings saved successfully.');
      }
      return true;
    } catch (err) {
      toast.error(err.message || 'Failed to save settings.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveFields = handleSaveAllChanges;

  const handleSubmitField = async (payload, editing) => {
    if (editing) {
      setFields((prev) =>
        prev.map((f) =>
          (f.id && f.id === editing.id) || f.apiField === editing.apiField
            ? { ...f, ...payload }
            : f
        )
      );
      toast.info(`Updated "${payload.displayLabel}" in draft. Click "Save Changes" to persist.`);
      return;
    }

    const newField = {
      id: `custom-${Date.now()}`,
      apiField: `custom_${payload.displayLabel.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      isCustomField: true,
      ...payload,
    };
    setFields((prev) => [...prev, newField]);
    toast.info(`Added custom field "${payload.displayLabel}" to draft. Click "Save Changes" to persist.`);
  };

  // ===== MASTER LOOKUPS (shared by Customer 360, Communication Channels, and Dashboard) =====
  const refreshLookup = useCallback(async (typeCode) => {
    const updated = await configurableSettingsService.getLookupValues(typeCode, true, false);
    if (typeCode === 'PREFERRED_LANGUAGE') setLanguages(updated || []);
    if (typeCode === 'HOME_BRANCH') setBranches(updated || []);
    if (typeCode === 'ID_TYPE') setIdTypes(updated || []);
    if (typeCode === 'COMMUNICATION_CHANNEL') setChannels(updated || []);
    if (typeCode === 'DASHBOARD_QUICK_ACTION') setQuickActions(updated || []);
    if (typeCode === 'DASHBOARD_DATE_RANGE') setDateRanges(updated || []);
    if (typeCode === 'CASE_STATUS') setCaseStatuses(updated || []);
    if (typeCode === 'SLA_STATUS') setSlaStatuses(updated || []);
  }, []);

  const existingLookupValues = {
    PREFERRED_LANGUAGE: languages,
    HOME_BRANCH: branches,
    ID_TYPE: idTypes,
    COMMUNICATION_CHANNEL: channels,
    DASHBOARD_QUICK_ACTION: quickActions,
    DASHBOARD_DATE_RANGE: dateRanges,
    CASE_STATUS: caseStatuses,
    SLA_STATUS: slaStatuses,
  };

  const handleToggleVisibility = (item, typeCode, label) => {
    if (['PREFERRED_LANGUAGE', 'HOME_BRANCH', 'ID_TYPE'].includes(typeCode)) {
      const newActive = !item.isActive;
      const updateList = (prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isActive: newActive } : i));
      if (typeCode === 'PREFERRED_LANGUAGE') setLanguages(updateList);
      if (typeCode === 'HOME_BRANCH') setBranches(updateList);
      if (typeCode === 'ID_TYPE') setIdTypes(updateList);
      toast.info(`${label} "${item.label || item.value}" is now ${newActive ? 'Visible' : 'Not Visible'} (Draft). Click "Save Changes" to persist.`);
      return;
    }

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

  const handleAddLookup = (typeCode, inputVal, setInputState, label) => {
    const value = (inputVal || '').trim();
    if (!value) {
      toast.error(`Please enter a ${label.toLowerCase()} name.`);
      return;
    }

    const currentList = existingLookupValues[typeCode] || [];
    if (currentList.some((item) => (item.value || '').toLowerCase() === value.toLowerCase())) {
      toast.error(`"${value}" already exists in this list.`);
      return;
    }

    if (['PREFERRED_LANGUAGE', 'HOME_BRANCH', 'ID_TYPE'].includes(typeCode)) {
      const newItem = {
        id: `draft_${Date.now()}`,
        value,
        label: value,
        displayOrder: currentList.length + 1,
        isActive: true,
        isNew: true,
      };
      if (typeCode === 'PREFERRED_LANGUAGE') setLanguages((prev) => [...prev, newItem]);
      if (typeCode === 'HOME_BRANCH') setBranches((prev) => [...prev, newItem]);
      if (typeCode === 'ID_TYPE') setIdTypes((prev) => [...prev, newItem]);
      setInputState('');
      toast.info(`Added "${value}" to draft. Click "Save Changes" to persist.`);
      return;
    }

    runPending(`add:${typeCode}`, async () => {
      try {
        await configurableSettingsService.addLookupValue(typeCode, value, value, currentList.length + 1);
        setInputState('');
        await refreshLookup(typeCode);
        toast.success(`Added ${label} "${value}".`);
      } catch (err) {
        toast.error(err.message || `Failed to add ${label.toLowerCase()}.`);
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

  const handleDeleteLookup = (id, typeCode, valueName, label) => {
    openConfirm(
      `Delete ${label}`,
      `Are you sure you want to delete "${valueName}"? This action cannot be undone.`,
      async () => {
        await configurableSettingsService.deleteLookupValue(id, typeCode);
        await refreshLookup(typeCode);
        toast.success(`${label} "${valueName}" deleted successfully.`);
      },
      'Delete',
      {
        name: valueName,
        type: label,
        code: typeCode,
      }
    );
  };

  // ===== DEPARTMENTS =====
  const handleAddDepartment = () =>
    runPending('add:department', async () => {
      const name = newDeptName.trim();
      const code = newDeptCode.trim().toUpperCase();
      if (!name) return toast.error('Please enter a department name.');
      if (!code) return toast.error('Please enter a department code (e.g. OPS).');
      if (departments.some((d) => d.name.toLowerCase() === name.toLowerCase())) {
        return toast.error(`Department "${name}" already exists.`);
      }
      if (departments.some((d) => (d.code || '').toLowerCase() === code.toLowerCase())) {
        return toast.error(`Department code "${code}" is already in use.`);
      }

      try {
        await departmentService.createDepartment({ name, code });
        setNewDeptName('');
        setNewDeptCode('');
        await loadDepartments();
        toast.success(`Department "${name}" added successfully.`);
      } catch (err) {
        toast.error(err.message || 'Failed to add department.');
      }
    });

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
      const subs = await configurableSettingsService.getSubCategories(null, false);
      setSubCategories(subs || []);
      const tmpls = await configurableSettingsService.getEscalationTemplates();
      setEscalationTemplates(tmpls || []);
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
  const handleAddCaseType = () =>
    runPending('add:caseType', async () => {
      const code = newCaseTypeCode.trim();
      const name = newCaseTypeName.trim();
      const prefix = newCaseTypePrefix.trim().toUpperCase();
      if (!code || !name || !prefix) {
        return toast.error('Code, Name and Prefix are all required for a case type.');
      }
      if (caseTypes.some((c) => c.code.toLowerCase() === code.toLowerCase() || c.name.toLowerCase() === name.toLowerCase())) {
        return toast.error(`A case type with the code "${code}" or name "${name}" already exists.`);
      }

      try {
        const created = await configurableSettingsService.addCaseType(code, name, prefix, caseTypes.length + 1);
        setNewCaseTypeCode('');
        setNewCaseTypeName('');
        setNewCaseTypePrefix('');
        setCaseTypes(await configurableSettingsService.getCaseTypes(false));
        toast.success(`Case Type "${created.name}" (Prefix: ${created.prefix}) added successfully.`);
      } catch (err) {
        toast.error(err.message || 'Failed to add Case Type.');
      }
    });

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
  const departmentSubCategories = useMemo(
    () => subCategories.filter((s) => String(s.departmentId) === String(selectedDeptForSub)),
    [subCategories, selectedDeptForSub]
  );

  const handleAddSubCategory = () =>
    runPending('add:subCategory', async () => {
      const name = newSubCategoryName.trim();
      if (!selectedDeptForSub) return toast.error('Please select a department first.');
      if (!name) return toast.error('Please enter a sub-category name.');
      if (departmentSubCategories.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
        return toast.error(`Sub-category "${name}" already exists for this department.`);
      }

      try {
        const created = await configurableSettingsService.addSubCategory(selectedDeptForSub, name);
        setNewSubCategoryName('');
        setSubCategories(await configurableSettingsService.getSubCategories(null, false));
        toast.success(`Sub-category "${created.name}" added to ${created.departmentName}.`);
      } catch (err) {
        toast.error(err.message || 'Failed to add Sub-category.');
      }
    });

  const handleUpdateSubCategory = async (item, values) => {
    const name = (values.name || '').trim();
    if (!name) {
      toast.error('Sub-category name cannot be empty.');
      throw new Error('invalid');
    }
    try {
      await configurableSettingsService.updateSubCategory(item.id, {
        name,
        displayOrder: item.displayOrder,
        isActive: item.isActive,
      });
      setSubCategories(await configurableSettingsService.getSubCategories(null, false));
      toast.success(`Sub-category updated to "${name}".`);
    } catch (err) {
      toast.error(err.message || 'Failed to update Sub-category.');
      throw err;
    }
  };

  const handleToggleSubCategoryVisibility = (item) => {
    runPending(`toggle:subcategory:${item.id}`, async () => {
      const newActive = !item.isActive;
      try {
        await configurableSettingsService.updateSubCategory(item.id, {
          name: item.name,
          displayOrder: item.displayOrder,
          isActive: newActive,
        });
        setSubCategories(await configurableSettingsService.getSubCategories(null, false));
        toast.success(`Sub-category "${item.name}" is now ${newActive ? 'Visible' : 'Not Visible'}.`);
      } catch (err) {
        toast.error(err.message || 'Failed to update visibility for Sub-category.');
      }
    });
  };

  // ===== SEVERITIES (master data + SLA rows are written together by the API) =====
  const refreshSeverities = useCallback(async () => {
    const list = await configurableSettingsService.getSeverities();
    setSeverities(list || []);
    setSlaDrafts(
      Object.fromEntries(
        (list || []).map((s) => [s.name, { internal: String(s.internalHours), external: String(s.externalHours) }])
      )
    );
    return list || [];
  }, []);

  const handleAddSeverity = () =>
    runPending('add:severity', async () => {
      const name = newSeverityName.trim();
      if (!name) return toast.error('Please enter a severity name.');
      if (severities.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
        return toast.error(`Severity "${name}" already exists.`);
      }
      const internal = Number(newSeverityInternal);
      const external = Number(newSeverityExternal);
      if (!Number.isInteger(internal) || internal <= 0) return toast.error('Internal SLA must be a whole number of hours greater than 0.');
      if (!Number.isInteger(external) || external <= 0) return toast.error('External SLA must be a whole number of hours greater than 0.');

      try {
        await configurableSettingsService.addSeverity(name, internal, external, severities.length + 1);
        setNewSeverityName('');
        setNewSeverityInternal('22');
        setNewSeverityExternal('24');
        await refreshSeverities();
        toast.success(`Severity "${name}" added and its SLA row created (Internal ${internal}h / External ${external}h).`);
      } catch (err) {
        toast.error(err.message || 'Failed to add severity.');
      }
    });

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

  // ===== SLA CONFIGURATION =====
  const handleSaveSla = async () => {
    if (slaDirtyRows.length === 0) {
      toast.info('No SLA changes to save.');
      return true;
    }

    for (const row of slaDirtyRows) {
      const draft = slaDrafts[row.name];
      const internal = Number(draft.internal);
      const external = Number(draft.external);
      if (draft.internal === '' || draft.external === '') {
        toast.error(`SLA hours for "${row.name}" cannot be empty.`);
        return false;
      }
      if (!Number.isInteger(internal) || internal <= 0) {
        toast.error(`Internal SLA for "${row.name}" must be a whole number of hours greater than 0.`);
        return false;
      }
      if (!Number.isInteger(external) || external <= 0) {
        toast.error(`External SLA for "${row.name}" must be a whole number of hours greater than 0.`);
        return false;
      }
    }

    setIsSavingSla(true);
    try {
      for (const row of slaDirtyRows) {
        const draft = slaDrafts[row.name];
        await configurableSettingsService.saveSlaConfiguration(row.name, Number(draft.internal), Number(draft.external));
      }
      await refreshSeverities();
      toast.success(`SLA configuration saved for ${slaDirtyRows.length} severity level(s).`);
      return true;
    } catch (err) {
      toast.error(err.message || 'Failed to save SLA configuration.');
      return false;
    } finally {
      setIsSavingSla(false);
    }
  };

  const handleSaveAndLeave = async () => {
    let success = false;
    if (topSelector === 'CaseManagement' && caseSection === 'SlaConfiguration') {
      success = await handleSaveSla();
    } else {
      success = await handleSaveAllChanges();
    }

    if (success) {
      isLeavingRef.current = true;
      const action = unsavedModal.pendingAction;
      setUnsavedModal({ isOpen: false, message: null, pendingAction: null });
      if (action) {
        action();
      }
    }
  };

  // ===== ESCALATION TEMPLATES =====
  const handleSaveEscalationTemplate = async () => {
    if (!selectedDeptForTemplate) return toast.error('Please select a target department.');
    if (!selectedReasonForTemplate) return toast.error('Please select an escalation reason.');
    if (!templateSubject.trim()) return toast.error('Email subject template is required.');
    if (!templateBody.trim()) return toast.error('Email body template is required.');

    setIsSavingTemplate(true);
    try {
      await configurableSettingsService.saveEscalationTemplate(
        selectedDeptForTemplate,
        selectedReasonForTemplate,
        templateSubject.trim(),
        templateBody.trim()
      );
      setEscalationTemplates(await configurableSettingsService.getEscalationTemplates());
      toast.success('Escalation template saved. The Escalate drawer will load it automatically.');
    } catch (err) {
      toast.error(err.message || 'Failed to save escalation template.');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleEditTemplate = (template) => {
    setSelectedDeptForTemplate(template.departmentId);
    setSelectedReasonForTemplate(template.escalationReason);
    setTemplateSubject(template.subjectTemplate || '');
    setTemplateBody(template.bodyTemplate || '');
    document.getElementById('escalation-template-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleDeleteTemplate = (template) => {
    openConfirm(
      'Delete Escalation Template',
      `Are you sure you want to delete the "${template.escalationReason}" template for ${template.departmentName}? This action cannot be undone.`,
      async () => {
        await configurableSettingsService.deleteEscalationTemplate(template.id);
        setEscalationTemplates(await configurableSettingsService.getEscalationTemplates());
        toast.success('Escalation template deleted successfully.');
      }
    );
  };

  const handleInsertPlaceholder = (placeholderTag) => {
    setTemplateBody((prev) => (prev ? `${prev} ${placeholderTag}` : placeholderTag));
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

  const renderLookupCard = ({
    title,
    desc,
    typeCode,
    items,
    input,
    setInput,
    placeholder,
    addLabel,
    itemLabel,
    emptyText,
    showDelete = true,
    showVisibility = false,
  }) => (
    <div className="master-card">
      <div>
        <h3 className="master-card__title">{title}</h3>
        <p className="master-card__desc">{desc}</p>
      </div>
      <div className="master-card__form">
        <div className="master-card__input-row">
          <input
            type="text"
            className="input-field"
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddLookup(typeCode, input, setInput, itemLabel)}
            disabled={isPending(`add:${typeCode}`)}
          />
          <Button
            variant="primary"
            onClick={() => handleAddLookup(typeCode, input, setInput, itemLabel)}
            isLoading={isPending(`add:${typeCode}`)}
            leftIcon={<Plus size={14} />}
          >
            {addLabel}
          </Button>
        </div>
      </div>
      <div className="master-card__list scrollbar-thin">
        {renderListState(items.length === 0, emptyText) ||
          items.map((item) => (
            <MasterItem
              key={item.id}
              fields={[{ key: 'value', placeholder: itemLabel }]}
              initial={{ value: item.label || item.value }}
              onSave={(values) => handleUpdateLookup(item, typeCode, values, itemLabel)}
              onDelete={showDelete ? () => handleDeleteLookup(item.id, typeCode, item.label || item.value, itemLabel) : undefined}
              showDelete={showDelete}
              showVisibility={showVisibility}
              isVisible={item.isActive !== false}
              onToggleVisibility={showVisibility ? () => handleToggleVisibility(item, typeCode, itemLabel) : undefined}
              isTogglingVisibility={isPending(`toggle:${item.id}`)}
            >
              <span className="master-card__item-title">{item.label || item.value}</span>
            </MasterItem>
          ))}
      </div>
    </div>
  );

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
            <th style={{ width: 80, textAlign: 'center' }}>EDITABLE</th>
            <th style={{ width: 80, textAlign: 'center' }}>SENSITIVE</th>
            <th>MASKING RULE</th>
            <th style={{ width: 100, textAlign: 'center' }}>VISIBLE CHARS</th>
            <th style={{ width: 110, textAlign: 'center' }}>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {fields.length === 0 ? (
            <tr>
              <td colSpan={10}>
                <div className="master-card__empty">
                  {loadError || (showAddButton ? 'No fields configured for this section yet. Use “ADD NEW FIELD” to create one.' : 'No fields configured for this section yet.')}
                </div>
              </td>
            </tr>
          ) : (
            fields.map((f, i) => (
              <tr key={f.id || f.apiField}>
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
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="number"
                    min={0}
                    className="input-cell-order"
                    value={f.displayOrder}
                    onChange={(e) => handleFieldChange(i, 'displayOrder', parseInt(e.target.value, 10) || 0)}
                  />
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
                    checked={f.isRequired}
                    onChange={(e) => handleFieldChange(i, 'isRequired', e.target.checked)}
                  />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    className="checkbox-custom"
                    checked={f.isEditable}
                    onChange={(e) => handleFieldChange(i, 'isEditable', e.target.checked)}
                  />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    className="checkbox-custom"
                    checked={f.isSensitive}
                    onChange={(e) => handleFieldChange(i, 'isSensitive', e.target.checked)}
                  />
                </td>
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
                      disabled={!f.id}
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
            Configure label, visibility, requirement, editability, order, and masking per field.
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

  const departmentOptions = departments.map((d) => (
    <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
  ));

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

  const renderNotificationRulesConfig = () => (
    <div className="config-settings-body">
      <div className="config-card" style={{ marginBottom: 20 }}>
        <div className="config-card__header">
          <div>
            <h2 className="config-card__title">Notification Rules &amp; Deduplication Engine</h2>
            <p className="config-card__desc">
              Manage rule priorities, cooldown intervals, duplicate suppression, SLA breach reminders, and notification aggregation.
            </p>
          </div>
        </div>
      </div>

      {isLoadingRules ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Loader text="Loading notification rules..." />
        </div>
      ) : notificationRules.length === 0 ? (
        <div className="config-card" style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
          <Bell size={32} color="#94a3b8" style={{ marginBottom: 12 }} />
          <h3>No notification rules defined</h3>
          <p>Default notification rules will be initialized automatically on server restart.</p>
        </div>
      ) : (
        <div className="rule-cards-grid">
          {notificationRules.map((rule) => (
            <NotificationRuleCard
              key={rule.id}
              rule={rule}
              onToggle={() => handleToggleRule(rule.id)}
              onSave={(formData) => handleSaveRule(rule.id, formData)}
            />
          ))}
        </div>
      )}
    </div>
  );

  const filteredPredefinedLangs = useMemo(() => {
    if (!langSearch.trim()) return languages;
    return languages.filter((l) =>
      (l.label || l.value || '').toLowerCase().includes(langSearch.trim().toLowerCase())
    );
  }, [languages, langSearch]);

  const existingLangMatch = useMemo(() => {
    if (!langSearch.trim()) return null;
    return languages.find(
      (l) => (l.label || l.value || '').toLowerCase() === langSearch.trim().toLowerCase()
    );
  }, [languages, langSearch]);

  const filteredPredefinedBranches = useMemo(() => {
    if (!branchSearch.trim()) return branches;
    return branches.filter((b) =>
      (b.label || b.value || '').toLowerCase().includes(branchSearch.trim().toLowerCase())
    );
  }, [branches, branchSearch]);

  const existingBranchMatch = useMemo(() => {
    if (!branchSearch.trim()) return null;
    return branches.find(
      (b) => (b.label || b.value || '').toLowerCase() === branchSearch.trim().toLowerCase()
    );
  }, [branches, branchSearch]);

  const showHeaderSave = isFieldTab || (topSelector === 'CaseManagement' && caseSection === 'SlaConfiguration');

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
                Configure labels, visibility, requirements, editability, order, masking, SLA, and master lookups per module.
              </p>
            </div>
          </div>

          {showHeaderSave ? (
            <button
              className="btn-save-changes"
              onClick={caseSection === 'SlaConfiguration' && topSelector === 'CaseManagement' ? handleSaveSla : handleSaveFields}
              disabled={isSaving || isSavingSla || isLoading}
              id="btn-save-field-changes"
            >
              <Save size={15} />
              <span>{isSaving || isSavingSla ? 'Saving…' : 'Save Changes'}</span>
            </button>
          ) : (
            <span className="config-settings-banner__note">
              <CheckCircle2 size={13} />
              {caseSection === 'EscalationTemplates' && topSelector === 'CaseManagement'
                ? 'Use “Save Escalation Template” to persist this template'
                : 'Every change on this tab saves immediately'}
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
            <button
              className={`top-level-btn ${topSelector === 'NotificationRules' ? 'top-level-btn--active' : ''}`}
              onClick={() => handleTopSelectorClick('NotificationRules')}
              id="btn-top-selector-notification-rules"
            >
              Notification Rules
            </button>
          </div>
        </div>
      </div>

      {topSelector === 'NotificationRules' ? (
        renderNotificationRulesConfig()
      ) : topSelector === 'Dashboard' ? (
        renderDashboardConfig()
      ) : topSelector === 'CaseManagement' ? (
        <>
          <div className="config-section-nav">
            <button className={`config-section-tab ${caseSection === 'CreateCase' ? 'config-section-tab--active' : ''}`} onClick={() => handleCaseSectionClick('CreateCase')} id="tab-case-create">Create Case Form</button>
            <button className={`config-section-tab ${caseSection === 'Filters' ? 'config-section-tab--active' : ''}`} onClick={() => handleCaseSectionClick('Filters')} id="tab-case-filters">Case Filters</button>
            <button className={`config-section-tab ${caseSection === 'MasterData' ? 'config-section-tab--active' : ''}`} onClick={() => handleCaseSectionClick('MasterData')} id="tab-case-master-data">Master Data &amp; Dropdowns</button>
            <button className={`config-section-tab ${caseSection === 'SlaConfiguration' ? 'config-section-tab--active' : ''}`} onClick={() => handleCaseSectionClick('SlaConfiguration')} id="tab-case-sla">SLA Configuration</button>
            <button className={`config-section-tab ${caseSection === 'EscalationTemplates' ? 'config-section-tab--active' : ''}`} onClick={() => handleCaseSectionClick('EscalationTemplates')} id="tab-case-templates">Escalation Templates</button>
          </div>

          <div className="config-settings-body">
            {caseSection === 'MasterData' ? (
              <div className="master-data-grid">
                {/* DEPARTMENTS */}
                <div className="master-card">
                  <div>
                    <h3 className="master-card__title"><Building2 size={15} /> Departments</h3>
                    <p className="master-card__desc">
                      Handling departments. These populate the Department dropdowns across Case Management.
                    </p>
                  </div>
                  <div className="master-card__form">
                    <div className="master-card__input-row">
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Department name (e.g. Compliance)"
                        value={newDeptName}
                        onChange={(e) => setNewDeptName(e.target.value)}
                        disabled={isPending('add:department')}
                        id="input-new-department-name"
                      />
                      <input
                        type="text"
                        className="input-field"
                        placeholder="Code"
                        style={{ maxWidth: 110 }}
                        value={newDeptCode}
                        onChange={(e) => setNewDeptCode(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddDepartment()}
                        disabled={isPending('add:department')}
                        id="input-new-department-code"
                      />
                    </div>
                    <Button
                      variant="primary"
                      onClick={handleAddDepartment}
                      isLoading={isPending('add:department')}
                      leftIcon={<Plus size={14} />}
                      id="btn-add-department"
                    >
                      Add Department
                    </Button>
                  </div>
                  <div className="master-card__list scrollbar-thin">
                    {isLoading ? (
                      <div className="master-card__loading"><Loader size="sm" /> <span>Loading…</span></div>
                    ) : departmentsError ? (
                      <div className="master-card__error"><AlertCircle size={14} /> {departmentsError}</div>
                    ) : departments.length === 0 ? (
                      <div className="master-card__empty">No departments configured yet.</div>
                    ) : (
                      departments.map((d) => (
                        <MasterItem
                          key={d.id}
                          fields={[
                            { key: 'name', placeholder: 'Department name' },
                            { key: 'code', placeholder: 'Code', width: 90 },
                          ]}
                          initial={{ name: d.name, code: d.code }}
                          onSave={(values) => handleUpdateDepartment(d, values)}
                          showDelete={false}
                          showVisibility={true}
                          isVisible={d.isActive !== false}
                          onToggleVisibility={() => handleToggleDepartmentVisibility(d)}
                          isTogglingVisibility={isPending(`toggle:dept:${d.id}`)}
                        >
                          <span className="master-card__item-title">{d.name}</span>
                          <span className="prefix-badge">{d.code}</span>
                        </MasterItem>
                      ))
                    )}
                  </div>
                </div>

                {/* CASE TYPES WITH PREFIXES */}
                <div className="master-card">
                  <div>
                    <h3 className="master-card__title">Configurable Case Types &amp; Prefixes</h3>
                    <p className="master-card__desc">
                      Add custom Case Types. The configured prefix (e.g. IR-) governs automatic case number generation.
                    </p>
                  </div>
                  <div className="master-card__form">
                    <div className="master-card__input-row">
                      <input type="text" className="input-field" placeholder="Code (e.g. InfoReq)" value={newCaseTypeCode} onChange={(e) => setNewCaseTypeCode(e.target.value)} disabled={isPending('add:caseType')} />
                      <input type="text" className="input-field" placeholder="Name (e.g. Info Request)" value={newCaseTypeName} onChange={(e) => setNewCaseTypeName(e.target.value)} disabled={isPending('add:caseType')} />
                    </div>
                    <div className="master-card__input-row">
                      <input type="text" className="input-field" placeholder="Prefix (e.g. IR-)" style={{ maxWidth: 130 }} value={newCaseTypePrefix} onChange={(e) => setNewCaseTypePrefix(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddCaseType()} disabled={isPending('add:caseType')} />
                      <Button variant="primary" onClick={handleAddCaseType} isLoading={isPending('add:caseType')} leftIcon={<Plus size={14} />} id="btn-add-case-type">
                        Add Type
                      </Button>
                    </div>
                  </div>
                  <div className="master-card__list scrollbar-thin">
                    {renderListState(caseTypes.length === 0, 'No case types configured yet.') ||
                      caseTypes.map((c) => (
                        <MasterItem
                          key={c.id}
                          fields={[
                            { key: 'code', placeholder: 'Code', width: 110 },
                            { key: 'name', placeholder: 'Name' },
                            { key: 'prefix', placeholder: 'Prefix', width: 90 },
                          ]}
                          initial={{ code: c.code, name: c.name, prefix: c.prefix }}
                          onSave={(values) => handleUpdateCaseType(c, values)}
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

                {/* DEPARTMENT SUB-CATEGORIES */}
                <div className="master-card">
                  <div>
                    <h3 className="master-card__title">Department Sub-Categories</h3>
                    <p className="master-card__desc">
                      Sub-categories always belong to the department selected below.
                    </p>
                  </div>
                  <div className="master-card__form">
                    {departmentsError ? (
                      <div className="master-card__error"><AlertCircle size={14} /> {departmentsError}</div>
                    ) : (
                      <Select
                        label="Select Department"
                        value={selectedDeptForSub}
                        onChange={(e) => setSelectedDeptForSub(e.target.value)}
                        placeholder={isLoading ? 'Loading departments…' : 'Select department...'}
                      >
                        {departmentOptions}
                      </Select>
                    )}
                    <div className="master-card__input-row">
                      <input
                        type="text"
                        className="input-field"
                        placeholder="New sub-category name (e.g. Home Loan)"
                        value={newSubCategoryName}
                        onChange={(e) => setNewSubCategoryName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddSubCategory()}
                        disabled={isPending('add:subCategory') || !selectedDeptForSub}
                        id="input-new-subcategory"
                      />
                      <Button
                        variant="primary"
                        onClick={handleAddSubCategory}
                        isLoading={isPending('add:subCategory')}
                        disabled={!selectedDeptForSub}
                        leftIcon={<Plus size={14} />}
                        id="btn-add-subcategory"
                      >
                        Add Sub-Category
                      </Button>
                    </div>
                  </div>
                  <div className="master-card__list scrollbar-thin">
                    {renderListState(
                      departmentSubCategories.length === 0,
                      selectedDeptForSub ? 'No sub-categories for this department yet.' : 'Select a department to see its sub-categories.'
                    ) ||
                      departmentSubCategories.map((s) => (
                        <MasterItem
                          key={s.id}
                          fields={[{ key: 'name', placeholder: 'Sub-category name' }]}
                          initial={{ name: s.name }}
                          onSave={(values) => handleUpdateSubCategory(s, values)}
                          showDelete={false}
                          showVisibility={true}
                          isVisible={s.isActive !== false}
                          onToggleVisibility={() => handleToggleSubCategoryVisibility(s)}
                          isTogglingVisibility={isPending(`toggle:subcategory:${s.id}`)}
                        >
                          <span className="master-card__item-title">{s.name}</span>
                          <span className="master-card__item-meta">({s.departmentName})</span>
                        </MasterItem>
                      ))}
                  </div>
                </div>

                {/* PREFERRED COMMUNICATION CHANNELS */}
                {renderLookupCard({
                  title: 'Preferred Communication Channels',
                  desc: 'Available communication channels for Create Case and filter dropdowns.',
                  typeCode: 'COMMUNICATION_CHANNEL',
                  items: channels,
                  input: newChannelInput,
                  setInput: setNewChannelInput,
                  placeholder: 'Add channel (e.g. WhatsApp, SMS)',
                  addLabel: 'Add Channel',
                  itemLabel: 'Channel',
                  emptyText: 'No channels configured yet.',
                  showDelete: false,
                  showVisibility: true,
                })}

                {/* SEVERITY MANAGEMENT */}
                <div className="master-card">
                  <div>
                    <h3 className="master-card__title"><ShieldAlert size={15} /> Severity Management</h3>
                    <p className="master-card__desc">
                      Severity levels used by Create Case and SLA Configuration. Adding one creates its SLA row automatically.
                    </p>
                  </div>
                  <div className="master-card__form">
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Severity name (e.g. Urgent)"
                      value={newSeverityName}
                      onChange={(e) => setNewSeverityName(e.target.value)}
                      disabled={isPending('add:severity')}
                      id="input-new-severity"
                    />
                    <div className="master-card__input-row">
                      <div className="input-unit-wrapper">
                        <input type="number" min={1} className="sla-input-number" aria-label="Internal SLA hours for the new severity" value={newSeverityInternal} onChange={(e) => setNewSeverityInternal(e.target.value)} disabled={isPending('add:severity')} />
                        <span className="input-unit-tag">internal hrs</span>
                      </div>
                      <div className="input-unit-wrapper">
                        <input type="number" min={1} className="sla-input-number" aria-label="External SLA hours for the new severity" value={newSeverityExternal} onChange={(e) => setNewSeverityExternal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddSeverity()} disabled={isPending('add:severity')} />
                        <span className="input-unit-tag">external hrs</span>
                      </div>
                    </div>
                    <Button variant="primary" onClick={handleAddSeverity} isLoading={isPending('add:severity')} leftIcon={<Plus size={14} />} id="btn-add-severity">
                      Add Severity
                    </Button>
                  </div>
                  <div className="master-card__list scrollbar-thin">
                    {renderListState(severities.length === 0, 'No severities configured yet.') ||
                      severities.map((s) => (
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
                            {s.casesUsing > 0 ? ` · ${s.casesUsing} case(s)` : ''}
                          </span>
                        </MasterItem>
                      ))}
                  </div>
                </div>
              </div>
            ) : caseSection === 'SlaConfiguration' ? (
              /* SLA CONFIGURATION TAB */
              <div className="config-card sla-config-card">
                <div className="config-card__header">
                  <div className="config-card__header-left">
                    <div className="sla-card__icon-box">
                      <Clock size={22} color="#1d4ed8" />
                    </div>
                    <div>
                      <h2 className="config-card__title">SLA Configuration (Internal vs External Hours)</h2>
                      <p className="config-card__desc">
                        Target Internal SLA (agent response) and External SLA (customer resolution deadline) per configured severity.
                        Severities are managed under Master Data &amp; Dropdowns.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    onClick={handleSaveSla}
                    isLoading={isSavingSla}
                    disabled={slaDirtyRows.length === 0}
                    leftIcon={<Save size={15} />}
                    id="btn-save-sla"
                  >
                    {slaDirtyRows.length > 0 ? `Save ${slaDirtyRows.length} Change(s)` : 'Save SLA'}
                  </Button>
                </div>

                <div className="sla-table-container">
                  {isLoading ? (
                    <div className="config-card__loading"><Loader /></div>
                  ) : severities.length === 0 ? (
                    <div className="master-card__empty">
                      No severities configured yet. Add one under Master Data &amp; Dropdowns → Severity Management.
                    </div>
                  ) : (
                    <div className="sla-table">
                      <div className="sla-table__head">
                        <div className="sla-col-sev">Severity Level</div>
                        <div className="sla-col-desc">Description &amp; Guidelines</div>
                        <div className="sla-col-input">Internal SLA (Agent)</div>
                        <div className="sla-col-input">External SLA (Customer)</div>
                      </div>
                      <div className="sla-table__body">
                        {severities.map((sev) => {
                          const badge = SEVERITY_BADGES[sev.name] || SEVERITY_BADGE_FALLBACK;
                          const draft = slaDrafts[sev.name] || { internal: '', external: '' };
                          return (
                            <div key={sev.id} className="sla-row">
                              <div className="sla-col-sev">
                                <span
                                  className="severity-pill-badge"
                                  style={{ backgroundColor: badge.bg, color: badge.text, borderColor: badge.border }}
                                >
                                  {sev.name} Severity
                                </span>
                              </div>
                              <div className="sla-col-desc">
                                <span className="sla-row__desc-text">{badge.desc}</span>
                              </div>
                              <div className="sla-col-input">
                                <div className="input-unit-wrapper">
                                  <input
                                    type="number"
                                    min={1}
                                    className="sla-input-number"
                                    value={draft.internal}
                                    onChange={(e) =>
                                      setSlaDrafts((prev) => ({
                                        ...prev,
                                        [sev.name]: { ...prev[sev.name], internal: e.target.value },
                                      }))
                                    }
                                    aria-label={`Internal SLA hours for ${sev.name}`}
                                  />
                                  <span className="input-unit-tag">hrs</span>
                                </div>
                              </div>
                              <div className="sla-col-input">
                                <div className="input-unit-wrapper">
                                  <input
                                    type="number"
                                    min={1}
                                    className="sla-input-number"
                                    value={draft.external}
                                    onChange={(e) =>
                                      setSlaDrafts((prev) => ({
                                        ...prev,
                                        [sev.name]: { ...prev[sev.name], external: e.target.value },
                                      }))
                                    }
                                    aria-label={`External SLA hours for ${sev.name}`}
                                  />
                                  <span className="input-unit-tag">hrs</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : caseSection === 'EscalationTemplates' ? (
              /* ESCALATION TEMPLATES TAB */
              <div className="config-card escalation-card">
                <div className="config-card__header">
                  <div className="config-card__header-left">
                    <div className="escalation-card__icon-box">
                      <FileText size={22} color="#dc2626" />
                    </div>
                    <div>
                      <h2 className="config-card__title">Escalation Templates Configuration</h2>
                      <p className="config-card__desc">
                        One template per Department + Escalation Reason. The Escalate drawer loads the matching
                        template and substitutes the placeholders with live case data.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="escalation-form-wrapper" id="escalation-template-form">
                  <div className="escalation-form-grid">
                    {departmentsError ? (
                      <div className="master-card__error"><AlertCircle size={14} /> {departmentsError}</div>
                    ) : (
                      <Select
                        label="Target Department"
                        required
                        value={selectedDeptForTemplate}
                        onChange={(e) => setSelectedDeptForTemplate(e.target.value)}
                        placeholder={isLoading ? 'Loading departments…' : 'Select department...'}
                      >
                        {departmentOptions}
                      </Select>
                    )}

                    <Select
                      label="Escalation Reason"
                      required
                      value={selectedReasonForTemplate}
                      onChange={(e) => setSelectedReasonForTemplate(e.target.value)}
                    >
                      {ESCALATION_REASONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </Select>
                  </div>

                  <Input
                    label="Email Subject Template"
                    required
                    placeholder="e.g. [URGENT ESCALATION] Case {caseNumber} - Regulatory Review"
                    value={templateSubject}
                    onChange={(e) => setTemplateSubject(e.target.value)}
                    id="input-template-subject"
                  />

                  <div className="form-group">
                    <label className="form-label form-label--required">Email Body Template</label>
                    <Textarea
                      rows={12}
                      className="escalation-textarea"
                      placeholder="Dear Team, please investigate case {caseNumber} immediately…"
                      value={templateBody}
                      onChange={(e) => setTemplateBody(e.target.value)}
                      id="input-template-body"
                    />
                    <div className="template-placeholders-hint">
                      <span>Supported placeholders (click to insert):</span>
                      {['{caseNumber}', '{customerName}', '{departmentName}', '{severity}'].map((tag) => (
                        <code key={tag} style={{ cursor: 'pointer' }} onClick={() => handleInsertPlaceholder(tag)} title={`Click to insert ${tag}`}>
                          {tag}
                        </code>
                      ))}
                    </div>
                  </div>

                  <div className="escalation-actions">
                    <Button
                      variant="primary"
                      isLoading={isSavingTemplate}
                      leftIcon={<CheckCircle2 size={15} />}
                      onClick={handleSaveEscalationTemplate}
                      id="btn-save-template"
                    >
                      Save Escalation Template
                    </Button>
                  </div>
                </div>

                <div className="template-list-wrapper">
                  <h3 className="template-list__title">Saved Templates</h3>
                  {isLoading ? (
                    <div className="config-card__loading"><Loader /></div>
                  ) : escalationTemplates.length === 0 ? (
                    <div className="master-card__empty">No escalation templates configured yet.</div>
                  ) : (
                    <div className="table-responsive">
                      <table className="field-table">
                        <thead>
                          <tr>
                            <th>DEPARTMENT</th>
                            <th>REASON</th>
                            <th>SUBJECT</th>
                            <th style={{ width: 110, textAlign: 'center' }}>ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {escalationTemplates.map((t) => (
                            <tr key={t.id}>
                              <td>{t.departmentName}</td>
                              <td>{t.escalationReason}</td>
                              <td className="template-subject-cell">{t.subjectTemplate}</td>
                              <td>
                                <div className="field-table__actions">
                                  <button className="btn-icon-neutral" onClick={() => handleEditTemplate(t)} title="Edit template" aria-label="Edit template">
                                    <Pencil size={14} />
                                  </button>
                                  <button className="btn-icon-danger" onClick={() => handleDeleteTemplate(t)} title="Delete template" aria-label="Delete template">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
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
            <button className={`config-section-tab ${activeSection === 'MasterLookups' ? 'config-section-tab--active' : ''}`} onClick={() => handleSectionClick('MasterLookups')} id="tab-master-lookups">Master Lookup Data</button>
          </div>

          <div className="config-settings-body">
            {activeSection === 'MasterLookups' ? (
              <div className="master-data-grid">
                {/* 1. PREFERRED LANGUAGE OPTIONS */}
                <div className="master-card">
                  <div>
                    <h3 className="master-card__title">Preferred Language Options</h3>
                    <p className="master-card__desc">
                      Single source of truth for Customer 360, Create Customer, and filter dropdowns. Search existing languages or add a new language.
                    </p>
                  </div>
                  <div className="master-card__form">
                    <div className="smart-dropdown-wrapper">
                      <div className="smart-dropdown-input-box">
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Search or add language (e.g. German)"
                          value={langSearch}
                          onChange={(e) => {
                            setLangSearch(e.target.value);
                            setIsLangDropdownOpen(true);
                          }}
                          onFocus={() => setIsLangDropdownOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (langSearch.trim() && !existingLangMatch) {
                                handleAddLookup('PREFERRED_LANGUAGE', langSearch, setLangSearch, 'Language');
                                setIsLangDropdownOpen(false);
                              }
                            }
                          }}
                          disabled={isPending('add:PREFERRED_LANGUAGE')}
                          id="input-search-add-language"
                        />
                        <ChevronDown size={16} className="smart-dropdown-icon" />
                      </div>

                      {isLangDropdownOpen && (
                        <div className="smart-dropdown-menu scrollbar-thin">
                          {filteredPredefinedLangs.map((item) => (
                            <div
                              key={item.id}
                              className="smart-dropdown-item"
                              onClick={() => {
                                setLangSearch(item.label || item.value);
                                setIsLangDropdownOpen(false);
                              }}
                            >
                              <span>{item.label || item.value}</span>
                              {!item.isActive && (
                                <span className="not-visible-badge">
                                  <EyeOff size={10} /> Not Visible
                                </span>
                              )}
                            </div>
                          ))}

                          {langSearch.trim() && !existingLangMatch && (
                            <div
                              className="smart-dropdown-add-item"
                              onClick={() => {
                                handleAddLookup('PREFERRED_LANGUAGE', langSearch, setLangSearch, 'Language');
                                setIsLangDropdownOpen(false);
                              }}
                            >
                              <Plus size={14} />
                              <span>Add "{langSearch.trim()}"</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="master-card__list scrollbar-thin">
                    {renderListState(languages.length === 0, 'No language options configured yet.') ||
                      languages.map((item) => (
                        <MasterItem
                          key={item.id}
                          fields={[{ key: 'value', placeholder: 'Language' }]}
                          initial={{ value: item.label || item.value }}
                          onSave={(values) => handleUpdateLookup(item, 'PREFERRED_LANGUAGE', values, 'Language')}
                          showDelete={false}
                          showVisibility={true}
                          isVisible={item.isActive}
                          onToggleVisibility={() => handleToggleVisibility(item, 'PREFERRED_LANGUAGE', 'Language')}
                          isTogglingVisibility={isPending(`toggle:${item.id}`)}
                        >
                          <span className="master-card__item-title">{item.label || item.value}</span>
                        </MasterItem>
                      ))}
                  </div>
                </div>

                {/* 2. HOME BRANCH LOCATIONS */}
                <div className="master-card">
                  <div>
                    <h3 className="master-card__title">Home Branch Locations</h3>
                    <p className="master-card__desc">
                      Branch directory lookup values for customer profiles. Search and select predefined branch locations from backend data.
                    </p>
                  </div>
                  <div className="master-card__form">
                    <div className="smart-dropdown-wrapper">
                      <div className="smart-dropdown-input-box">
                        <input
                          type="text"
                          className="input-field"
                          placeholder="Search or select branch (e.g. Subang Branch)"
                          value={branchSearch}
                          onChange={(e) => {
                            setBranchSearch(e.target.value);
                            setIsBranchDropdownOpen(true);
                          }}
                          onFocus={() => setIsBranchDropdownOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (branchSearch.trim() && !existingBranchMatch) {
                                handleAddLookup('HOME_BRANCH', branchSearch, setBranchSearch, 'Branch');
                                setIsBranchDropdownOpen(false);
                              }
                            }
                          }}
                          disabled={isPending('add:HOME_BRANCH')}
                          id="input-search-add-branch"
                        />
                        <ChevronDown size={16} className="smart-dropdown-icon" />
                      </div>

                      {isBranchDropdownOpen && (
                        <div className="smart-dropdown-menu scrollbar-thin">
                          {filteredPredefinedBranches.map((item) => (
                            <div
                              key={item.id}
                              className="smart-dropdown-item"
                              onClick={() => {
                                setBranchSearch(item.label || item.value);
                                setIsBranchDropdownOpen(false);
                              }}
                            >
                              <span>{item.label || item.value}</span>
                              {!item.isActive && (
                                <span className="not-visible-badge">
                                  <EyeOff size={10} /> Not Visible
                                </span>
                              )}
                            </div>
                          ))}

                          {branchSearch.trim() && !existingBranchMatch && (
                            <div
                              className="smart-dropdown-add-item"
                              onClick={() => {
                                handleAddLookup('HOME_BRANCH', branchSearch, setBranchSearch, 'Branch');
                                setIsBranchDropdownOpen(false);
                              }}
                            >
                              <Plus size={14} />
                              <span>Add "{branchSearch.trim()}"</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="master-card__list scrollbar-thin">
                    {renderListState(branches.length === 0, 'No branch locations configured yet.') ||
                      branches.map((item) => (
                        <MasterItem
                          key={item.id}
                          fields={[{ key: 'value', placeholder: 'Branch' }]}
                          initial={{ value: item.label || item.value }}
                          onSave={(values) => handleUpdateLookup(item, 'HOME_BRANCH', values, 'Branch')}
                          showDelete={false}
                          showVisibility={true}
                          isVisible={item.isActive}
                          onToggleVisibility={() => handleToggleVisibility(item, 'HOME_BRANCH', 'Branch')}
                          isTogglingVisibility={isPending(`toggle:${item.id}`)}
                        >
                          <span className="master-card__item-title">{item.label || item.value}</span>
                        </MasterItem>
                      ))}
                  </div>
                </div>

                {/* 3. CUSTOMER IDENTIFICATION (ID TYPES) */}
                <div className="master-card">
                  <div>
                    <h3 className="master-card__title">Customer Identification (ID Types)</h3>
                    <p className="master-card__desc">
                      Fixed predefined identification options controlled by the backend (NRIC Number, IC Number, Passport, etc.).
                    </p>
                  </div>
                  {/* NO ADD OPTION FORM OR BUTTON */}
                  <div className="master-card__list scrollbar-thin">
                    {renderListState(idTypes.length === 0, 'No identification options configured yet.') ||
                      idTypes.map((item) => (
                        <MasterItem
                          key={item.id}
                          fields={[{ key: 'value', placeholder: 'ID Type' }]}
                          initial={{ value: item.label || item.value }}
                          onSave={(values) => handleUpdateLookup(item, 'ID_TYPE', values, 'ID Type')}
                          showDelete={false}
                          showVisibility={true}
                          isVisible={item.isActive}
                          onToggleVisibility={() => handleToggleVisibility(item, 'ID_TYPE', 'ID Type')}
                          isTogglingVisibility={isPending(`toggle:${item.id}`)}
                        >
                          <span className="master-card__item-title">{item.label || item.value}</span>
                        </MasterItem>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              renderFieldCard(
                activeSection === 'AddNewCustomer'
                  ? 'Add New Customer Field Settings'
                  : activeSection === 'ExistingCustomer'
                    ? 'Existing Customer Search Settings'
                    : 'Customer 360 Filter Settings',
                activeSection !== 'Filters'
              )
            )}
          </div>
        </>
      )}

      {/* ADD / EDIT FIELD SIDE DRAWER */}
      <AddFieldModal
        isOpen={isFieldDrawerOpen}
        onClose={() => {
          setIsFieldDrawerOpen(false);
          setEditingField(null);
        }}
        onAdd={handleSubmitField}
        editingField={editingField}
        sectionKey={currentSectionKey}
        existingCount={fields.length}
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
      <UnsavedChangesModal
        isOpen={unsavedModal.isOpen}
        onStay={handleStayOnPage}
        onLeave={handleLeaveWithoutSaving}
        onSave={handleSaveAndLeave}
        changes={unsavedChangesList}
        isSaving={isSaving || isSavingSla}
      />
    </div>
  );
}

function NotificationRuleCard({ rule, onToggle, onSave }) {
  const [formData, setFormData] = useState({
    isEnabled: rule.isEnabled,
    priority: rule.priority || 'High',
    cooldownMinutes: rule.cooldownMinutes ?? 60,
    maxReminders: rule.maxReminders ?? 3,
    enableAggregation: rule.enableAggregation ?? true,
    aggregationThreshold: rule.aggregationThreshold ?? 3,
  });

  useEffect(() => {
    setFormData({
      isEnabled: rule.isEnabled,
      priority: rule.priority || 'High',
      cooldownMinutes: rule.cooldownMinutes ?? 60,
      maxReminders: rule.maxReminders ?? 3,
      enableAggregation: rule.enableAggregation ?? true,
      aggregationThreshold: rule.aggregationThreshold ?? 3,
    });
  }, [rule]);

  const handleChange = (field, val) => {
    setFormData((prev) => ({ ...prev, [field]: val }));
  };

  const getPriorityBadgeClass = (p) => {
    const prio = (p || 'High').toLowerCase();
    return `priority-pill priority-pill--${prio}`;
  };

  return (
    <div className="rule-card">
      <div>
        <div className="rule-card__header">
          <div className="rule-card__title-area">
            <Bell size={18} color={formData.isEnabled ? '#1d4ed8' : '#94a3b8'} />
            <div>
              <h3 className="rule-card__title">{rule.name}</h3>
              <span className="rule-card__badge">{rule.eventType}</span>
            </div>
          </div>

          <div className="rule-card__toggle-wrapper">
            <label className="toggle-switch" title="Enable or disable this rule" style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
              <input
                type="checkbox"
                checked={formData.isEnabled}
                onChange={onToggle}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span className="toggle-slider" style={{
                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: formData.isEnabled ? '#2563eb' : '#cbd5e1', transition: '0.2s', borderRadius: 20
              }} />
            </label>
            <span style={{ fontSize: '12px', fontWeight: 600, color: formData.isEnabled ? '#16a34a' : '#94a3b8' }}>
              {formData.isEnabled ? 'Active' : 'Disabled'}
            </span>
          </div>
        </div>

        <div className="rule-card__body-grid">
          <div className="rule-card__field">
            <span className="rule-card__field-label">Priority Level</span>
            <select
              className="rule-card__select"
              value={formData.priority}
              onChange={(e) => handleChange('priority', e.target.value)}
            >
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
              <option value="Info">Info</option>
            </select>
          </div>

          <div className="rule-card__field">
            <span className="rule-card__field-label">
              <Clock size={11} /> Cooldown (Mins)
            </span>
            <input
              type="number"
              className="rule-card__input"
              value={formData.cooldownMinutes}
              min="0"
              max="1440"
              onChange={(e) => handleChange('cooldownMinutes', Number(e.target.value))}
            />
          </div>

          <div className="rule-card__field">
            <span className="rule-card__field-label">Max Reminders</span>
            <input
              type="number"
              className="rule-card__input"
              value={formData.maxReminders}
              min="0"
              max="10"
              onChange={(e) => handleChange('maxReminders', Number(e.target.value))}
            />
            <span style={{ fontSize: '10.5px', color: '#64748b', marginTop: '2px', display: 'block' }}>
              Follow-up reminder alerts after initial breach
            </span>
          </div>

          <div className="rule-card__field">
            <span className="rule-card__field-label">Group Aggregation</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <input
                type="checkbox"
                id={`agg-${rule.id}`}
                checked={formData.enableAggregation}
                onChange={(e) => handleChange('enableAggregation', e.target.checked)}
              />
              <label htmlFor={`agg-${rule.id}`} style={{ fontSize: '11.5px', color: '#475569' }}>
                Thresh:
              </label>
              <input
                type="number"
                className="rule-card__input"
                style={{ width: 46, padding: '2px 4px', fontSize: '12px' }}
                value={formData.aggregationThreshold}
                min="1"
                max="50"
                onChange={(e) => handleChange('aggregationThreshold', Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rule-card__footer">
        <span className={getPriorityBadgeClass(formData.priority)}>
          Priority: {formData.priority}
        </span>
        <Button variant="primary" size="sm" onClick={() => onSave(formData)}>
          <Save size={13} /> Save Rule
        </Button>
      </div>
    </div>
  );
}

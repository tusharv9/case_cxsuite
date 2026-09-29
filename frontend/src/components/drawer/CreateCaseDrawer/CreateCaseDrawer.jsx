// ===== CREATE CASE DRAWER — OmniConnect Reference System =====

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, PlusCircle, UserCheck, UserPlus } from 'lucide-react';
import { Button } from '../../common/Button/Button.jsx';
import { Avatar } from '../../common/Avatar/Avatar.jsx';
import { Input, Textarea, Select } from '../../common/Input/Input.jsx';
import { caseService } from '../../../services/caseService.js';
import { customerService } from '../../../services/customerService.js';
import { departmentService } from '../../../services/departmentService.js';
import { configurableSettingsService } from '../../../services/configurableSettingsService.js';
import { slaRoutingService } from '../../../services/slaRoutingService.js';
import { useToast } from '../../../hooks/useToast.js';
import { getSlaConfig } from '../../../utils/slaUtils.js';
import { formatDate } from '../../../utils/dateUtils.js';
import { CreateCustomerDrawer } from '../CreateCustomerDrawer/CreateCustomerDrawer.jsx';
import { ExistingCustomerDrawer } from '../ExistingCustomerDrawer/ExistingCustomerDrawer.jsx';
import {
  SOURCE_CHANNEL_OPTIONS,
  PREFERRED_COMMUNICATION_CHANNEL_OPTIONS,
} from '../../../constants/index.js';
import './CreateCaseDrawer.css';

const DEFAULT_CREATE_CASE_FIELDS = [
  { apiField: 'caseType', displayLabel: 'Case Type', isVisible: true, isRequired: true, displayOrder: 1 },
  { apiField: 'title', displayLabel: 'Case Title', isVisible: true, isRequired: true, displayOrder: 2 },
  { apiField: 'description', displayLabel: 'Description', isVisible: true, isRequired: true, displayOrder: 3 },
  { apiField: 'selectCustomer', displayLabel: 'Select Customer', isVisible: true, isRequired: true, displayOrder: 4 },
  { apiField: 'departmentId', displayLabel: 'Department', isVisible: true, isRequired: true, displayOrder: 5 },
  { apiField: 'subCategory', displayLabel: 'Subcategory', isVisible: true, isRequired: false, displayOrder: 6 },
  { apiField: 'preferredLanguage', displayLabel: 'Preferred Language', isVisible: true, isRequired: false, displayOrder: 7 },
  { apiField: 'preferredCommunicationChannel', displayLabel: 'Preferred Communication Channel', isVisible: true, isRequired: false, displayOrder: 8 },
  { apiField: 'sourceChannel', displayLabel: 'Source Channel', isVisible: true, isRequired: true, displayOrder: 9 },
  { apiField: 'severity', displayLabel: 'Severity', isVisible: true, isRequired: true, displayOrder: 10 },
];

export function CreateCaseDrawer({ isOpen, onClose, onSuccess }) {
  const toast = useToast();

  const [form, setForm] = useState({
    caseType: 'Complaint',
    title: '',
    description: '',
    customerId: '',
    departmentId: '',
    subcategory: '',
    preferredLanguage: 'Bahasa Malaysia',
    preferredCommunicationChannel: 'Phone',
    sourceChannel: 'Voice',
    severity: 'Medium',
    slaTargetHours: '12',
  });

  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  // Dynamic Metadata States with Fallback Defaults
  const [fieldConfigs, setFieldConfigs] = useState(DEFAULT_CREATE_CASE_FIELDS);
  const [caseTypes, setCaseTypes] = useState([
    { code: 'Complaint', name: 'Complaint', prefix: 'C-' },
    { code: 'Service', name: 'Service', prefix: 'S-' },
    { code: 'Inquiry', name: 'Inquiry', prefix: 'I-' },
  ]);
  const [dbSubCategories, setDbSubCategories] = useState([]);
  const [languages, setLanguages] = useState([
    { value: 'Bahasa Malaysia', label: 'Bahasa Malaysia' },
    { value: 'English', label: 'English' },
    { value: 'Mandarin', label: 'Mandarin' },
    { value: 'Tamil', label: 'Tamil' },
  ]);
  const [channels, setChannels] = useState([
    { value: 'Phone', label: 'Phone' },
    { value: 'Email', label: 'Email' },
    { value: 'SMS', label: 'SMS' },
    { value: 'WhatsApp', label: 'WhatsApp' },
  ]);
  const [severities, setSeverities] = useState([]);
  const [categoryPriorityMap, setCategoryPriorityMap] = useState({});

  // Customer Mode & Selection States
  const [customerMode, setCustomerMode] = useState('existing'); // 'existing' | 'new'
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false);
  const [isExistingCustomerOpen, setIsExistingCustomerOpen] = useState(false);

  // Load dropdown data & metadata when drawer opens
  useEffect(() => {
    if (!isOpen) return;
    setDataLoading(true);

    Promise.all([
      departmentService.getAllDepartments(),
      configurableSettingsService.getFields('CaseManagement', 'CreateCase', true),
      configurableSettingsService.getCaseTypes(),
      configurableSettingsService.getSubCategories(),
      configurableSettingsService.getLookupValues('PREFERRED_LANGUAGE', true),
      configurableSettingsService.getLookupValues('COMMUNICATION_CHANNEL', true),
      configurableSettingsService.getSeverities(),
      slaRoutingService.getConfiguration().catch(() => null),
    ])
      .then(([d, fields, cts, subs, langs, chns, severityList, slaConfig]) => {
        setDepartments(d || []);

        const sortedFields = (fields || [])
          .filter((f) => f.isVisible !== false)
          .sort((a, b) => a.displayOrder - b.displayOrder);

        if (sortedFields && sortedFields.length > 0) {
          const normalized = sortedFields.map((f) => {
            if (f.apiField === 'communicationChannel') {
              return { ...f, apiField: 'preferredCommunicationChannel', displayLabel: 'Preferred Communication Channel' };
            }
            return f;
          });
          if (!normalized.some((f) => f.apiField === 'preferredCommunicationChannel')) {
            normalized.push({
              apiField: 'preferredCommunicationChannel',
              displayLabel: 'Preferred Communication Channel',
              isVisible: true,
              isRequired: false,
              displayOrder: 8,
            });
          }
          if (!normalized.some((f) => f.apiField === 'sourceChannel')) {
            normalized.push({
              apiField: 'sourceChannel',
              displayLabel: 'Source Channel',
              isVisible: true,
              isRequired: true,
              displayOrder: 9,
            });
          }
          normalized.sort((a, b) => a.displayOrder - b.displayOrder);
          setFieldConfigs(normalized);
        } else {
          setFieldConfigs(DEFAULT_CREATE_CASE_FIELDS);
        }

        if (cts && cts.length > 0) setCaseTypes(cts);
        if (subs) setDbSubCategories(subs);
        if (langs && langs.length > 0) setLanguages(langs);
        if (chns && chns.length > 0) setChannels(chns);
        if (severityList) setSeverities(severityList);

        if (slaConfig?.priorityRules) {
          const map = {};
          slaConfig.priorityRules.forEach((r) => {
            (r.appliedCategories || []).forEach((cat) => {
              if (cat) map[cat.trim().toLowerCase()] = r.priority;
            });
          });
          setCategoryPriorityMap(map);
        }
      })
      .catch((err) => {
        console.error('[CreateCaseDrawer Metadata Load Error]', err);
        setFieldConfigs(DEFAULT_CREATE_CASE_FIELDS);
      })
      .finally(() => setDataLoading(false));
  }, [isOpen]);

  // Reset form when drawer opens
  useEffect(() => {
    if (isOpen) {
      const defaultSeverity = severities.some((s) => s.name === 'Medium')
        ? 'Medium'
        : severities[0]?.name || 'Medium';
      const matchedDefault = severities.find((s) => s.name === defaultSeverity);
      const externalHours =
        matchedDefault && matchedDefault.externalHours > 0
          ? matchedDefault.externalHours
          : getSlaConfig(defaultSeverity).externalHours;
      setForm({
        caseType: caseTypes.length > 0 ? caseTypes[0].name : 'Complaint',
        title: '',
        description: '',
        customerId: '',
        departmentId: '',
        subcategory: '',
        preferredLanguage: languages.length > 0 ? languages[0].value : 'Bahasa Malaysia',
        preferredCommunicationChannel: 'Phone',
        sourceChannel: 'Voice',
        severity: defaultSeverity,
        slaTargetHours: String(externalHours),
      });
      setSelectedCustomer(null);
      setCustomerMode('existing');
      setErrors({});
    }
  }, [isOpen, caseTypes, languages, channels, severities]);

  // Update selected customer object whenever form.customerId is set
  useEffect(() => {
    if (form.customerId && (!selectedCustomer || String(selectedCustomer.id) !== String(form.customerId))) {
      customerService.getCustomer360(form.customerId).then((c) => {
        if (c) setSelectedCustomer(c);
      }).catch(() => {});
    }
  }, [form.customerId, selectedCustomer]);

  // Dynamic Available Subcategories based on selected Department
  const availableSubcategories = useMemo(() => {
    if (!form.departmentId) return [];
    const matched = dbSubCategories
      .filter((s) => String(s.departmentId) === String(form.departmentId) && s.isActive !== false)
      .map((s) => s.name);

    if (matched.length > 0) return matched;

    return ['General Request', 'Issue Escalation', 'Information Update'];
  }, [dbSubCategories, form.departmentId]);

  const handleDepartmentChange = (e) => {
    const newDeptId = e.target.value;
    setForm((prev) => ({
      ...prev,
      departmentId: newDeptId,
      subcategory: '',
    }));
    setErrors((prev) => ({ ...prev, departmentId: undefined, subcategory: undefined }));
  };

  const handleSubcategoryChange = (e) => {
    const chosenSubcat = e.target.value;
    setForm((prev) => {
      const updated = { ...prev, subcategory: chosenSubcat };
      const mappedPriority = categoryPriorityMap[chosenSubcat?.trim().toLowerCase()];
      if (mappedPriority) {
        updated.severity = mappedPriority;
        const matched = severities.find((s) => s.name.toLowerCase() === mappedPriority.toLowerCase());
        const hours = matched && matched.externalHours > 0 ? matched.externalHours : getSlaConfig(mappedPriority).externalHours;
        updated.slaTargetHours = String(hours);
      }
      return updated;
    });
    setErrors((prev) => ({ ...prev, subcategory: undefined, severity: undefined }));
  };

  const handleSeverityChange = (e) => {
    const newSeverity = e.target.value;
    const matched = severities.find((s) => s.name.toLowerCase() === newSeverity.toLowerCase());
    const hours = matched && matched.externalHours > 0 ? matched.externalHours : getSlaConfig(newSeverity).externalHours;

    setForm((prev) => ({
      ...prev,
      severity: newSeverity,
      slaTargetHours: String(hours),
    }));
    setErrors((prev) => ({ ...prev, severity: undefined }));
  };

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  // Handle New Customer Creation inside Create Case
  const handleNewCustomerCreated = (newCustomer) => {
    if (newCustomer && newCustomer.id) {
      setCustomers((prev) => [newCustomer, ...prev]);
      setSelectedCustomer(newCustomer);
      setForm((prev) => ({ ...prev, customerId: newCustomer.id }));
      setErrors((prev) => ({ ...prev, customerId: undefined }));
      setCustomerMode('existing');
    }
    setIsCreateCustomerOpen(false);
  };

  // Handle Existing Customer Search selection
  const handleExistingCustomerSelected = (foundCustomer) => {
    if (foundCustomer && foundCustomer.id) {
      setCustomers((prev) => (prev.some((c) => c.id === foundCustomer.id) ? prev : [foundCustomer, ...prev]));
      setSelectedCustomer(foundCustomer);
      setForm((prev) => ({ ...prev, customerId: foundCustomer.id }));
      setErrors((prev) => ({ ...prev, customerId: undefined }));
    }
    setIsExistingCustomerOpen(false);
  };

  const validate = () => {
    const e = {};

    // System invariants
    if (!form.customerId) {
      e.customerId = 'Please select a customer.';
    }
    if (!form.departmentId) {
      e.departmentId = 'Please select a department.';
    }

    // Metadata-driven field validation
    fieldConfigs.forEach((cfg) => {
      if (cfg.isVisible === false) return;

      const fieldKey = cfg.apiField;
      const label = cfg.displayLabel || fieldKey;
      let val = form[fieldKey];

      if (fieldKey === 'selectCustomer') {
        if (cfg.isRequired && !form.customerId) {
          e.customerId = `${label} is required.`;
        }
        return;
      }
      if (fieldKey === 'subCategory') {
        val = form.subcategory;
      }

      const strVal = typeof val === 'string' ? val.trim() : (val != null ? String(val) : '');

      if (cfg.isRequired && !strVal) {
        e[fieldKey] = `${label} is required.`;
        return;
      }

      if (strVal) {
        if (cfg.minLength && strVal.length < cfg.minLength) {
          e[fieldKey] = `${label} must be at least ${cfg.minLength} characters.`;
          return;
        }
        if (cfg.maxLength && strVal.length > cfg.maxLength) {
          e[fieldKey] = `${label} cannot exceed ${cfg.maxLength} characters.`;
          return;
        }
        if (cfg.validationRegex) {
          try {
            const rx = new RegExp(cfg.validationRegex);
            if (!rx.test(strVal)) {
              e[fieldKey] = `${label} format is invalid.`;
              return;
            }
          } catch (regexErr) {
            console.warn(`Invalid regex on field ${fieldKey}:`, regexErr);
          }
        }
      }
    });

    if (form.slaTargetHours && (isNaN(Number(form.slaTargetHours)) || Number(form.slaTargetHours) < 1)) {
      e.slaTargetHours = 'Please enter a valid SLA target (hours).';
    }

    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    setIsLoading(true);
    try {
      await caseService.createCase({
        title: form.title.trim(),
        description: form.description.trim(),
        customerId: form.customerId,
        departmentId: form.departmentId,
        severity: form.severity,
        slaTargetHours: Number(form.slaTargetHours),
        caseType: form.caseType,
        subcategory: form.subcategory,
        preferredLanguage: form.preferredLanguage,
        preferredCommunicationChannel: form.preferredCommunicationChannel,
        sourceChannel: form.sourceChannel,
        communicationChannel: form.sourceChannel,
      });
      toast.success('Case created successfully.');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to create case.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  // Render form field based on configuration
  const renderConfiguredField = (fieldConfig) => {
    const key = fieldConfig.apiField;
    const label = fieldConfig.displayLabel || key;
    const isRequired = fieldConfig.isRequired;
    const isEditable = fieldConfig.isEditable !== false;

    if (key === 'caseType') {
      return (
        <Select
          key={key}
          label={label}
          required={isRequired}
          disabled={!isEditable}
          value={form.caseType}
          onChange={set('caseType')}
          error={errors.caseType}
        >
          <option value="">Select Case Type…</option>
          {caseTypes.map((c) => (
            <option key={c.id || c.code} value={c.name}>{c.name} ({c.prefix})</option>
          ))}
        </Select>
      );
    }

    if (key === 'title') {
      return (
        <Input
          key={key}
          label={label}
          required={isRequired}
          disabled={!isEditable}
          placeholder="e.g. PF-i monthly deduction dispute"
          value={form.title}
          onChange={set('title')}
          error={errors.title}
        />
      );
    }

    if (key === 'description') {
      return (
        <Textarea
          key={key}
          label={label}
          required={isRequired}
          disabled={!isEditable}
          placeholder="Describe the issue in detail…"
          value={form.description}
          onChange={set('description')}
          rows={4}
        />
      );
    }

    if (key === 'selectCustomer') {
      return (
        <div key={key} className="customer-section-group">
          <label className={`form-label ${isRequired ? 'form-label--required' : ''}`}>{label}</label>
          <div className="customer-mode-toggle">
            <button
              type="button"
              className={`customer-mode-btn ${customerMode === 'existing' ? 'customer-mode-btn--active' : ''}`}
              onClick={() => {
                setCustomerMode('existing');
                setIsExistingCustomerOpen(true);
              }}
            >
              <UserCheck size={14} />
              <span>Existing Customer</span>
            </button>

            <button
              type="button"
              className={`customer-mode-btn ${customerMode === 'new' ? 'customer-mode-btn--active' : ''}`}
              onClick={() => {
                setCustomerMode('new');
                setIsCreateCustomerOpen(true);
              }}
            >
              <UserPlus size={14} />
              <span>+ New Customer</span>
            </button>
          </div>

          {selectedCustomer ? (
            <div className="selected-customer-card">
              <div className="selected-customer-card__left">
                <Avatar name={selectedCustomer.fullName} size="md" />
                <div className="selected-customer-card__details">
                  <p className="selected-customer-card__name">{selectedCustomer.fullName}</p>
                  <p className="selected-customer-card__meta">
                    NRIC: {selectedCustomer.nric || '—'} &middot; Phone: {selectedCustomer.phoneNumber || '—'}
                  </p>
                  <p className="selected-customer-card__submeta">
                    {selectedCustomer.dateOfBirth ? `DOB: ${formatDate(selectedCustomer.dateOfBirth)} · ` : ''}
                    Branch: {selectedCustomer.branch || 'Kepong Branch'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="selected-customer-card__change-btn"
                onClick={() => {
                  setSelectedCustomer(null);
                  setForm((prev) => ({ ...prev, customerId: '' }));
                }}
              >
                Change
              </button>
            </div>
          ) : (
            errors.customerId && <span className="form-error">{errors.customerId}</span>
          )}
        </div>
      );
    }

    if (key === 'departmentId') {
      return (
        <Select
          key={key}
          label={label}
          required={isRequired}
          disabled={!isEditable}
          value={form.departmentId}
          onChange={handleDepartmentChange}
          error={errors.departmentId}
        >
          <option value="">Select department…</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      );
    }

    if (key === 'subCategory') {
      return (
        <Select
          key={key}
          label={label}
          required={isRequired}
          disabled={!isEditable || !form.departmentId}
          value={form.subcategory}
          onChange={handleSubcategoryChange}
          error={errors.subcategory}
        >
          <option value="">
            {!form.departmentId ? 'Select department first…' : 'Select subcategory…'}
          </option>
          {availableSubcategories.map((sub) => (
            <option key={sub} value={sub}>{sub}</option>
          ))}
        </Select>
      );
    }

    if (key === 'preferredLanguage') {
      return (
        <Select
          key={key}
          label={label}
          required={isRequired}
          disabled={!isEditable}
          value={form.preferredLanguage}
          onChange={set('preferredLanguage')}
        >
          {languages.map((o) => (
            <option key={o.id || o.value} value={o.value}>{o.label || o.value}</option>
          ))}
        </Select>
      );
    }

    if (key === 'preferredCommunicationChannel' || key === 'communicationChannel') {
      return (
        <Select
          key={key}
          label="Preferred Communication Channel"
          required={isRequired}
          disabled={!isEditable}
          value={form.preferredCommunicationChannel}
          onChange={set('preferredCommunicationChannel')}
        >
          {PREFERRED_COMMUNICATION_CHANNEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      );
    }

    if (key === 'sourceChannel') {
      return (
        <Select
          key={key}
          label="Source Channel"
          required={isRequired}
          disabled={!isEditable}
          value={form.sourceChannel}
          onChange={set('sourceChannel')}
          error={errors.sourceChannel}
        >
          {SOURCE_CHANNEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      );
    }

    if (key === 'severity') {
      const hasAutoPriority = Boolean(categoryPriorityMap[form.subcategory?.trim().toLowerCase()]);
      return (
        <div key={key}>
          <Select
            label={label}
            required={isRequired}
            disabled={!isEditable}
            value={form.severity}
            onChange={handleSeverityChange}
            error={errors.severity}
          >
            {(severities.length > 0 ? severities.map((s) => s.name) : ['Low', 'Medium', 'High', 'Critical']).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          {hasAutoPriority && (
            <div style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>• Priority automatically assigned based on Category SLA policy</span>
            </div>
          )}
        </div>
      );
    }

    return (
      <Input
        key={key}
        label={label}
        required={isRequired}
        disabled={!isEditable}
        placeholder={`Enter ${label}…`}
        value={form[key] || ''}
        onChange={set(key)}
      />
    );
  };

  return createPortal(
    <>
      <div className="create-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside
        className="create-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Create new case"
      >
        {/* Header */}
        <div className="create-drawer__header">
          <div className="create-drawer__header-content">
            <h2>Create New Case</h2>
            <p>Fill in the required fields to open a case</p>
          </div>
          <button className="create-drawer__close" onClick={onClose} aria-label="Close drawer">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="create-drawer__body scrollbar-thin">
          {(fieldConfigs && fieldConfigs.length > 0 ? fieldConfigs : DEFAULT_CREATE_CASE_FIELDS).map(renderConfiguredField)}
        </div>

        {/* Footer */}
        <div className="create-drawer__footer">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            className="create-drawer__submit"
            variant="primary"
            isLoading={isLoading}
            leftIcon={<PlusCircle size={15} />}
            onClick={handleSubmit}
          >
            Create Case
          </Button>
        </div>
      </aside>

      {/* Stacked Create Customer Drawer overlay */}
      {isCreateCustomerOpen && (
        <CreateCustomerDrawer
          isOpen={isCreateCustomerOpen}
          onClose={() => setIsCreateCustomerOpen(false)}
          onSuccess={handleNewCustomerCreated}
        />
      )}

      {/* Stacked Existing Customer Search Drawer overlay */}
      {isExistingCustomerOpen && (
        <ExistingCustomerDrawer
          isOpen={isExistingCustomerOpen}
          onClose={() => setIsExistingCustomerOpen(false)}
          onCustomerFound={handleExistingCustomerSelected}
        />
      )}
    </>,
    document.body
  );
}

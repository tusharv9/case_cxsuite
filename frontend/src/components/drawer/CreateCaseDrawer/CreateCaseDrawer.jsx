// ===== CREATE CASE DRAWER =====
// Everything about this form comes from configuration, loaded in ONE request (/api/metadata/case-form):
//   * which fields exist, their order, labels, types, whether they are required, and their validation rules
//   * the options of every dropdown (case types, departments + sub-categories, priorities, configured lists)
// The priority is decided by the server: a sub-category with a configured priority locks it; otherwise the user
// chooses. Nothing here is hard-coded to particular field names, lists or priorities — an administrator-defined
// custom field appears, validates and is submitted without any code change.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { PlusCircle, UserCheck, UserPlus } from 'lucide-react';
import { Button } from '../../common/Button/Button.jsx';
import { SideDrawer } from '../../common/SideDrawer/SideDrawer.jsx';
import { Avatar } from '../../common/Avatar/Avatar.jsx';
import { Loader, ErrorState } from '../../common/Loader/Loader.jsx';
import { DynamicField } from '../../common/DynamicField/DynamicField.jsx';
import { caseService } from '../../../services/caseService.js';
import { customerService } from '../../../services/customerService.js';
import { metadataService } from '../../../services/metadataService.js';
import { slaRoutingService } from '../../../services/slaRoutingService.js';
import { useToast } from '../../../hooks/useToast.js';
import { formatDate } from '../../../utils/dateUtils.js';
import { validateFields, isFieldVisible, isFieldRequired } from '../../../utils/fieldValidation.js';
import { fieldErrorsFromError } from '../../../utils/serverErrors.js';
import { CreateCustomerDrawer } from '../CreateCustomerDrawer/CreateCustomerDrawer.jsx';
import { ExistingCustomerDrawer } from '../ExistingCustomerDrawer/ExistingCustomerDrawer.jsx';
import './CreateCaseDrawer.css';

// Keys of the built-in fields the submit payload maps explicitly; every other configured field is a custom field.
const BUILT_IN = new Set([
  'caseType', 'title', 'description', 'selectCustomer', 'departmentId', 'subCategory',
  'preferredLanguage', 'preferredCommunicationChannel', 'communicationChannel', 'sourceChannel', 'severity',
]);

function customerIdLabel(customer) {
  if (!customer) return 'ID';
  const type = (customer.idType || '').toLowerCase();
  if (type.includes('passport')) return 'Passport';
  if (type.includes('account')) return 'Account No';
  return 'NRIC';
}

function customerIdValue(customer) {
  if (!customer) return '—';
  if (customer.idValue) return customer.idValue;
  return customer.nric || customer.passport || customer.accountNumber || '—';
}

export function CreateCaseDrawer({ isOpen, onClose, onSuccess }) {
  const toast = useToast();

  const [meta, setMeta] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);

  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);   // the person has entered something (so closing should ask)

  // What the server says the priority would be for the chosen department + sub-category.
  const [priorityInfo, setPriorityInfo] = useState({ isMapped: false });
  const resolveSeq = useRef(0);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerMode, setCustomerMode] = useState('existing');
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false);
  const [isExistingCustomerOpen, setIsExistingCustomerOpen] = useState(false);

  // ---- Load the form's metadata whenever the drawer opens ----------------------------------------------------
  const loadMetadata = useCallback(() => {
    setIsLoadingMeta(true);
    setLoadError(null);
    metadataService
      .getCaseForm()
      .then((data) => {
        setMeta(data);

        // Start from blanks. A required dropdown with options is pre-selected with its first option, purely as a
        // convenience; an optional one starts empty.
        const initial = {};
        for (const field of data.fields) {
          if (!isFieldVisible(field)) continue;
          initial[field.apiField] = '';
        }
        for (const field of data.fields) {
          if (!isFieldVisible(field) || !isFieldRequired(field)) continue;
          if (field.apiField === 'caseType' && data.caseTypes.length > 0) initial.caseType = data.caseTypes[0].name;
          else if (field.lookupTypeCode && (data.lookups[field.lookupTypeCode] || []).length > 0) {
            initial[field.apiField] = data.lookups[field.lookupTypeCode][0].value;
          }
        }
        setValues(initial);
      })
      .catch((err) => setLoadError(err.message || 'The form could not be loaded.'))
      .finally(() => setIsLoadingMeta(false));
  }, []);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setErrors({});
      setTouched(false);
      setSelectedCustomer(null);
      setCustomerMode('existing');
      setPriorityInfo({ isMapped: false });
      loadMetadata();
    }
    wasOpen.current = isOpen;
  }, [isOpen, loadMetadata]);

  // ---- Priority: ask the server what the chosen sub-category maps to -----------------------------------------
  const departmentId = values.departmentId || '';
  const subCategory = values.subCategory || '';

  useEffect(() => {
    if (!isOpen) return;
    const seq = ++resolveSeq.current;
    if (!departmentId || !subCategory) {
      setPriorityInfo({ isMapped: false });
      return;
    }
    slaRoutingService
      .resolvePriority(departmentId, subCategory)
      .then((info) => {
        if (seq !== resolveSeq.current) return;   // a newer choice superseded this answer
        setPriorityInfo(info);
        if (info.isMapped) {
          setValues((prev) => ({ ...prev, severity: info.priority }));
          setErrors((prev) => ({ ...prev, severity: undefined }));
        }
      })
      .catch(() => seq === resolveSeq.current && setPriorityInfo({ isMapped: false }));
  }, [isOpen, departmentId, subCategory]);

  // ---- Derived lists -------------------------------------------------------------------------------------------
  const visibleFields = useMemo(
    () => (meta?.fields || []).filter(isFieldVisible).sort((a, b) => a.displayOrder - b.displayOrder),
    [meta]
  );

  const departments = meta?.departments || [];
  const usableDepartments = departments.filter((d) => d.subCategories.length > 0);
  const hiddenDepartments = departments.length - usableDepartments.length;
  const selectedDepartment = departments.find((d) => d.id === departmentId);

  const optionsFor = useCallback(
    (field) => {
      switch (field.apiField) {
        case 'caseType': return (meta?.caseTypes || []).map((c) => ({ value: c.name, label: `${c.name} (${c.prefix})` }));
        case 'departmentId': return usableDepartments.map((d) => ({ value: d.id, label: d.name }));
        case 'subCategory': return (selectedDepartment?.subCategories || []).map((s) => ({ value: s.name, label: s.name }));
        case 'severity': return (meta?.priorities || []).map((p) => ({ value: p.name, label: p.name }));
        default: return field.lookupTypeCode ? meta?.lookups?.[field.lookupTypeCode] || [] : [];
      }
    },
    [meta, usableDepartments, selectedDepartment]
  );

  // ---- Editing -------------------------------------------------------------------------------------------------
  const setValue = (apiField, value) => {
    setTouched(true);
    setValues((prev) => {
      const next = { ...prev, [apiField]: value };
      if (apiField === 'departmentId') {
        next.subCategory = '';                                  // sub-categories belong to a department
        if (priorityInfo.isMapped) next.severity = '';           // the locked priority belonged to the old choice
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, [apiField]: undefined }));
  };

  const priorityLocked = priorityInfo.isMapped;
  const skipRequired = useMemo(() => new Set(['severity']), []);   // handled below: required only when not mapped

  const validate = () => {
    const found = validateFields(visibleFields, (f) => (f.apiField === 'selectCustomer' ? values.selectCustomer : values[f.apiField]), optionsFor, skipRequired);

    if (!priorityLocked && !values.severity) {
      found.severity = 'Priority is required: this sub-category has no configured priority, so choose one.';
    }
    return found;
  };

  // ---- Customer selection --------------------------------------------------------------------------------------
  const chooseCustomer = (customer) => {
    if (customer?.id) {
      setSelectedCustomer(customer);
      setValue('selectCustomer', customer.id);
    }
  };

  // Keep the selected-customer card in sync if only an id is known.
  useEffect(() => {
    const id = values.selectCustomer;
    if (id && (!selectedCustomer || String(selectedCustomer.id) !== String(id))) {
      customerService.getCustomer360(id).then((c) => c && setSelectedCustomer(c)).catch(() => {});
    }
  }, [values.selectCustomer, selectedCustomer]);

  // ---- Submit --------------------------------------------------------------------------------------------------
  const handleSubmit = async () => {
    const found = validate();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    const customAttributes = {};
    for (const field of visibleFields) {
      if (BUILT_IN.has(field.apiField)) continue;
      const v = values[field.apiField];
      if (v !== undefined && v !== null && String(v).trim() !== '') customAttributes[field.apiField] = String(v).trim();
    }

    setIsSubmitting(true);
    try {
      await caseService.createCase({
        title: (values.title || '').trim(),
        description: (values.description || '').trim(),
        customerId: values.selectCustomer || '',
        departmentId: values.departmentId || '',
        subcategory: values.subCategory || '',
        caseType: values.caseType || '',
        severity: values.severity || '',                      // the server applies the sub-category's priority if it has one
        preferredLanguage: values.preferredLanguage || '',
        preferredCommunicationChannel: values.preferredCommunicationChannel ?? values.communicationChannel ?? '',
        sourceChannel: values.sourceChannel || '',
        customAttributes: Object.keys(customAttributes).length > 0 ? customAttributes : undefined,
      });
      toast.success('Case created successfully.');
      onSuccess?.();
      onClose();
    } catch (err) {
      // Show each failing field next to its control; fall back to a toast when the error is not field-specific.
      const fieldErrors = fieldErrorsFromError(err);
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
        toast.error(err.message || 'Please correct the highlighted fields.');
      } else {
        toast.error(err.message || 'Failed to create case.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // ---- Rendering -----------------------------------------------------------------------------------------------
  const renderField = (field) => {
    const key = field.apiField;
    const label = field.displayLabel || key;

    if (key === 'selectCustomer') {
      return (
        <div key={key} className="customer-section-group">
          <label className={`form-label ${isFieldRequired(field) ? 'form-label--required' : ''}`}>{label}</label>
          <div className="customer-mode-toggle">
            <button
              type="button"
              className={`customer-mode-btn ${customerMode === 'existing' ? 'customer-mode-btn--active' : ''}`}
              onClick={() => { setCustomerMode('existing'); setIsExistingCustomerOpen(true); }}
            >
              <UserCheck size={14} />
              <span>Existing Customer</span>
            </button>
            <button
              type="button"
              className={`customer-mode-btn ${customerMode === 'new' ? 'customer-mode-btn--active' : ''}`}
              onClick={() => { setCustomerMode('new'); setIsCreateCustomerOpen(true); }}
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
                    {customerIdLabel(selectedCustomer)}: {customerIdValue(selectedCustomer)} &middot; Phone: {selectedCustomer.phoneNumber || '—'}
                  </p>
                  <p className="selected-customer-card__submeta">
                    {selectedCustomer.dateOfBirth ? `DOB: ${formatDate(selectedCustomer.dateOfBirth)} · ` : ''}
                    Branch: {selectedCustomer.branch || '—'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="selected-customer-card__change-btn"
                onClick={() => { setSelectedCustomer(null); setValue('selectCustomer', ''); }}
              >
                Change
              </button>
            </div>
          ) : (
            errors.selectCustomer && <span className="form-error">{errors.selectCustomer}</span>
          )}
        </div>
      );
    }

    if (key === 'departmentId') {
      return (
        <DynamicField
          key={key}
          config={field}
          value={values.departmentId}
          options={optionsFor(field)}
          onChange={(v) => setValue('departmentId', v)}
          error={errors.departmentId}
          helperText={hiddenDepartments > 0
            ? `${hiddenDepartments} department${hiddenDepartments > 1 ? 's are' : ' is'} not listed: no sub-categories are configured for ${hiddenDepartments > 1 ? 'them' : 'it'} yet.`
            : undefined}
        />
      );
    }

    if (key === 'subCategory') {
      return (
        <DynamicField
          key={key}
          config={field}
          value={values.subCategory}
          options={optionsFor(field)}
          disabled={!departmentId}
          placeholder={!departmentId ? 'Select department first…' : undefined}
          onChange={(v) => setValue('subCategory', v)}
          error={errors.subCategory}
        />
      );
    }

    if (key === 'severity') {
      const chosen = (meta?.priorities || []).find((p) => p.name === values.severity);
      return (
        <DynamicField
          key={key}
          config={{ ...field, isRequired: !priorityLocked }}
          value={values.severity}
          options={optionsFor(field)}
          disabled={priorityLocked}
          onChange={(v) => setValue('severity', v)}
          error={errors.severity}
          helperText={
            priorityLocked ? (
              <span className="priority-lock-helper-text">
                <span className="priority-lock-icon" aria-hidden="true">🔒</span>
                <span>
                  Priority set to <strong>{priorityInfo.priority}</strong> by this sub-category's SLA policy
                  {priorityInfo.externalHours ? ` (resolution target ${priorityInfo.externalHours}h)` : ''}
                </span>
              </span>
            ) : chosen ? `Resolution target ${chosen.externalHours}h` : null
          }
        />
      );
    }

    return (
      <DynamicField
        key={key}
        config={field}
        value={values[key]}
        options={optionsFor(field)}
        multiline={key === 'description'}
        onChange={(v) => setValue(key, v)}
        error={errors[key]}
      />
    );
  };

  return (
    <>
      <SideDrawer
        isOpen={isOpen}
        onClose={onClose}
        isDirty={touched && !isSubmitting}
        escapeEnabled={!isCreateCustomerOpen && !isExistingCustomerOpen}
        title="Create New Case"
        subtitle="Fill in the required fields to open a case"
        ariaLabel="Create new case"
        footer={({ requestClose }) => (
          <>
            <Button variant="ghost" onClick={requestClose}>Cancel</Button>
            <Button
              className="create-drawer__submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={!meta || Boolean(loadError)}
              leftIcon={<PlusCircle size={15} />}
              onClick={handleSubmit}
            >
              Create Case
            </Button>
          </>
        )}
      >
        {isLoadingMeta && <Loader text="Loading form…" />}
        {loadError && <ErrorState title="Couldn't load the form" message={loadError} onRetry={loadMetadata} />}
        {!isLoadingMeta && !loadError && meta && visibleFields.map(renderField)}
      </SideDrawer>

      {isCreateCustomerOpen && (
        <CreateCustomerDrawer
          isOpen={isCreateCustomerOpen}
          onClose={() => setIsCreateCustomerOpen(false)}
          onSuccess={(customer) => { chooseCustomer(customer); setCustomerMode('existing'); setIsCreateCustomerOpen(false); }}
        />
      )}

      {isExistingCustomerOpen && (
        <ExistingCustomerDrawer
          isOpen={isExistingCustomerOpen}
          onClose={() => setIsExistingCustomerOpen(false)}
          onCustomerFound={(customer) => { chooseCustomer(customer); setIsExistingCustomerOpen(false); }}
        />
      )}
    </>
  );
}

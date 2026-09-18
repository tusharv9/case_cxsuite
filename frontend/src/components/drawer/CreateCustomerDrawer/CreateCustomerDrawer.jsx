// ===== CREATE CUSTOMER DRAWER =====

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus } from 'lucide-react';
import { Button } from '../../common/Button/Button.jsx';
import { Input, Select, Checkbox } from '../../common/Input/Input.jsx';
import { customerService } from '../../../services/customerService.js';
import { configurableSettingsService } from '../../../services/configurableSettingsService.js';
import { useToast } from '../../../hooks/useToast.js';
import '../CreateCaseDrawer/CreateCaseDrawer.css';

export function CreateCustomerDrawer({ isOpen, onClose, onSuccess }) {
  const toast = useToast();

  const [fieldConfigs, setFieldConfigs] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [branches, setBranches] = useState([]);
  const [idTypes, setIdTypes] = useState(['NRIC Number', 'IC Number', 'ID Number', 'Passport', 'Account Number']);
  // Options for custom dropdown fields, keyed by the master lookup code chosen for the field
  const [customLookups, setCustomLookups] = useState({});

  const [form, setForm] = useState({
    fullName: '',
    idType: 'NRIC Number',
    nric: '',
    dateOfBirth: '',
    phoneNumber: '',
    email: '',
    branch: '',
    customerSegment: 'Mass Retail',
    preferredLanguage: '',
    customFields: {},
  });

  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadMetadata() {
      try {
        const [fieldsData, langsData, branchData, idTypeData] = await Promise.all([
          configurableSettingsService.getFields('Customer360', 'AddNewCustomer', true),
          configurableSettingsService.getLookupValues('PREFERRED_LANGUAGE', true),
          configurableSettingsService.getLookupValues('HOME_BRANCH', true),
          configurableSettingsService.getLookupValues('ID_TYPE', true),
        ]);

        if (!isMounted) return;

        const sortedFields = (fieldsData || [])
          .filter((f) => f.isVisible !== false)
          .sort((a, b) => a.displayOrder - b.displayOrder);

        setFieldConfigs(sortedFields);

        const activeLangs = (langsData || []).map((l) => l.value);
        const activeBranches = (branchData || []).map((b) => b.value);
        const activeIdTypes = (idTypeData || []).map((i) => i.value);

        if (activeLangs.length > 0) setLanguages(activeLangs);
        if (activeBranches.length > 0) setBranches(activeBranches);
        if (activeIdTypes.length > 0) setIdTypes(activeIdTypes);

        setForm((prev) => ({
          ...prev,
          preferredLanguage: prev.preferredLanguage || activeLangs[0] || 'Bahasa Malaysia',
          branch: prev.branch || activeBranches[0] || 'KL HQ',
          idType: prev.idType || (activeIdTypes.length > 0 ? activeIdTypes[0] : 'NRIC Number'),
        }));

        // A custom dropdown field is bound to whichever master lookup the administrator picked,
        // so those lists are fetched by code rather than defaulting to the language list.
        const codes = [
          ...new Set(
            sortedFields
              .filter((f) => f.fieldType === 'Dropdown' && f.lookupTypeCode)
              .map((f) => f.lookupTypeCode)
          ),
        ];
        const preloaded = {
          PREFERRED_LANGUAGE: activeLangs,
          HOME_BRANCH: activeBranches,
          ID_TYPE: activeIdTypes,
        };
        const missing = codes.filter((c) => !preloaded[c]);
        const fetched = await Promise.all(
          missing.map((c) =>
            configurableSettingsService.getLookupValues(c, true).catch(() => [])
          )
        );
        if (!isMounted) return;
        setCustomLookups({
          ...preloaded,
          ...Object.fromEntries(missing.map((c, i) => [c, (fetched[i] || []).map((v) => v.value)])),
        });
      } catch (err) {
        console.error('Failed to load field configurations:', err);
      }
    }

    loadMetadata();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const setCore = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const setCustom = (apiField) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({
      ...prev,
      customFields: { ...prev.customFields, [apiField]: val },
    }));
    setErrors((prev) => ({ ...prev, [apiField]: undefined }));
  };

  const validate = () => {
    const e = {};

    fieldConfigs.forEach((f) => {
      const fieldKey = f.apiField;
      const isCore = ['fullName', 'idType', 'idValue', 'nric', 'dateOfBirth', 'phoneNumber', 'email', 'preferredLanguage', 'branch'].includes(fieldKey);
      const val = isCore ? (fieldKey === 'idValue' ? form.nric : form[fieldKey]) : form.customFields[fieldKey];

      // Required check
      if (f.isRequired && (!val || (typeof val === 'string' && !val.trim()))) {
        e[fieldKey] = `${f.displayLabel || fieldKey} is required.`;
      } else if (f.validationRegex && val && typeof val === 'string') {
        // Regex check
        try {
          const reg = new RegExp(f.validationRegex);
          if (!reg.test(val.trim())) {
            e[fieldKey] = `${f.displayLabel || fieldKey} is invalid format.`;
          }
        } catch (err) {
          // fallback if regex is malformed
        }
      }
    });

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
      const customAttributesMap = {};
      Object.entries(form.customFields).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          customAttributesMap[k] = String(v);
        }
      });

      const newCustomer = await customerService.createCustomer({
        fullName: form.fullName.trim(),
        nric: form.nric.trim(),
        dateOfBirth: form.dateOfBirth ? new Date(form.dateOfBirth).toISOString() : undefined,
        phoneNumber: form.phoneNumber.trim(),
        email: form.email.trim() || undefined,
        branch: form.branch,
        customerSegment: form.customerSegment,
        preferredLanguage: form.preferredLanguage,
        customAttributes: Object.keys(customAttributesMap).length > 0 ? customAttributesMap : undefined,
      });

      toast.success('Customer added successfully.');
      onSuccess?.(newCustomer);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to add customer.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  // Helper to render individual field dynamically based on metadata
  const renderField = (fieldConfig) => {
    const key = fieldConfig.apiField;
    const label = fieldConfig.displayLabel || key;
    const isRequired = fieldConfig.isRequired;
    const isEditable = fieldConfig.isEditable !== false;

    if (key === 'fullName') {
      return (
        <Input
          key={key}
          label={label}
          required={isRequired}
          disabled={!isEditable}
          placeholder="e.g. Siti Nurhaliza"
          value={form.fullName}
          onChange={setCore('fullName')}
          error={errors.fullName}
        />
      );
    }

    if (key === 'idType') {
      return (
        <Select
          key={key}
          label={label || 'Choose an ID'}
          required={isRequired}
          disabled={!isEditable}
          value={form.idType}
          onChange={setCore('idType')}
        >
          {idTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </Select>
      );
    }

    if (key === 'idValue' || key === 'nric') {
      return (
        <Input
          key={key}
          label={`${form.idType || 'ID'} Value`}
          required={isRequired}
          disabled={!isEditable}
          placeholder={`Enter ${form.idType || 'ID'} (e.g. 920514-10-5432)`}
          value={form.nric}
          onChange={setCore('nric')}
          error={errors.nric}
        />
      );
    }

    if (key === 'dateOfBirth') {
      return (
        <Input
          key={key}
          label={label}
          type="date"
          required={isRequired}
          disabled={!isEditable}
          value={form.dateOfBirth}
          onChange={setCore('dateOfBirth')}
          error={errors.dateOfBirth}
        />
      );
    }

    if (key === 'phoneNumber') {
      return (
        <Input
          key={key}
          label={label}
          required={isRequired}
          disabled={!isEditable}
          placeholder="e.g. +60123456789"
          value={form.phoneNumber}
          onChange={setCore('phoneNumber')}
          error={errors.phoneNumber}
        />
      );
    }

    if (key === 'email') {
      return (
        <Input
          key={key}
          label={label}
          type="email"
          required={isRequired}
          disabled={!isEditable}
          placeholder="e.g. customer@example.com"
          value={form.email}
          onChange={setCore('email')}
          error={errors.email}
        />
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
          onChange={setCore('preferredLanguage')}
          error={errors.preferredLanguage}
        >
          {languages.map((lang) => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </Select>
      );
    }

    if (key === 'branch') {
      return (
        <Select
          key={key}
          label={label}
          required={isRequired}
          disabled={!isEditable}
          value={form.branch}
          onChange={setCore('branch')}
          error={errors.branch}
        >
          {branches.map((br) => (
            <option key={br} value={br}>{br}</option>
          ))}
        </Select>
      );
    }

    // Dynamic custom fields added via "+ ADD NEW FIELD"
    const customVal = form.customFields[key] || '';
    if (fieldConfig.fieldType === 'Date') {
      return (
        <Input
          key={key}
          label={label}
          type="date"
          required={isRequired}
          disabled={!isEditable}
          value={customVal}
          onChange={setCustom(key)}
          error={errors[key]}
        />
      );
    }

    if (fieldConfig.fieldType === 'Dropdown') {
      const options = customLookups[fieldConfig.lookupTypeCode] || [];
      return (
        <Select
          key={key}
          label={label}
          required={isRequired}
          disabled={!isEditable}
          value={customVal}
          onChange={setCustom(key)}
          error={errors[key]}
          placeholder={
            fieldConfig.lookupTypeCode
              ? options.length > 0
                ? 'Select option...'
                : 'No options configured'
              : 'No master lookup configured'
          }
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </Select>
      );
    }

    if (fieldConfig.fieldType === 'Checkbox') {
      return (
        <Checkbox
          key={key}
          label={label}
          checked={Boolean(customVal)}
          disabled={!isEditable}
          onChange={setCustom(key)}
        />
      );
    }

    const inputType =
      fieldConfig.fieldType === 'Number'
        ? 'number'
        : fieldConfig.fieldType === 'Email'
          ? 'email'
          : fieldConfig.fieldType === 'Phone'
            ? 'tel'
            : 'text';

    return (
      <Input
        key={key}
        label={label}
        type={inputType}
        required={isRequired}
        disabled={!isEditable}
        placeholder={`Enter ${label}...`}
        value={customVal}
        onChange={setCustom(key)}
        error={errors[key]}
      />
    );
  };

  return createPortal(
    <>
      <div className="create-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="create-drawer" role="dialog" aria-modal="true" aria-label="Create new customer">
        <div className="create-drawer__header">
          <div className="create-drawer__header-content">
            <h2>Add New Customer</h2>
            <p>Register customer profile with ID options &amp; language options</p>
          </div>
          <button className="create-drawer__close" onClick={onClose} aria-label="Close drawer">
            <X size={18} />
          </button>
        </div>

        <div className="create-drawer__body scrollbar-thin">
          {fieldConfigs.map(renderField)}
        </div>

        <div className="create-drawer__footer">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            className="create-drawer__submit"
            variant="primary"
            isLoading={isLoading}
            leftIcon={<UserPlus size={15} />}
            onClick={handleSubmit}
          >
            Save Customer
          </Button>
        </div>
      </aside>
    </>,
    document.body
  );
}

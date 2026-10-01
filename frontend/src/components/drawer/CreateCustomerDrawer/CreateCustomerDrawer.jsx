// ===== CREATE CUSTOMER DRAWER =====

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus } from 'lucide-react';
import { Button } from '../../common/Button/Button.jsx';
import { Input, Select, Checkbox, FormGroup } from '../../common/Input/Input.jsx';
import { customerService } from '../../../services/customerService.js';
import { configurableSettingsService } from '../../../services/configurableSettingsService.js';
import { useToast } from '../../../hooks/useToast.js';
import { SUPPORTED_ID_TYPES, validateIdentification, validatePhoneNumber, validateNricDateWithDob } from '../../../utils/validationUtils.js';
import '../CreateCaseDrawer/CreateCaseDrawer.css';
import './CreateCustomerDrawer.css';

export function CreateCustomerDrawer({ isOpen, onClose, onSuccess }) {
  const toast = useToast();

  const [fieldConfigs, setFieldConfigs] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [branches, setBranches] = useState([]);
  const [idTypes, setIdTypes] = useState(SUPPORTED_ID_TYPES);
  const [customLookups, setCustomLookups] = useState({});

  const [form, setForm] = useState({
    fullName: '',
    idType: 'NRIC Number',
    nric: '',
    dateOfBirth: '',
    phoneDigits: '',
    email: '',
    branch: '',
    customerSegment: '',
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
          .filter((f) => f.isVisible !== false && f.apiField?.toLowerCase() !== 'tenure')
          .sort((a, b) => a.displayOrder - b.displayOrder);

        setFieldConfigs(sortedFields);

        const activeLangs = (langsData || []).map((l) => l.value);
        const activeBranches = (branchData || []).map((b) => b.value);
        
        // Filter strictly to the 3 supported ID types
        const filteredIdTypes = (idTypeData || [])
          .map((i) => i.value)
          .filter((val) => SUPPORTED_ID_TYPES.includes(val));

        const finalIdTypes = filteredIdTypes.length > 0 ? filteredIdTypes : SUPPORTED_ID_TYPES;

        if (activeLangs.length > 0) setLanguages(activeLangs);
        if (activeBranches.length > 0) setBranches(activeBranches);
        setIdTypes(finalIdTypes);

        setForm((prev) => ({
          ...prev,
          preferredLanguage: prev.preferredLanguage || activeLangs[0] || 'Bahasa Malaysia',
          branch: prev.branch || activeBranches[0] || 'KL HQ',
          idType: prev.idType && finalIdTypes.includes(prev.idType) ? prev.idType : finalIdTypes[0],
        }));

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
          ID_TYPE: finalIdTypes,
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

  // Clean phone input to exactly digits, maximum 10 digits
  const handlePhoneChange = (e) => {
    let input = e.target.value.replace(/\D/g, '');
    // If user starts typing or pastes with 60 or leading 0, strip it
    if (input.startsWith('60')) {
      input = input.slice(2);
    } else if (input.startsWith('0')) {
      input = input.slice(1);
    }
    const cleanDigits = input.slice(0, 10);
    setForm((prev) => ({ ...prev, phoneDigits: cleanDigits }));
    setErrors((prev) => ({ ...prev, phoneNumber: undefined }));
  };

  const setCore = (field) => (e) => {
    const val = e.target.value;
    setForm((prev) => ({ ...prev, [field]: val }));
    setErrors((prev) => ({ ...prev, [field]: undefined, ...(field === 'nric' ? { idValue: undefined } : {}) }));
  };

  const setCustom = (apiField) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({
      ...prev,
      customFields: { ...prev.customFields, [apiField]: val },
    }));
    setErrors((prev) => ({ ...prev, [apiField]: undefined }));
  };

  const handleIdTypeChange = (e) => {
    const newType = e.target.value;
    setForm((prev) => ({ ...prev, idType: newType }));
    setErrors((prev) => ({ ...prev, idType: undefined, nric: undefined, idValue: undefined }));
    if (form.nric && form.nric.trim()) {
      const res = validateIdentification(form.nric, newType);
      if (!res.isValid) {
        setErrors((prev) => ({ ...prev, nric: res.error, idValue: res.error }));
      }
    }
  };

  // Blur validation for any field
  const handleBlur = (field) => {
    if (field === 'fullName') {
      if (!form.fullName || !form.fullName.trim()) {
        setErrors((prev) => ({ ...prev, fullName: 'This field is required' }));
      }
    } else if (field === 'nric' || field === 'idValue') {
      if (!form.nric || !form.nric.trim()) {
        setErrors((prev) => ({ ...prev, nric: 'This field is required', idValue: 'This field is required' }));
      } else {
        const res = validateIdentification(form.nric, form.idType);
        if (!res.isValid) {
          setErrors((prev) => ({ ...prev, nric: res.error, idValue: res.error }));
        } else {
          setErrors((prev) => ({ ...prev, nric: undefined, idValue: undefined }));
          if (form.idType === 'NRIC Number' && form.dateOfBirth) {
            const dobRes = validateNricDateWithDob(form.nric, form.dateOfBirth);
            if (!dobRes.isValid) {
              setErrors((prev) => ({ ...prev, dateOfBirth: dobRes.error }));
            } else if (errors.dateOfBirth === 'Date of Birth does not match the date in the NRIC number.') {
              setErrors((prev) => ({ ...prev, dateOfBirth: undefined }));
            }
          }
        }
      }
    } else if (field === 'dateOfBirth') {
      if (!form.dateOfBirth) {
        setErrors((prev) => ({ ...prev, dateOfBirth: 'This field is required' }));
      } else {
        const d = new Date(form.dateOfBirth);
        if (d > new Date()) {
          setErrors((prev) => ({ ...prev, dateOfBirth: 'Date of birth cannot be in the future.' }));
        } else if (form.idType === 'NRIC Number' && form.nric && form.nric.trim()) {
          const dobRes = validateNricDateWithDob(form.nric, form.dateOfBirth);
          if (!dobRes.isValid) {
            setErrors((prev) => ({ ...prev, dateOfBirth: dobRes.error }));
          } else {
            setErrors((prev) => ({ ...prev, dateOfBirth: undefined }));
          }
        } else {
          setErrors((prev) => ({ ...prev, dateOfBirth: undefined }));
        }
      }
    } else if (field === 'phoneNumber') {
      if (!form.phoneDigits) {
        setErrors((prev) => ({ ...prev, phoneNumber: 'This field is required' }));
      } else if (form.phoneDigits.length !== 10) {
        setErrors((prev) => ({
          ...prev,
          phoneNumber: `Phone number must contain exactly 10 contact digits (currently ${form.phoneDigits.length}).`,
        }));
      }
    } else if (field === 'email') {
      if (!form.email || !form.email.trim()) {
        setErrors((prev) => ({ ...prev, email: 'This field is required' }));
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        setErrors((prev) => ({ ...prev, email: 'Please enter a valid email address.' }));
      }
    } else if (field === 'branch') {
      if (!form.branch || !form.branch.trim()) {
        setErrors((prev) => ({ ...prev, branch: 'This field is required' }));
      }
    } else if (field === 'preferredLanguage') {
      if (!form.preferredLanguage || !form.preferredLanguage.trim()) {
        setErrors((prev) => ({ ...prev, preferredLanguage: 'This field is required' }));
      }
    } else {
      // Dynamic custom fields
      const val = form.customFields[field];
      if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
        setErrors((prev) => ({ ...prev, [field]: 'This field is required' }));
      }
    }
  };

  // Comprehensive submit validation: ALL fields are mandatory
  const validateForm = () => {
    const e = {};

    if (!form.fullName || !form.fullName.trim()) {
      e.fullName = 'This field is required';
    }

    if (!form.idType) {
      e.idType = 'This field is required';
    }

    if (!form.nric || !form.nric.trim()) {
      e.nric = 'This field is required';
      e.idValue = 'This field is required';
    } else {
      const idRes = validateIdentification(form.nric, form.idType);
      if (!idRes.isValid) {
        e.nric = idRes.error;
        e.idValue = idRes.error;
      }
    }

    if (!form.dateOfBirth) {
      e.dateOfBirth = 'This field is required';
    } else {
      const d = new Date(form.dateOfBirth);
      if (d > new Date()) {
        e.dateOfBirth = 'Date of birth cannot be in the future.';
      } else if (form.idType === 'NRIC Number' && form.nric && form.nric.trim()) {
        const dobRes = validateNricDateWithDob(form.nric, form.dateOfBirth);
        if (!dobRes.isValid) {
          e.dateOfBirth = dobRes.error;
        }
      }
    }

    if (!form.phoneDigits) {
      e.phoneNumber = 'This field is required';
    } else if (form.phoneDigits.length !== 10) {
      e.phoneNumber = `Phone number must contain exactly 10 contact digits (currently ${form.phoneDigits.length}).`;
    }

    if (!form.email || !form.email.trim()) {
      e.email = 'This field is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = 'Please enter a valid email address.';
    }

    if (!form.branch || !form.branch.trim()) {
      e.branch = 'This field is required';
    }

    if (!form.preferredLanguage || !form.preferredLanguage.trim()) {
      e.preferredLanguage = 'This field is required';
    }

    // Custom fields validation
    fieldConfigs.forEach((f) => {
      const key = f.apiField;
      const isCore = ['fullName', 'idType', 'idValue', 'nric', 'dateOfBirth', 'phoneNumber', 'email', 'preferredLanguage', 'branch'].includes(key);
      if (!isCore) {
        const val = form.customFields[key];
        if (val === undefined || val === null || (typeof val === 'string' && !val.trim())) {
          e[key] = 'This field is required';
        }
      }
    });

    return e;
  };

  const handleSubmit = async () => {
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
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
      // Store chosen idType
      customAttributesMap['idType'] = form.idType;
      customAttributesMap['idValue'] = form.nric.trim();

      const normalizedPhone = `+60 ${form.phoneDigits}`;

      const newCustomer = await customerService.createCustomer({
        fullName: form.fullName.trim(),
        idType: form.idType,
        idValue: form.nric.trim(),
        nric: form.idType === 'NRIC Number' ? form.nric.trim() : null,
        passport: form.idType === 'Passport Number' ? form.nric.trim() : null,
        accountNumber: form.idType === 'Account Number' ? form.nric.trim() : null,
        dateOfBirth: new Date(form.dateOfBirth).toISOString(),
        phoneNumber: normalizedPhone,
        email: form.email.trim(),
        branch: form.branch,
        customerSegment: form.customerSegment || null,
        preferredLanguage: form.preferredLanguage,
        customAttributes: Object.keys(customAttributesMap).length > 0 ? customAttributesMap : undefined,
      });

      toast.success('Customer added successfully.');
      onSuccess?.(newCustomer);
      onClose();
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.message || 'Failed to add customer.';
      const msgLower = errorMsg.toLowerCase();

      if (msgLower.includes('nric')) {
        setErrors((prev) => ({
          ...prev,
          nric: 'A customer already exists with this NRIC number.',
          idValue: 'A customer already exists with this NRIC number.',
        }));
        toast.error('A customer already exists with this NRIC number.');
      } else if (msgLower.includes('phone')) {
        setErrors((prev) => ({
          ...prev,
          phoneNumber: 'A customer already exists with this phone number.',
        }));
        toast.error('A customer already exists with this phone number.');
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const renderField = (fieldConfig) => {
    const key = fieldConfig.apiField;
    const label = fieldConfig.displayLabel || key;
    const isEditable = fieldConfig.isEditable !== false;

    if (key === 'fullName') {
      return (
        <Input
          key={key}
          label={label}
          required={true}
          disabled={!isEditable}
          placeholder="e.g. Siti Nurhaliza"
          value={form.fullName}
          onChange={setCore('fullName')}
          onBlur={() => handleBlur('fullName')}
          error={errors.fullName}
        />
      );
    }

    if (key === 'idType') {
      return (
        <Select
          key={key}
          label={label || 'Choose an ID'}
          required={true}
          disabled={!isEditable}
          value={form.idType}
          onChange={handleIdTypeChange}
          error={errors.idType}
        >
          {idTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </Select>
      );
    }

    if (key === 'idValue' || key === 'nric') {
      const isPassport = form.idType === 'Passport Number';
      const isAccount = form.idType === 'Account Number';
      const placeholder = isPassport
        ? 'e.g. A98765432'
        : isAccount
          ? 'e.g. ACC-98765432'
          : 'e.g. 920514-10-5432';

      return (
        <Input
          key={key}
          label={`${form.idType || 'ID'} Value`}
          required={true}
          disabled={!isEditable}
          placeholder={placeholder}
          value={form.nric}
          onChange={setCore('nric')}
          onBlur={() => handleBlur('nric')}
          error={errors.nric || errors.idValue}
        />
      );
    }

    if (key === 'dateOfBirth') {
      return (
        <Input
          key={key}
          label={label}
          type="date"
          required={true}
          disabled={!isEditable}
          value={form.dateOfBirth}
          onChange={setCore('dateOfBirth')}
          onBlur={() => handleBlur('dateOfBirth')}
          error={errors.dateOfBirth}
        />
      );
    }

    if (key === 'phoneNumber') {
      return (
        <div key={key} className="form-group phone-input-container">
          <label className="form-label form-label--required">{label}</label>
          <div className="phone-input-group">
            <span className="phone-input-group__prefix">+60</span>
            <input
              type="tel"
              className={`form-input phone-input-group__input ${errors.phoneNumber ? 'form-input--error field-error' : ''}`}
              disabled={!isEditable}
              placeholder="1234567890"
              maxLength={10}
              value={form.phoneDigits}
              onChange={handlePhoneChange}
              onBlur={() => handleBlur('phoneNumber')}
            />
          </div>
          {errors.phoneNumber && <span className="form-error">{errors.phoneNumber}</span>}
        </div>
      );
    }

    if (key === 'email') {
      return (
        <Input
          key={key}
          label={label}
          type="email"
          required={true}
          disabled={!isEditable}
          placeholder="e.g. customer@example.com"
          value={form.email}
          onChange={setCore('email')}
          onBlur={() => handleBlur('email')}
          error={errors.email}
        />
      );
    }

    if (key === 'preferredLanguage') {
      return (
        <Select
          key={key}
          label={label}
          required={true}
          disabled={!isEditable}
          value={form.preferredLanguage}
          onChange={setCore('preferredLanguage')}
          onBlur={() => handleBlur('preferredLanguage')}
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
          required={true}
          disabled={!isEditable}
          value={form.branch}
          onChange={setCore('branch')}
          onBlur={() => handleBlur('branch')}
          error={errors.branch}
        >
          {branches.map((br) => (
            <option key={br} value={br}>{br}</option>
          ))}
        </Select>
      );
    }

    // Dynamic custom fields
    const customVal = form.customFields[key] || '';
    if (fieldConfig.fieldType === 'Date') {
      return (
        <Input
          key={key}
          label={label}
          type="date"
          required={true}
          disabled={!isEditable}
          value={customVal}
          onChange={setCustom(key)}
          onBlur={() => handleBlur(key)}
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
          required={true}
          disabled={!isEditable}
          value={customVal}
          onChange={setCustom(key)}
          onBlur={() => handleBlur(key)}
          error={errors[key]}
          placeholder={options.length > 0 ? 'Select option...' : 'No options configured'}
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
        required={true}
        disabled={!isEditable}
        placeholder={`Enter ${label}...`}
        value={customVal}
        onChange={setCustom(key)}
        onBlur={() => handleBlur(key)}
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

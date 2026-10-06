// ===== CREATE CUSTOMER DRAWER =====
// Metadata-driven: fields, labels, required flags, validation rules and dropdown options all come from one request
// (/api/metadata/customer-form). Only the ID-specific structural checks (NRIC format, NRIC-vs-date-of-birth) stay in
// code, because they are rules about the identity document itself, not configurable data.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '../../common/Button/Button.jsx';
import { SideDrawer } from '../../common/SideDrawer/SideDrawer.jsx';
import { Loader, ErrorState } from '../../common/Loader/Loader.jsx';
import { DynamicField } from '../../common/DynamicField/DynamicField.jsx';
import { customerService } from '../../../services/customerService.js';
import { metadataService } from '../../../services/metadataService.js';
import { useToast } from '../../../hooks/useToast.js';
import { SUPPORTED_ID_TYPES, validateIdentification, validateNricDateWithDob } from '../../../utils/validationUtils.js';
import { validateFields, validateField, isFieldVisible, isFieldRequired } from '../../../utils/fieldValidation.js';
import { fieldErrorsFromError } from '../../../utils/serverErrors.js';
import '../CreateCaseDrawer/CreateCaseDrawer.css';
import './CreateCustomerDrawer.css';

// Fields mapped explicitly onto the customer payload; any other configured field is a custom attribute.
const CORE = new Set([
  'fullName', 'idType', 'idValue', 'nric', 'dateOfBirth', 'phoneNumber', 'email', 'branch', 'customerSegment', 'preferredLanguage',
]);

const ID_PLACEHOLDERS = {
  'Passport Number': 'e.g. A98765432',
  'Account Number': 'e.g. ACC-98765432',
  'NRIC Number': 'e.g. 920514-10-5432',
};

export function CreateCustomerDrawer({ isOpen, onClose, onSuccess }) {
  const toast = useToast();

  const [meta, setMeta] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);

  const [values, setValues] = useState({});
  const [phoneDigits, setPhoneDigits] = useState('');
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const loadMetadata = useCallback(() => {
    setIsLoadingMeta(true);
    setLoadError(null);
    metadataService
      .getCustomerForm()
      .then((data) => {
        setMeta(data);
        const initial = {};
        for (const f of data.fields) if (isFieldVisible(f)) initial[f.apiField] = '';
        // A required dropdown is pre-selected with its first option as a convenience; optional ones start empty.
        for (const f of data.fields) {
          if (!isFieldVisible(f) || f.fieldType !== 'Dropdown' || !isFieldRequired(f)) continue;
          const opts = data.lookups[f.lookupTypeCode] || [];
          if (f.apiField === 'idType') {
            const supported = opts.filter((o) => SUPPORTED_ID_TYPES.includes(o.value));
            if (supported.length) initial.idType = supported[0].value;
          } else if (opts.length) initial[f.apiField] = opts[0].value;
        }
        setValues(initial);
      })
      .catch((err) => setLoadError(err.message || 'The form could not be loaded.'))
      .finally(() => setIsLoadingMeta(false));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setTouched(false);
    setPhoneDigits('');
    loadMetadata();
  }, [isOpen, loadMetadata]);

  const fields = useMemo(
    () => (meta?.fields || []).filter((f) => isFieldVisible(f) && f.apiField?.toLowerCase() !== 'tenure').sort((a, b) => a.displayOrder - b.displayOrder),
    [meta]
  );

  const optionsFor = useCallback(
    (f) => {
      const opts = f.lookupTypeCode ? meta?.lookups?.[f.lookupTypeCode] || [] : [];
      // Only ID types the system can actually store are offered.
      return f.apiField === 'idType' ? opts.filter((o) => SUPPORTED_ID_TYPES.includes(o.value)) : opts;
    },
    [meta]
  );

  const idKey = fields.find((f) => f.apiField === 'idValue' || f.apiField === 'nric')?.apiField;
  const phoneValue = phoneDigits ? `+60 ${phoneDigits}` : '';

  const getValue = (f) => (f.apiField === 'phoneNumber' ? phoneValue : values[f.apiField]);

  const clearError = (...keys) => setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !keys.includes(k))));

  const setValue = (key, v) => {
    setTouched(true);
    setValues((prev) => ({ ...prev, [key]: v }));
    clearError(key, ...(key === idKey ? ['idValue', 'nric'] : []));
  };

  const handlePhoneChange = (e) => {
    let digits = e.target.value.replace(/\D/g, '');
    if (digits.startsWith('60')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = digits.slice(1);
    setTouched(true);
    setPhoneDigits(digits.slice(0, 15));
    clearError('phoneNumber');
  };

  // Structural identity-document checks (not configuration).
  const idErrors = (v) => {
    const out = {};
    const idValue = (v[idKey] || '').trim();
    if (idValue && v.idType) {
      const res = validateIdentification(idValue, v.idType);
      if (!res.isValid) out[idKey] = res.error;
    }
    if (v.dateOfBirth) {
      if (new Date(v.dateOfBirth) > new Date()) out.dateOfBirth = 'Date of birth cannot be in the future.';
      else if (v.idType === 'NRIC Number' && idValue && !out[idKey]) {
        const dob = validateNricDateWithDob(idValue, v.dateOfBirth);
        if (!dob.isValid) out.dateOfBirth = dob.error;
      }
    }
    return out;
  };

  const blurField = (f) => {
    const msg = validateField(f, getValue(f), optionsFor(f));
    const structural = idErrors(values);
    const key = f.apiField;
    const combined = msg || (key === idKey || key === 'dateOfBirth' ? structural[key] : '') || '';
    setErrors((prev) => ({ ...prev, [key]: combined || undefined }));
  };

  const handleSubmit = async () => {
    const found = { ...validateFields(fields, getValue, optionsFor), };
    for (const [k, msg] of Object.entries(idErrors(values))) if (!found[k]) found[k] = msg;
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    const customAttributes = {};
    for (const f of fields) {
      if (CORE.has(f.apiField)) continue;
      const v = values[f.apiField];
      if (v !== undefined && v !== null && String(v).trim() !== '') customAttributes[f.apiField] = String(v).trim();
    }

    const idType = values.idType;
    const idValue = idKey ? (values[idKey] || '').trim() : '';

    setIsLoading(true);
    try {
      const newCustomer = await customerService.createCustomer({
        fullName: (values.fullName || '').trim(),
        idType,
        idValue,
        nric: idType === 'NRIC Number' ? idValue : null,
        passport: idType === 'Passport Number' ? idValue : null,
        accountNumber: idType === 'Account Number' ? idValue : null,
        dateOfBirth: values.dateOfBirth ? new Date(values.dateOfBirth).toISOString() : null,
        phoneNumber: phoneValue,
        email: (values.email || '').trim(),
        branch: values.branch || '',
        customerSegment: values.customerSegment || null,
        preferredLanguage: values.preferredLanguage || '',
        customAttributes: Object.keys(customAttributes).length > 0 ? customAttributes : undefined,
      });

      toast.success('Customer added successfully.');
      onSuccess?.(newCustomer);
      onClose();
    } catch (err) {
      const fieldErrors = fieldErrorsFromError(err);
      if (Object.keys(fieldErrors).length > 0) {
        if (fieldErrors.idValue && idKey && idKey !== 'idValue') fieldErrors[idKey] = fieldErrors.idValue;
        setErrors(fieldErrors);
      }
      toast.error(err.message || 'Failed to add customer.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const renderField = (f) => {
    const key = f.apiField;

    if (key === 'phoneNumber') {
      return (
        <div key={key} className="form-group phone-input-container">
          <label className={`form-label ${isFieldRequired(f) ? 'form-label--required' : ''}`}>{f.displayLabel || key}</label>
          <div className="phone-input-group">
            <span className="phone-input-group__prefix">+60</span>
            <input
              type="tel"
              className={`form-input phone-input-group__input ${errors.phoneNumber ? 'form-input--error field-error' : ''}`}
              disabled={f.isEditable === false}
              placeholder="1234567890"
              value={phoneDigits}
              onChange={handlePhoneChange}
              onBlur={() => blurField(f)}
            />
          </div>
          {errors.phoneNumber && <span className="form-error">{errors.phoneNumber}</span>}
        </div>
      );
    }

    const isId = key === idKey;
    const config = isId ? { ...f, displayLabel: `${values.idType || 'ID'} Value` } : f;

    return (
      <DynamicField
        key={key}
        config={config}
        value={values[key]}
        options={optionsFor(f)}
        placeholder={isId ? ID_PLACEHOLDERS[values.idType] : undefined}
        onChange={(v) => {
          setValue(key, v);
          if (key === 'idType') clearError(idKey, 'idValue', 'nric', 'dateOfBirth');
        }}
        onBlur={() => blurField(f)}
        error={errors[key] || (isId ? errors.idValue || errors.nric : undefined)}
      />
    );
  };

  return (
    <SideDrawer
      isOpen={isOpen}
      onClose={onClose}
      isDirty={touched && !isLoading}
      title="Add New Customer"
      subtitle="Register customer profile with ID options & language options"
      ariaLabel="Create new customer"
      footer={({ requestClose }) => (
        <>
          <Button variant="ghost" onClick={requestClose}>Cancel</Button>
          <Button
            className="create-drawer__submit"
            variant="primary"
            isLoading={isLoading}
            disabled={!meta || Boolean(loadError)}
            leftIcon={<UserPlus size={15} />}
            onClick={handleSubmit}
          >
            Save Customer
          </Button>
        </>
      )}
    >
      {isLoadingMeta && <Loader text="Loading form…" />}
      {loadError && <ErrorState title="Couldn't load the form" message={loadError} onRetry={loadMetadata} />}
      {!isLoadingMeta && !loadError && meta && fields.map(renderField)}
    </SideDrawer>
  );
}

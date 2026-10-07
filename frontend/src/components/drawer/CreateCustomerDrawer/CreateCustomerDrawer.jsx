// ===== CREATE CUSTOMER DRAWER =====
// Metadata-driven: fields, labels, required flags, validation rules and dropdown options all come from one request
// (/api/metadata/customer-form); the countries a phone number can belong to come from /api/metadata/countries. Only the ID-specific structural checks (NRIC format, NRIC-vs-date-of-birth) stay in
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
import { SUPPORTED_ID_TYPES, validateIdByRule, validateIdAgainstDob } from '../../../utils/validationUtils.js';
import { validateField, isFieldVisible, isFieldRequired } from '../../../utils/fieldValidation.js';
import { fullPhone, phoneRuleError } from '../../../utils/phone.js';
import { DEFAULT_PHONE_COUNTRY_ISO2 } from '../../../constants/index.js';
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
  const [countries, setCountries] = useState([]);
  const [phoneCountries, setPhoneCountries] = useState({});   // apiField -> ISO2 of that phone field
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const loadMetadata = useCallback(() => {
    setIsLoadingMeta(true);
    setLoadError(null);
    Promise.all([metadataService.getCustomerForm(), metadataService.getCountries()])
      .then(([data, countryList]) => {
        setMeta(data);
        setCountries(countryList);
        // Nothing is chosen for the person: every field starts empty and dropdowns show their "Select Your …" prompt.
        const initial = {};
        for (const f of data.fields) if (isFieldVisible(f)) initial[f.apiField] = '';
        setValues(initial);
        const startCountry = countryList.some((c) => c.iso2 === DEFAULT_PHONE_COUNTRY_ISO2) ? DEFAULT_PHONE_COUNTRY_ISO2 : countryList[0]?.iso2;
        setPhoneCountries(Object.fromEntries(data.fields.filter((f) => f.fieldType === 'Phone').map((f) => [f.apiField, startCountry])));
      })
      .catch((err) => setLoadError(err.message || 'The form could not be loaded.'))
      .finally(() => setIsLoadingMeta(false));
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setTouched(false);
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

  const countryOf = (f) => countries.find((c) => c.iso2 === phoneCountries[f.apiField]);
  const getValue = (f) => (f.fieldType === 'Phone' ? fullPhone(countryOf(f), values[f.apiField]) : values[f.apiField]);

  const clearError = (...keys) => setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !keys.includes(k))));

  const setValue = (key, v) => {
    setTouched(true);
    setValues((prev) => ({ ...prev, [key]: v }));
    clearError(key, ...(key === idKey ? ['idValue', 'nric'] : []));
  };

  const changePhoneCountry = (f, iso2) => {
    setTouched(true);
    setPhoneCountries((prev) => ({ ...prev, [f.apiField]: iso2 }));
    clearError(f.apiField);   // the rules just changed: the old verdict no longer applies
  };

  // One field's error: required / configured rules from the shared engine, plus the selected country's rules for a phone.
  const fieldError = (f) => {
    if (f.fieldType === 'Phone') {
      const label = f.displayLabel || f.apiField;
      const national = values[f.apiField] || '';
      if (!national) return isFieldRequired(f) ? `${label} is required.` : '';
      return phoneRuleError(countryOf(f), national, label);
    }
    return validateField(f, getValue(f), optionsFor(f));
  };

  // The selected ID type's option carries its format rule (configuration, resolved by the server): what an ID value of that
  // type must look like, and whether it must agree with the date of birth.
  const idOption = (idType) => {
    const idField = (meta?.fields || []).find((f) => f.apiField === 'idType');
    return (meta?.lookups?.[idField?.lookupTypeCode] || []).find((o) => o.value === idType);
  };

  const idErrors = (v) => {
    const out = {};
    const idValue = (v[idKey] || '').trim();
    const option = idOption(v.idType);
    if (idValue && v.idType) {
      const res = validateIdByRule(idValue, option);
      if (!res.isValid) out[idKey] = res.error;
    }
    if (v.dateOfBirth) {
      if (new Date(v.dateOfBirth) > new Date()) out.dateOfBirth = 'Date of birth cannot be in the future.';
      else if (v.idType && idValue && !out[idKey]) {
        const dob = validateIdAgainstDob(idValue, v.dateOfBirth, option);
        if (!dob.isValid) out.dateOfBirth = dob.error;
      }
    }
    return out;
  };

  const blurField = (f) => {
    const msg = fieldError(f);
    const structural = idErrors(values);
    const key = f.apiField;
    const combined = msg || (key === idKey || key === 'dateOfBirth' ? structural[key] : '') || '';
    setErrors((prev) => ({ ...prev, [key]: combined || undefined }));
  };

  const handleSubmit = async () => {
    const found = {};
    for (const f of fields) {
      const msg = fieldError(f);
      if (msg) found[f.apiField] = msg;
    }
    for (const [k, msg] of Object.entries(idErrors(values))) if (!found[k]) found[k] = msg;
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }

    const customAttributes = {};
    for (const f of fields) {
      if (CORE.has(f.apiField)) continue;
      const v = f.fieldType === 'Phone' ? getValue(f) : values[f.apiField];
      if (v !== undefined && v !== null && String(v).trim() !== '') customAttributes[f.apiField] = String(v).trim();
    }

    const phoneField = fields.find((f) => f.apiField === 'phoneNumber');
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
        phoneNumber: phoneField ? getValue(phoneField) : '',
        phoneCountryIso2: phoneField ? phoneCountries.phoneNumber : undefined,
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

    const isId = key === idKey;
    const config = isId ? { ...f, displayLabel: `${values.idType || 'ID'} Value` } : f;

    return (
      <DynamicField
        key={key}
        config={config}
        value={values[key]}
        options={optionsFor(f)}
        countries={countries}
        phoneCountry={phoneCountries[key]}
        onPhoneCountryChange={(iso2) => changePhoneCountry(f, iso2)}
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
      discardLabel="Customer Information"
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

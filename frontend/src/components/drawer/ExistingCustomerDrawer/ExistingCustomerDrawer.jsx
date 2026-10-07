// ===== EXISTING CUSTOMER DRAWER =====

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Search, AlertCircle } from 'lucide-react';
import { Button } from '../../common/Button/Button.jsx';
import { Input, Select } from '../../common/Input/Input.jsx';
import { PhoneInput } from '../../common/PhoneInput/PhoneInput.jsx';
import { metadataService } from '../../../services/metadataService.js';
import { fullPhone, phoneRuleError } from '../../../utils/phone.js';
import { DEFAULT_PHONE_COUNTRY_ISO2 } from '../../../constants/index.js';
import { customerService } from '../../../services/customerService.js';
import { useToast } from '../../../hooks/useToast.js';
import { validateIdByRule, validateIdAgainstDob } from '../../../utils/validationUtils.js';
import '../CreateCaseDrawer/CreateCaseDrawer.css';
import '../CreateCustomerDrawer/CreateCustomerDrawer.css';
import './ExistingCustomerDrawer.css';

export function ExistingCustomerDrawer({ isOpen, onClose, onCustomerFound }) {
  const navigate = useNavigate();
  const toast = useToast();

  const [idTypes, setIdTypes] = useState([]);   // [{ value, label, formatRule, … }] from the customer form's ID type list
  const [form, setForm] = useState({
    idType: 'NRIC Number',
    idValue: '',
    phoneDigits: '',
    dateOfBirth: '',
  });
  const [countries, setCountries] = useState([]);
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY_ISO2);
  const country = countries.find((c) => c.iso2 === phoneCountry);

  const [errors, setErrors] = useState({});
  const [notFoundError, setNotFoundError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadIdTypes() {
      try {
        // The same list (and the same effective format rules) the Add New Customer form uses.
        const meta = await metadataService.getCustomerForm();
        if (!isMounted) return;
        const field = (meta.fields || []).find((f) => f.apiField === 'idType');
        const options = meta.lookups?.[field?.lookupTypeCode] || [];
        setIdTypes(options);
        setForm((prev) => ({
          ...prev,
          idType: options.some((o) => o.value === prev.idType) ? prev.idType : options[0]?.value || '',
        }));
      } catch (err) {
        console.error('Failed to load ID types from database:', err);
      }
    }

    loadIdTypes();
    metadataService.getCountries()
      .then((list) => {
        if (!isMounted) return;
        setCountries(list);
        setPhoneCountry((prev) => (list.some((c) => c.iso2 === prev) ? prev : list[0]?.iso2));
      })
      .catch((err) => console.error('Failed to load countries:', err));
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const optionOf = (idType) => idTypes.find((o) => o.value === idType);

  const handlePhoneChange = (digits) => {
    setForm((prev) => ({ ...prev, phoneDigits: digits }));
    setErrors((prev) => ({ ...prev, phoneNumber: undefined }));
    setNotFoundError(null);
  };

  const handleCountryChange = (iso2) => {
    setPhoneCountry(iso2);
    setErrors((prev) => ({ ...prev, phoneNumber: undefined }));   // the rules changed with the country
    setNotFoundError(null);
  };

  // Blank = required; otherwise the selected country's rules (data from the API, not code).
  const phoneError = () => (form.phoneDigits ? phoneRuleError(country, form.phoneDigits, 'Phone number') : 'This field is required');

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setNotFoundError(null);
  };

  const handleIdTypeChange = (e) => {
    const newType = e.target.value;
    setForm((prev) => ({ ...prev, idType: newType }));
    setErrors((prev) => ({ ...prev, idType: undefined, idValue: undefined }));
    setNotFoundError(null);
    if (form.idValue && form.idValue.trim()) {
      const res = validateIdByRule(form.idValue, optionOf(newType));
      if (!res.isValid) {
        setErrors((prev) => ({ ...prev, idValue: res.error }));
      }
    }
  };

  const handleBlurValidate = (field) => {
    if (field === 'idValue') {
      if (!form.idValue || !form.idValue.trim()) {
        setErrors((prev) => ({ ...prev, idValue: 'This field is required' }));
      } else {
        const res = validateIdByRule(form.idValue, optionOf(form.idType));
        if (!res.isValid) {
          setErrors((prev) => ({ ...prev, idValue: res.error }));
        } else {
          setErrors((prev) => ({ ...prev, idValue: undefined }));
          if (form.dateOfBirth) {
            const dobRes = validateIdAgainstDob(form.idValue, form.dateOfBirth, optionOf(form.idType));
            if (!dobRes.isValid) {
              setErrors((prev) => ({ ...prev, dateOfBirth: dobRes.error }));
            } else if (errors.dateOfBirth === 'Date of Birth does not match the date in the NRIC number.') {
              setErrors((prev) => ({ ...prev, dateOfBirth: undefined }));
            }
          }
        }
      }
    } else if (field === 'phoneNumber') {
      setErrors((prev) => ({ ...prev, phoneNumber: phoneError() || undefined }));
    } else if (field === 'dateOfBirth') {
      if (!form.dateOfBirth) {
        setErrors((prev) => ({ ...prev, dateOfBirth: 'This field is required' }));
      } else {
        const d = new Date(form.dateOfBirth);
        if (d > new Date()) {
          setErrors((prev) => ({ ...prev, dateOfBirth: 'Date of birth cannot be in the future.' }));
        } else if (form.idValue && form.idValue.trim()) {
          const dobRes = validateIdAgainstDob(form.idValue, form.dateOfBirth, optionOf(form.idType));
          if (!dobRes.isValid) {
            setErrors((prev) => ({ ...prev, dateOfBirth: dobRes.error }));
          } else {
            setErrors((prev) => ({ ...prev, dateOfBirth: undefined }));
          }
        } else {
          setErrors((prev) => ({ ...prev, dateOfBirth: undefined }));
        }
      }
    }
  };

  // Requirement 7: ALL 3 search inputs are required (ID Value, Phone Number, Date of Birth)
  const validate = () => {
    const e = {};

    if (!form.idValue || !form.idValue.trim()) {
      e.idValue = 'This field is required';
    } else {
      const idRes = validateIdByRule(form.idValue, optionOf(form.idType));
      if (!idRes.isValid) {
        e.idValue = idRes.error;
      }
    }

    const phoneProblem = phoneError();
    if (phoneProblem) e.phoneNumber = phoneProblem;

    if (!form.dateOfBirth) {
      e.dateOfBirth = 'This field is required';
    } else {
      const d = new Date(form.dateOfBirth);
      if (d > new Date()) {
        e.dateOfBirth = 'Date of birth cannot be in the future.';
      } else if (form.idValue && form.idValue.trim()) {
        const dobRes = validateIdAgainstDob(form.idValue, form.dateOfBirth, optionOf(form.idType));
        if (!dobRes.isValid) {
          e.dateOfBirth = dobRes.error;
        }
      }
    }

    return e;
  };

  const handleSearch = async () => {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }

    setIsLoading(true);
    setNotFoundError(null);

    try {
      const payload = {
        idType: form.idType,
        idValue: form.idValue.trim(),
        phoneNumber: fullPhone(country, form.phoneDigits),
        dateOfBirth: new Date(form.dateOfBirth).toISOString(),
      };

      const result = await customerService.searchCustomer(payload);
      if (result && result.id) {
        toast.success(`Customer "${result.fullName}" found.`);
        onClose();
        if (onCustomerFound) {
          onCustomerFound(result);
        } else {
          localStorage.setItem('csm_selected_customer_id', result.id);
          navigate(`/customer360/${result.id}`);
        }
      } else {
        setNotFoundError('Customer not found. Please verify the entered information or use Create Customer.');
      }
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Customer not found. Please verify details.';
      setNotFoundError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const isPassport = form.idType === 'Passport Number';
  const isAccount = form.idType === 'Account Number';
  const placeholder = isPassport
    ? 'e.g. A98765432'
    : isAccount
      ? 'e.g. ACC-98765432'
      : 'e.g. 123456-12-1234';

  return createPortal(
    <>
      <div className="create-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="create-drawer existing-customer-drawer" role="dialog" aria-modal="true" aria-label="Search existing customer">
        <div className="create-drawer__header">
          <div className="create-drawer__header-content">
            <h2>Existing Customer Search</h2>
            <p>Locate customer record from database by ID, Phone, and DOB</p>
          </div>
          <button className="create-drawer__close" onClick={onClose} aria-label="Close drawer">
            <X size={18} />
          </button>
        </div>

        <div className="create-drawer__body scrollbar-thin">
          {notFoundError && (
            <div className="existing-customer-alert" role="alert">
              <AlertCircle size={18} className="existing-customer-alert__icon" />
              <div className="existing-customer-alert__text">
                <strong>Customer Not Found</strong>
                <p>{notFoundError}</p>
              </div>
            </div>
          )}

          {/* Field 1 — Choose an ID */}
          <Select
            label="Choose an ID"
            required={true}
            value={form.idType}
            onChange={handleIdTypeChange}
            placeholder="Select ID type..."
          >
            {idTypes.map((type) => (
              <option key={type.value} value={type.value}>{type.label || type.value}</option>
            ))}
          </Select>

          {/* Field 2 — ID Value */}
          <Input
            label={`${form.idType || 'ID'} Value`}
            required={true}
            placeholder={placeholder}
            value={form.idValue}
            onChange={set('idValue')}
            onBlur={() => handleBlurValidate('idValue')}
            error={errors.idValue}
          />

          {/* Field 3 — Phone Number: country selector + national number */}
          <PhoneInput
            label="Phone Number"
            required
            countries={countries}
            countryIso2={phoneCountry}
            onCountryChange={handleCountryChange}
            national={form.phoneDigits}
            onNationalChange={handlePhoneChange}
            onBlur={() => handleBlurValidate('phoneNumber')}
            error={errors.phoneNumber}
          />

          {/* Field 4 — Date of Birth */}
          <Input
            label="Date of Birth"
            type="date"
            required={true}
            value={form.dateOfBirth}
            onChange={set('dateOfBirth')}
            onBlur={() => handleBlurValidate('dateOfBirth')}
            error={errors.dateOfBirth}
          />
        </div>

        <div className="create-drawer__footer">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            className="create-drawer__submit"
            variant="primary"
            isLoading={isLoading}
            leftIcon={<Search size={15} />}
            onClick={handleSearch}
          >
            Search Customer
          </Button>
        </div>
      </aside>
    </>,
    document.body
  );
}

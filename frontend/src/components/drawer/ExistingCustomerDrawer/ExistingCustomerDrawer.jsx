// ===== EXISTING CUSTOMER DRAWER =====

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, Search, AlertCircle } from 'lucide-react';
import { Button } from '../../common/Button/Button.jsx';
import { Input, Select } from '../../common/Input/Input.jsx';
import { customerService } from '../../../services/customerService.js';
import { configurableSettingsService } from '../../../services/configurableSettingsService.js';
import { useToast } from '../../../hooks/useToast.js';
import { SUPPORTED_ID_TYPES, validateIdentification, validatePhoneNumber, validateNricDateWithDob } from '../../../utils/validationUtils.js';
import '../CreateCaseDrawer/CreateCaseDrawer.css';
import '../CreateCustomerDrawer/CreateCustomerDrawer.css';
import './ExistingCustomerDrawer.css';

export function ExistingCustomerDrawer({ isOpen, onClose, onCustomerFound }) {
  const navigate = useNavigate();
  const toast = useToast();

  const [idTypes, setIdTypes] = useState(SUPPORTED_ID_TYPES);
  const [form, setForm] = useState({
    idType: 'NRIC Number',
    idValue: '',
    phoneDigits: '',
    dateOfBirth: '',
  });

  const [errors, setErrors] = useState({});
  const [notFoundError, setNotFoundError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    async function loadIdTypes() {
      try {
        const lookupValues = await configurableSettingsService.getLookupValues('ID_TYPE', true);
        if (!isMounted) return;
        const types = (lookupValues || [])
          .map((l) => l.value)
          .filter((v) => SUPPORTED_ID_TYPES.includes(v));
        
        const finalTypes = types.length > 0 ? types : SUPPORTED_ID_TYPES;
        setIdTypes(finalTypes);
        setForm((prev) => ({
          ...prev,
          idType: finalTypes.includes(prev.idType) ? prev.idType : finalTypes[0],
        }));
      } catch (err) {
        console.error('Failed to load ID types from database:', err);
      }
    }

    loadIdTypes();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const handlePhoneChange = (e) => {
    let input = e.target.value.replace(/\D/g, '');
    if (input.startsWith('60')) {
      input = input.slice(2);
    } else if (input.startsWith('0')) {
      input = input.slice(1);
    }
    const cleanDigits = input.slice(0, 10);
    setForm((prev) => ({ ...prev, phoneDigits: cleanDigits }));
    setErrors((prev) => ({ ...prev, phoneNumber: undefined }));
    setNotFoundError(null);
  };

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
      const res = validateIdentification(form.idValue, newType);
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
        const res = validateIdentification(form.idValue, form.idType);
        if (!res.isValid) {
          setErrors((prev) => ({ ...prev, idValue: res.error }));
        } else {
          setErrors((prev) => ({ ...prev, idValue: undefined }));
          if (form.idType === 'NRIC Number' && form.dateOfBirth) {
            const dobRes = validateNricDateWithDob(form.idValue, form.dateOfBirth);
            if (!dobRes.isValid) {
              setErrors((prev) => ({ ...prev, dateOfBirth: dobRes.error }));
            } else if (errors.dateOfBirth === 'Date of Birth does not match the date in the NRIC number.') {
              setErrors((prev) => ({ ...prev, dateOfBirth: undefined }));
            }
          }
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
    } else if (field === 'dateOfBirth') {
      if (!form.dateOfBirth) {
        setErrors((prev) => ({ ...prev, dateOfBirth: 'This field is required' }));
      } else {
        const d = new Date(form.dateOfBirth);
        if (d > new Date()) {
          setErrors((prev) => ({ ...prev, dateOfBirth: 'Date of birth cannot be in the future.' }));
        } else if (form.idType === 'NRIC Number' && form.idValue && form.idValue.trim()) {
          const dobRes = validateNricDateWithDob(form.idValue, form.dateOfBirth);
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
      const idRes = validateIdentification(form.idValue, form.idType);
      if (!idRes.isValid) {
        e.idValue = idRes.error;
      }
    }

    if (!form.phoneDigits) {
      e.phoneNumber = 'This field is required';
    } else if (form.phoneDigits.length !== 10) {
      e.phoneNumber = `Phone number must contain exactly 10 contact digits (currently ${form.phoneDigits.length}).`;
    }

    if (!form.dateOfBirth) {
      e.dateOfBirth = 'This field is required';
    } else {
      const d = new Date(form.dateOfBirth);
      if (d > new Date()) {
        e.dateOfBirth = 'Date of birth cannot be in the future.';
      } else if (form.idType === 'NRIC Number' && form.idValue && form.idValue.trim()) {
        const dobRes = validateNricDateWithDob(form.idValue, form.dateOfBirth);
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
        phoneNumber: `+60 ${form.phoneDigits}`,
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
              <option key={type} value={type}>{type}</option>
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

          {/* Field 3 — Phone Number with fixed +60 */}
          <div className="form-group phone-input-container">
            <label className="form-label form-label--required">Phone Number</label>
            <div className="phone-input-group">
              <span className="phone-input-group__prefix">+60</span>
              <input
                type="tel"
                className={`form-input phone-input-group__input ${errors.phoneNumber ? 'form-input--error field-error' : ''}`}
                placeholder="1234567890"
                maxLength={10}
                value={form.phoneDigits}
                onChange={handlePhoneChange}
                onBlur={() => handleBlurValidate('phoneNumber')}
              />
            </div>
            {errors.phoneNumber && <span className="form-error">{errors.phoneNumber}</span>}
          </div>

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

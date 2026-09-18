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
import '../CreateCaseDrawer/CreateCaseDrawer.css';
import './ExistingCustomerDrawer.css';

export function ExistingCustomerDrawer({ isOpen, onClose, onCustomerFound }) {
  const navigate = useNavigate();
  const toast = useToast();

  const [idTypes, setIdTypes] = useState(['NRIC Number', 'IC Number', 'ID Number', 'Passport', 'Account Number']);
  const [form, setForm] = useState({
    idType: 'NRIC Number',
    idValue: '',
    phoneNumber: '',
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
        const types = (lookupValues || []).map((l) => l.value);
        if (types.length > 0) {
          setIdTypes(types);
          setForm((prev) => ({
            ...prev,
            idType: types.includes(prev.idType) ? prev.idType : types[0],
          }));
        }
      } catch (err) {
        console.error('Failed to load ID types from database:', err);
      }
    }

    loadIdTypes();
    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const set = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setNotFoundError(null);
  };

  const validate = () => {
    const e = {};
    if (!form.idValue.trim() && !form.phoneNumber.trim() && !form.dateOfBirth) {
      e.idValue = 'Please enter at least an ID Value or Phone Number to search.';
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
        idValue: form.idValue.trim() || undefined,
        phoneNumber: form.phoneNumber.trim() || undefined,
        dateOfBirth: form.dateOfBirth ? new Date(form.dateOfBirth).toISOString() : undefined,
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

  return createPortal(
    <>
      <div className="create-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="create-drawer existing-customer-drawer" role="dialog" aria-modal="true" aria-label="Search existing customer">
        <div className="create-drawer__header">
          <div className="create-drawer__header-content">
            <h2>Existing Customer Search</h2>
            <p>Locate customer record from database by ID, Phone, or DOB</p>
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
            value={form.idType}
            onChange={set('idType')}
            placeholder="Select ID type..."
          >
            {idTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </Select>

          <Input
            label={`${form.idType || 'ID'} Value`}
            placeholder={`Enter ${form.idType || 'ID'}`}
            value={form.idValue}
            onChange={set('idValue')}
            error={errors.idValue}
          />

          {/* Field 2 — Phone Number */}
          <Input
            label="Phone Number"
            placeholder="e.g. +60123456789"
            value={form.phoneNumber}
            onChange={set('phoneNumber')}
            error={errors.phoneNumber}
          />

          {/* Field 3 — Date of Birth */}
          <Input
            label="Date of Birth"
            type="date"
            value={form.dateOfBirth}
            onChange={set('dateOfBirth')}
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

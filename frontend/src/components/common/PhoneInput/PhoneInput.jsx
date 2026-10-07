// ===== PHONE INPUT =====
// Country selector (flag, name, dial code, search as you type by name / ISO code / dial code) + the national number.
// The list of countries and each country's rules come from the API (see utils/phone.js); validation follows the selected
// country automatically.

import { useMemo } from 'react';
import { Select } from '../Input/Input.jsx';
import { cleanNationalInput, countryLabel, countrySearchText, flagOf } from '../../../utils/phone.js';
import './PhoneInput.css';

/**
 * @param {Array}    props.countries       [{ iso2, name, dialCode, minNationalDigits, maxNationalDigits }]
 * @param {string}   props.countryIso2     the selected country
 * @param {(iso2: string) => void} props.onCountryChange
 * @param {string}   props.national        national digits (no dial code)
 * @param {(digits: string) => void} props.onNationalChange
 */
export function PhoneInput({
  label,
  required = false,
  countries = [],
  countryIso2,
  onCountryChange,
  national,
  onNationalChange,
  onBlur,
  error,
  disabled = false,
  placeholder,
}) {
  const country = useMemo(() => countries.find((c) => c.iso2 === countryIso2), [countries, countryIso2]);
  const digitsHint = country
    ? country.minNationalDigits === country.maxNationalDigits ? `${country.minNationalDigits}` : `${country.minNationalDigits}-${country.maxNationalDigits}`
    : '';

  return (
    <div className="form-group phone-input-container">
      {label && <label className={`form-label ${required ? 'form-label--required' : ''}`}>{label}</label>}
      <div className={`phone-field ${error ? 'phone-field--error' : ''}`}>
        <div className="phone-field__country">
          <Select
            value={countryIso2 || ''}
            onChange={(e) => onCountryChange?.(e.target.value)}
            disabled={disabled || countries.length === 0}
            placeholder={countries.length === 0 ? 'Loading…' : 'Country'}
            searchPlaceholder="Search country, code or +dial…"
            className="phone-field__country-trigger"
          >
            {countries.map((c) => (
              <option key={c.iso2} value={c.iso2} searchText={countrySearchText(c)}>{countryLabel(c)}</option>
            ))}
          </Select>
        </div>
        <input
          type="tel"
          inputMode="numeric"
          className={`form-input phone-field__input ${error ? 'form-input--error field-error' : ''}`}
          disabled={disabled || !country}
          placeholder={placeholder ?? (digitsHint ? `${digitsHint} digits` : 'Phone number')}
          value={national || ''}
          maxLength={country ? country.maxNationalDigits + 6 : undefined}
          onChange={(e) => onNationalChange?.(cleanNationalInput(country, e.target.value))}
          onBlur={onBlur}
          aria-label={label || 'Phone number'}
          aria-invalid={Boolean(error)}
        />
      </div>
      {country && !error && <span className="phone-field__hint">{flagOf(country.iso2)} +{country.dialCode} · {digitsHint} digits</span>}
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}

// ===== DYNAMIC FIELD =====
// Renders ONE configured field from its metadata: the control comes from the field type (text, number, date, email,
// phone, dropdown, checkbox), the label/required marker from the configuration, and a dropdown's options from the list
// it is bound to. New custom fields therefore need no new code to appear on a form.

import { Input, Textarea, Select, Checkbox } from '../Input/Input.jsx';
import { PhoneInput } from '../PhoneInput/PhoneInput.jsx';
import { isFieldRequired, dropdownPlaceholder } from '../../../utils/fieldValidation.js';

const INPUT_TYPES = { number: 'number', date: 'date', email: 'email' };

/**
 * @param {object}   props.config     field configuration
 * @param {string}   props.value      the value (for a phone field: the national digits)
 * @param {(value: string) => void} props.onChange
 * @param {() => void} [props.onBlur]
 * @param {string}   [props.error]
 * @param {Array<{value:string,label:string}>} [props.options]  options for a dropdown
 * @param {Array}    [props.countries]  countries for a phone field
 * @param {string}   [props.phoneCountry]  selected country (ISO2) of a phone field
 * @param {(iso2: string) => void} [props.onPhoneCountryChange]
 * @param {boolean}  [props.multiline]  render a text field as a text area
 * @param {boolean}  [props.disabled]
 * @param {*}        [props.helperText]
 */
export function DynamicField({
  config, value, onChange, onBlur, error, options = [], countries, phoneCountry, onPhoneCountryChange,
  multiline = false, disabled = false, helperText, placeholder,
}) {
  const label = config.displayLabel || config.apiField;
  const required = isFieldRequired(config);
  const type = (config.fieldType || 'Text').toLowerCase();

  if (type === 'checkbox') {
    return (
      <Checkbox
        label={label}
        checked={String(value).toLowerCase() === 'true'}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
      />
    );
  }

  if (type === 'phone') {
    return (
      <PhoneInput
        label={label}
        required={required}
        disabled={disabled}
        countries={countries}
        countryIso2={phoneCountry}
        onCountryChange={onPhoneCountryChange}
        national={value}
        onNationalChange={onChange}
        onBlur={onBlur}
        error={error}
        placeholder={placeholder}
      />
    );
  }

  if (type === 'dropdown') {
    return (
      <Select
        label={label}
        required={required}
        disabled={disabled}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        error={error}
        helperText={helperText}
        placeholder={placeholder ?? (options.length > 0 ? dropdownPlaceholder(label) : 'No options configured')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label || o.value}</option>
        ))}
      </Select>
    );
  }

  if (multiline || (type === 'text' && config.maxLength && config.maxLength > 200)) {
    return (
      <Textarea
        label={label}
        required={required}
        disabled={disabled}
        placeholder={placeholder ?? `Enter ${label}…`}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        error={error}
        rows={4}
      />
    );
  }

  return (
    <Input
      label={label}
      type={INPUT_TYPES[type] || 'text'}
      required={required}
      disabled={disabled}
      placeholder={placeholder ?? `Enter ${label}…`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      error={error}
      helperText={helperText}
    />
  );
}

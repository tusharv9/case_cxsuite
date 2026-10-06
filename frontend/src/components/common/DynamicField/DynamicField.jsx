// ===== DYNAMIC FIELD =====
// Renders ONE configured field from its metadata: the control comes from the field type (text, number, date,
// email, phone, dropdown, checkbox), the label/required marker/editability from the configuration, and a dropdown's
// options from the list it is bound to. New custom fields therefore need no new code to appear on a form.

import { Input, Textarea, Select, Checkbox } from '../Input/Input.jsx';
import { isFieldRequired } from '../../../utils/fieldValidation.js';

const INPUT_TYPES = { number: 'number', date: 'date', email: 'email', phone: 'tel' };

/**
 * @param {object}   props.config     field configuration
 * @param {string}   props.value
 * @param {(value: string) => void} props.onChange
 * @param {() => void} [props.onBlur]
 * @param {string}   [props.error]
 * @param {Array<{value:string,label:string}>} [props.options]  options for a dropdown
 * @param {boolean}  [props.multiline]  render a text field as a text area
 * @param {boolean}  [props.disabled]
 * @param {*}        [props.helperText]
 */
export function DynamicField({ config, value, onChange, onBlur, error, options = [], multiline = false, disabled = false, helperText, placeholder }) {
  const label = config.displayLabel || config.apiField;
  const required = isFieldRequired(config);
  const isDisabled = disabled || config.isEditable === false;
  const type = (config.fieldType || 'Text').toLowerCase();

  if (type === 'checkbox') {
    return (
      <Checkbox
        label={label}
        checked={String(value).toLowerCase() === 'true'}
        disabled={isDisabled}
        onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
      />
    );
  }

  if (type === 'dropdown') {
    return (
      <Select
        label={label}
        required={required}
        disabled={isDisabled}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        error={error}
        helperText={helperText}
        placeholder={placeholder ?? (options.length > 0 ? `Select ${label.toLowerCase()}…` : 'No options configured')}
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
        disabled={isDisabled}
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
      disabled={isDisabled}
      placeholder={placeholder ?? `Enter ${label}…`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      error={error}
      helperText={helperText}
    />
  );
}

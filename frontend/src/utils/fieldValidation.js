// ===== FIELD VALIDATION (client mirror of the server's FieldValidationEngine) =====
// Evaluates exactly what an administrator configured for a field — Required, min/max length, pattern (with the
// administrator's message), field type, and dropdown membership — so users get instant feedback.
//
// This is a CONVENIENCE: the backend runs the same rules and is the authority, so a missing or stale check here can
// never let bad data through. Keep the two in step when changing either.

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** A field the user can see and fill in. System-required fields are always shown. */
export function isFieldVisible(config) {
  return config.isVisible !== false || config.isSystemRequired;
}

export function isFieldRequired(config) {
  return Boolean(config.isRequired || config.isSystemRequired);
}

/**
 * @param {object} config   A field configuration (as returned by /api/metadata/*).
 * @param {*} rawValue      The current value.
 * @param {Array<{value:string}>} [options]  The options of the field's list, for dropdowns.
 * @param {{ skipRequired?: boolean }} [opts]
 * @returns {string} An error message, or '' when the value is acceptable.
 */
export function validateField(config, rawValue, options, opts = {}) {
  const label = config.displayLabel || config.apiField;
  const value = rawValue === undefined || rawValue === null ? '' : String(rawValue).trim();

  if (value === '') {
    return isFieldRequired(config) && !opts.skipRequired ? `${label} is required.` : '';
  }

  if (config.minLength && value.length < config.minLength) return `${label} must be at least ${config.minLength} characters.`;
  if (config.maxLength && value.length > config.maxLength) return `${label} cannot exceed ${config.maxLength} characters.`;

  switch ((config.fieldType || 'Text').toLowerCase()) {
    case 'email':
      if (value.length > 254 || !EMAIL.test(value)) return `${label} must be a valid email address.`;
      break;
    case 'phone':
      if ((value.match(/\d/g) || []).length < 7 || /[^\d\s+\-()]/.test(value)) return `${label} must be a valid phone number.`;
      break;
    case 'date': {
      const time = Date.parse(value);
      if (Number.isNaN(time)) return `${label} must be a valid date.`;
      const day = (iso) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
      const asDay = day(value);
      if (config.minValue && !Number.isNaN(day(config.minValue)) && asDay < day(config.minValue)) return `${label} cannot be before ${String(config.minValue).slice(0, 10)}.`;
      if (config.maxValue && !Number.isNaN(day(config.maxValue)) && asDay > day(config.maxValue)) return `${label} cannot be after ${String(config.maxValue).slice(0, 10)}.`;
      break;
    }
    case 'number': {
      if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(value)) return `${label} must be a number.`;
      const n = Number(value);
      if (config.minValue !== null && config.minValue !== undefined && config.minValue !== '' && n < Number(config.minValue)) return `${label} must be at least ${config.minValue}.`;
      if (config.maxValue !== null && config.maxValue !== undefined && config.maxValue !== '' && n > Number(config.maxValue)) return `${label} cannot exceed ${config.maxValue}.`;
      break;
    }
    case 'checkbox':
      if (!/^(true|false)$/i.test(value)) return `${label} must be true or false.`;
      break;
    case 'dropdown':
      if (config.lookupTypeCode && options && !options.some((o) => String(o.value).toLowerCase() === value.toLowerCase())) {
        return `'${value}' is not a valid option for ${label}.`;
      }
      break;
    default:
      break;
  }

  if (config.validationRegex) {
    try {
      if (!new RegExp(config.validationRegex).test(value)) return config.validationMessage || `${label} format is invalid.`;
    } catch {
      // An unusable pattern is ignored (the server does the same) rather than blocking everyone.
    }
  }

  return '';
}

/**
 * Validates every visible field of a form.
 * @param {object[]} fields
 * @param {(config) => *} getValue
 * @param {(config) => Array|undefined} getOptions
 * @param {Set<string>} [skipRequired]  apiFields whose "required" some other rule owns.
 * @returns {Record<string,string>} errors keyed by apiField
 */
export function validateFields(fields, getValue, getOptions, skipRequired = new Set()) {
  const errors = {};
  for (const config of fields) {
    if (!isFieldVisible(config)) continue;
    const message = validateField(config, getValue(config), getOptions?.(config), { skipRequired: skipRequired.has(config.apiField) });
    if (message) errors[config.apiField] = message;
  }
  return errors;
}

/**
 * The text a dropdown shows before anything is chosen: "Select Your Preferred Language", "Select Your Home Branch",
 * "Select Your ID". Built from the configured label (a leading "Choose an" / "Select your" is dropped), so a renamed
 * or newly added dropdown gets a sensible prompt with no code change.
 */
export function dropdownPlaceholder(label) {
  const core = String(label || 'Option').trim().replace(/^(choose|select|pick)\s+(an?\s+|the\s+|your\s+)?/i, '');
  return `Select Your ${core || 'Option'}`;
}

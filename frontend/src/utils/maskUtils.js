// ===== SENSITIVE VALUE MASKING =====
// Implements the masking rules offered by Configurable Settings so that the "Sensitive",
// "Masking Rule" and "Visible Chars" columns actually change what a user sees, rather than
// only being stored.

const MASK_CHAR = 'X';

/**
 * Apply a configured masking rule to a value.
 *
 * @param {string|null|undefined} value        The raw value.
 * @param {string} rule                        None | FullMask | HideMiddle | HideFirstShowLast
 * @param {number} visibleChars                How many characters stay readable.
 * @returns {string} The value as it should be displayed.
 */
export function maskValue(value, rule = 'None', visibleChars = 4) {
  if (value === null || value === undefined) return '';

  const text = String(value);
  if (!text || !rule) return text;

  const normRule = String(rule).replace(/[\s\-_]/g, '').toLowerCase();
  if (normRule === 'none') return text;

  const keep = Number.isFinite(Number(visibleChars)) ? Math.max(0, Number(visibleChars)) : 0;

  switch (normRule) {
    case 'fullmask':
    case 'full':
      return maskSegment(text);

    case 'hidefirstshowlast': {
      if (keep === 0) return maskSegment(text);
      if (text.length <= keep) return text;
      return maskSegment(text.slice(0, text.length - keep)) + text.slice(text.length - keep);
    }

    case 'hidemiddle': {
      // `keep` characters stay visible at each end.
      if (keep === 0) return maskSegment(text);
      if (text.length <= keep * 2) return text;
      return text.slice(0, keep) + maskSegment(text.slice(keep, text.length - keep)) + text.slice(text.length - keep);
    }

    default:
      return text;
  }
}

/** Masks every character except separators, so formatting such as NRIC dashes survives. */
function maskSegment(segment) {
  return segment.replace(/[^\s\-/()]/g, MASK_CHAR);
}

/**
 * Build a `(apiField, value) => displayedValue` helper from a list of field configurations.
 * Fields that are not marked sensitive or have No masking configured are returned unchanged.
 */
export function createFieldMasker(fieldConfigs = []) {
  const byField = new Map();

  (fieldConfigs || []).forEach((f) => {
    if (!f || !f.apiField) return;
    const existing = byField.get(f.apiField);
    const isConfigActive = f.isSensitive && f.maskingRule && f.maskingRule.replace(/[\s\-_]/g, '').toLowerCase() !== 'none';

    if (!existing) {
      byField.set(f.apiField, f);
    } else if (isConfigActive) {
      byField.set(f.apiField, f);
    }
  });

  return (apiField, value) => {
    if (value === null || value === undefined) return '';
    const text = String(value);

    let config = byField.get(apiField);
    if (!config && apiField === 'nric') config = byField.get('idValue');
    if (!config && apiField === 'idValue') config = byField.get('nric');

    if (!config || !config.isSensitive || !config.maskingRule) {
      return text;
    }

    const normRule = String(config.maskingRule).replace(/[\s\-_]/g, '').toLowerCase();
    if (normRule === 'none') {
      return text;
    }

    return maskValue(text, config.maskingRule, config.visibleChars);
  };
}


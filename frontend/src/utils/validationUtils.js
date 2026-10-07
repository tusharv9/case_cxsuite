/**
 * Reusable ID and Phone Validation Utilities for Omni Suite
 */

export const SUPPORTED_ID_TYPES = [
  'NRIC Number',
  'Passport Number',
  'Account Number',
];

/**
 * Validates Malaysian MyKad / NRIC format: YYMMDD-PB-###G
 * Validates calendar date, leap year, place of birth (01-99), serial, and gender.
 * @param {string} nric
 * @returns {boolean}
 */
export function validateMalaysianNric(nric) {
  if (!nric || typeof nric !== 'string') return false;
  const clean = nric.trim();

  // Strict format: YYMMDD-PB-###G (exactly 14 characters)
  if (!/^\d{6}-\d{2}-\d{4}$/.test(clean)) {
    return false;
  }

  const [datePart, pbPart, serialGenderPart] = clean.split('-');
  const yy = parseInt(datePart.slice(0, 2), 10);
  const mm = parseInt(datePart.slice(2, 4), 10);
  const dd = parseInt(datePart.slice(4, 6), 10);

  if (mm < 1 || mm > 12) return false;

  let maxDays;
  if (mm === 2) {
    // Leap year for 2-digit year YY: YY divisible by 4 allows 29, otherwise 28
    maxDays = yy % 4 === 0 ? 29 : 28;
  } else if ([4, 6, 9, 11].includes(mm)) {
    maxDays = 30;
  } else {
    maxDays = 31;
  }

  if (dd < 1 || dd > maxDays) return false;

  // PB — Place of Birth Code: valid 2-digit range 01–99
  const pb = parseInt(pbPart, 10);
  if (isNaN(pb) || pb < 1 || pb > 99) return false;

  // Serial number (3 digits) + Gender indicator (1 digit) = 4 numeric digits
  if (serialGenderPart.length !== 4 || !/^\d{4}$/.test(serialGenderPart)) return false;

  return true;
}

/**
 * Validates identification number based on ID type.
 * Only 3 types supported: 'NRIC Number', 'Passport Number', 'Account Number'.
 * @param {string} idValue
 * @param {string} idType
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateIdentification(idValue, idType = 'NRIC Number') {
  if (!idValue || !idValue.trim()) {
    return { isValid: false, error: 'This field is required' };
  }

  const clean = idValue.trim();
  const typeLower = (idType || '').toLowerCase();

  if (typeLower.includes('passport')) {
    // Alphanumeric, 6-12 chars, no special characters or spaces
    const passportRegex = /^[A-Za-z0-9]{6,12}$/;
    if (!passportRegex.test(clean)) {
      return {
        isValid: false,
        error: 'Passport number must be 6 to 12 alphanumeric characters with no spaces or symbols (e.g. A98765432).',
      };
    }
    return { isValid: true };
  }

  if (typeLower.includes('account')) {
    // 4 to 25 alphanumeric characters
    const accountRegex = /^[A-Za-z0-9\-]{4,25}$/;
    if (!accountRegex.test(clean)) {
      return {
        isValid: false,
        error: 'Account number must be 4 to 25 alphanumeric characters (e.g. ACC-12345).',
      };
    }
    return { isValid: true };
  }

  // Default: Malaysian MyKad / NRIC Number
  if (!validateMalaysianNric(clean)) {
    return {
      isValid: false,
      error: 'Please enter in correct format',
    };
  }

  return { isValid: true };
}

/**
 * Cross-validates Date of Birth entered against the NRIC encoded birth date.
 * @param {string} nric
 * @param {string|Date} dateOfBirth
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateNricDateWithDob(nric, dateOfBirth) {
  if (!nric || !dateOfBirth) return { isValid: true };
  if (!validateMalaysianNric(nric)) return { isValid: true }; // Format error takes precedence

  const datePart = nric.trim().split('-')[0];
  const yy = parseInt(datePart.slice(0, 2), 10);
  const mm = parseInt(datePart.slice(2, 4), 10);
  const dd = parseInt(datePart.slice(4, 6), 10);

  let dobYear, dobMonth, dobDay;
  if (typeof dateOfBirth === 'string') {
    // Expecting YYYY-MM-DD
    const parts = dateOfBirth.split('T')[0].split('-');
    if (parts.length === 3) {
      dobYear = parseInt(parts[0], 10) % 100;
      dobMonth = parseInt(parts[1], 10);
      dobDay = parseInt(parts[2], 10);
    }
  } else if (dateOfBirth instanceof Date && !isNaN(dateOfBirth)) {
    dobYear = dateOfBirth.getFullYear() % 100;
    dobMonth = dateOfBirth.getMonth() + 1;
    dobDay = dateOfBirth.getDate();
  }

  if (dobYear !== undefined && (dobYear !== yy || dobMonth !== mm || dobDay !== dd)) {
    return {
      isValid: false,
      error: 'Date of Birth does not match the date in the NRIC number.',
    };
  }

  return { isValid: true };
}

/**
 * Validates Malaysian phone number format.
 * Enforces fixed +60 country code with exactly 10 contact digits.
 * @param {string} phoneNumber
 * @param {boolean} isRequired
 * @returns {{ isValid: boolean, error?: string, contactDigits?: string, formatted?: string }}
 */
export function validatePhoneNumber(phoneNumber, isRequired = true) {
  if (!phoneNumber || !phoneNumber.trim()) {
    return isRequired
      ? { isValid: false, error: 'This field is required' }
      : { isValid: true };
  }

  const clean = phoneNumber.trim();

  // Check for invalid letters or disallowed symbols
  if (!/^\+?[0-9\s\-()]+$/.test(clean)) {
    return {
      isValid: false,
      error: 'Phone number cannot contain letters or invalid symbols.',
    };
  }

  // Extract digits
  const digits = clean.replace(/\D/g, '');
  let contactDigits = digits;
  if (digits.startsWith('60')) {
    contactDigits = digits.slice(2);
  }

  if (contactDigits.length !== 10) {
    return {
      isValid: false,
      error: `Phone number must contain exactly 10 contact digits (currently ${contactDigits.length}).`,
    };
  }

  return {
    isValid: true,
    contactDigits,
    formatted: `+60 ${contactDigits.slice(0, 2)}-${contactDigits.slice(2, 5)} ${contactDigits.slice(5)}`,
  };
}


// ===== ID FORMAT RULES (client mirror of the backend's IdFormatRules) =====
// WHICH rule applies to an ID type is configuration: each ID type option arrives with its effective rule key (and a pattern for
// custom rules). Only the checkers live here, keyed by that rule key. The backend applies the same rules and is the authority.

export const ID_RULE = Object.freeze({
  MY_NRIC: 'MY_NRIC', PASSPORT: 'PASSPORT', ACCOUNT_NUMBER: 'ACCOUNT_NUMBER', ALPHANUMERIC: 'ALPHANUMERIC', REGEX: 'REGEX', ANY: 'ANY',
});

/**
 * @param {string} idValue
 * @param {{formatRule?: string, formatRegex?: string, formatMessage?: string}|undefined} option  the selected ID type option
 * @returns {{ isValid: boolean, error?: string }}
 */
export function validateIdByRule(idValue, option) {
  if (!idValue || !idValue.trim()) return { isValid: false, error: 'This field is required' };
  const clean = idValue.trim();
  const rule = option?.formatRule || ID_RULE.ANY;
  const fail = (error) => ({ isValid: false, error });

  switch (rule) {
    case ID_RULE.MY_NRIC:
      return validateMalaysianNric(clean) ? { isValid: true } : fail('Please enter in correct format');
    case ID_RULE.PASSPORT:
      return /^[A-Za-z0-9]{6,12}$/.test(clean) ? { isValid: true } : fail('Passport number must be 6 to 12 alphanumeric characters with no spaces or symbols (e.g. A98765432).');
    case ID_RULE.ACCOUNT_NUMBER:
      return /^[A-Za-z0-9-]{4,25}$/.test(clean) ? { isValid: true } : fail('Account number must be 4 to 25 alphanumeric characters (e.g. ACC-12345).');
    case ID_RULE.ALPHANUMERIC:
      return /^[A-Za-z0-9-]{1,30}$/.test(clean) ? { isValid: true } : fail(option?.formatMessage || 'Use letters, digits and hyphens only (up to 30 characters).');
    case ID_RULE.REGEX:
      try {
        return new RegExp(option.formatRegex).test(clean) ? { isValid: true } : fail(option.formatMessage || 'The ID value format is invalid.');
      } catch {
        return { isValid: true };   // an unusable pattern is ignored (the server does the same)
      }
    default:
      return { isValid: true };
  }
}

/** Only the NRIC rule encodes a birth date, so only it is cross-checked against the date of birth. */
export function validateIdAgainstDob(idValue, dateOfBirth, option) {
  return option?.formatRule === ID_RULE.MY_NRIC ? validateNricDateWithDob(idValue, dateOfBirth) : { isValid: true };
}

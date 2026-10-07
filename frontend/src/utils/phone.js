// ===== PHONE HELPERS (client mirror of the backend CountryService) =====
// Country data (name, dial code, digit rules) comes from /api/metadata/countries; nothing about a particular country is
// written here. The backend applies the same rules and is the authority.

/** Flag emoji for an ISO 3166-1 alpha-2 code, derived from the letters (no per-country table). */
export function flagOf(iso2) {
  if (!iso2 || iso2.length !== 2) return '';
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** The text of one country option, e.g. "🇮🇳 India +91". */
export function countryLabel(country) {
  return `${flagOf(country.iso2)} ${country.name} +${country.dialCode}`;
}

/** What the search box matches besides the label: ISO codes and the dial code with and without "+". */
export function countrySearchText(country) {
  return `${country.iso2} ${country.iso3} ${country.dialCode} +${country.dialCode}`;
}

/** Digits only, with a typed dial code / trunk "0" removed, capped to what the country allows. */
export function cleanNationalInput(country, raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!country) return digits.slice(0, 15);
  const typedWithPlus = String(raw ?? '').trim().startsWith('+');
  if (typedWithPlus && digits.startsWith(country.dialCode)) digits = digits.slice(country.dialCode.length);
  else if (digits.length > country.maxNationalDigits && digits.startsWith(country.dialCode)) digits = digits.slice(country.dialCode.length);
  if (digits.length > country.maxNationalDigits && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, country.maxNationalDigits);
}

/** The value sent to the API / validated by the generic rules: "+<dial> <digits>" ('' when nothing typed). */
export function fullPhone(country, national) {
  return country && national ? `+${country.dialCode} ${national}` : '';
}

/** An error message, or '' when the national number satisfies the country's rules. Blank is not this function's concern. */
export function phoneRuleError(country, national, label = 'Phone number') {
  if (!national) return '';
  if (!country) return `${label} needs a country.`;
  const n = national.length;
  if (n < country.minNationalDigits || n > country.maxNationalDigits) {
    const span = country.minNationalDigits === country.maxNationalDigits
      ? `${country.minNationalDigits} digits`
      : `${country.minNationalDigits} to ${country.maxNationalDigits} digits`;
    return `${label} must have ${span} after the +${country.dialCode} ${country.name} country code (currently ${n}).`;
  }
  if (country.nationalPattern) {
    try {
      if (!new RegExp(country.nationalPattern).test(national)) return `${label} is not a valid ${country.name} phone number.`;
    } catch {
      // An unusable pattern is ignored (the server does the same); the length rule still applies.
    }
  }
  return '';
}

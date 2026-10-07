// ===== CUSTOMER DISPLAY HELPERS =====
// What the directory shows for a customer, derived from the record only (values arrive already masked by the server).

/** The ID value to show: the one for the customer's ID type, whichever column holds it. */
export function customerIdValue(customer) {
  return customer.idValue || customer.nric || customer.passport || customer.accountNumber || '';
}

/** The ID type to show, from the record (or its custom attribute), with no assumption about which types exist. */
export function customerIdType(customer) {
  if (customer.idType) return customer.idType;
  const attrs = customer.customAttributes;
  const fromAttr = Array.isArray(attrs) ? attrs.find((a) => a.fieldKey?.toLowerCase() === 'idtype')?.fieldValue : attrs?.idType;
  return fromAttr || '';
}

/** "NRIC Number" -> "NRIC" for tight spaces (a generic trim, not a list of known types). */
export function shortIdType(idType) {
  return String(idType || '').replace(/\s+number$/i, '') || 'ID';
}

// ===== SERVER VALIDATION ERRORS =====
// The API reports every failing field at once as { error, errors: { fieldKey: [messages] } } (see the backend's
// FieldValidationException). This turns that into { fieldKey: firstMessage } so a form can mark each field.

/**
 * @param {Error & { original?: any }} err  An error thrown by the axios client (services/api.js).
 * @returns {Record<string,string>}  Empty when the error carries no per-field detail.
 */
export function fieldErrorsFromError(err) {
  const raw = err?.original?.response?.data?.errors;
  if (!raw || typeof raw !== 'object') return {};

  const result = {};
  for (const [field, messages] of Object.entries(raw)) {
    const first = Array.isArray(messages) ? messages[0] : messages;
    if (first) result[field] = String(first);
  }
  return result;
}

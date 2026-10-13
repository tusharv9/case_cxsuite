// ===== REASON FIELDS =====
// The reason picker shared by Assign, Transfer and Escalate. Options come from the action's configured list
// (ASSIGNMENT_REASON / TRANSFER_REASON / ESCALATION_REASON) — there is no built-in fallback list. An option marked
// "requires detail" (e.g. "Other") asks for a typed explanation; the server enforces the same rule.

import { useEffect, useState } from 'react';
import { Select, Textarea } from '../../common/Input/Input.jsx';
import { configurableSettingsService } from '../../../services/configurableSettingsService.js';
import { selectPlaceholder } from '../../../utils/fieldValidation.js';
import { MAX_DETAIL } from './useReasonState.js';

/**
 * @param {string}  props.listCode   ASSIGNMENT_REASON | TRANSFER_REASON | ESCALATION_REASON
 * @param {string}  props.label      e.g. "Reason", "Escalation Reason"
 * @param {boolean} props.isOpen     reload the list each time the dialog opens (an administrator may have changed it)
 * @param {object}  props.state      from useReasonState()
 * @param {object}  [props.errors]   server field errors: { reason, reasonDetail }
 */
export function ReasonFields({ listCode, label = 'Reason', isOpen, state, errors = {} }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const { reset, setOption } = state;

  useEffect(() => {
    if (!isOpen) return undefined;
    let live = true;
    reset();
    setLoading(true);
    setLoadError(null);
    configurableSettingsService
      .getLookupValues(listCode, true)
      .then((rows) => live && setOptions(rows || []))
      .catch((err) => live && setLoadError(err?.message || 'The reasons could not be loaded.'))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [isOpen, listCode, attempt, reset]);

  const choose = (value) => {
    state.setReason(value);
    setOption(options.find((o) => o.value === value) || null);
  };

  const notConfigured = !loading && !loadError && options.length === 0;

  return (
    <>
      <Select
        label={label}
        required
        value={state.reason}
        onChange={(e) => choose(e.target.value)}
        placeholder={selectPlaceholder(label)}
        isLoading={loading}
        loadError={loadError}
        onRetry={() => setAttempt((n) => n + 1)}
        disabled={notConfigured}
        error={errors.reason}
        helperText={notConfigured ? 'No reasons are configured for this action. An administrator can add them in Configurable Settings.' : undefined}
        options={options.map((o) => ({ value: o.value, label: o.label || o.value }))}
      />
      {state.needsDetail && (
        <Textarea
          label={`Explain “${state.option?.label || state.option?.value}”`}
          required
          rows={3}
          maxLength={MAX_DETAIL}
          placeholder="Describe the reason…"
          value={state.detail}
          onChange={(e) => state.setDetail(e.target.value)}
          error={errors.reasonDetail}
        />
      )}
    </>
  );
}

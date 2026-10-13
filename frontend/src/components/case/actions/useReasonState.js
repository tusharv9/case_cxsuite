// State for one reason picker (see ReasonFields): the chosen option, its explanation, and whether the pair is complete.

import { useCallback, useState } from 'react';

export const MAX_DETAIL = 500;

/** State for one reason picker: { reason, detail, option, isValid, ... } plus setters. */
export function useReasonState() {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [option, setOption] = useState(null);
  const needsDetail = Boolean(option?.requiresDetail);
  const isValid = Boolean(reason) && (!needsDetail || detail.trim().length > 0) && detail.trim().length <= MAX_DETAIL;
  const reset = useCallback(() => { setReason(''); setDetail(''); setOption(null); }, []);
  return { reason, setReason, detail, setDetail, option, setOption, needsDetail, isValid, reset,
    payload: () => ({ reason, reasonDetail: detail.trim() || undefined }) };
}


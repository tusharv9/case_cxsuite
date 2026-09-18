// ===== useToast HOOK =====

import { useMemo } from 'react';
import { useApp } from '../contexts/AppContext.jsx';

export function useToast() {
  const { addToast } = useApp();

  return useMemo(() => ({
    success: (message, duration) => addToast(message, 'success', duration),
    error: (message, duration) => addToast(message, 'error', duration),
    info: (message, duration) => addToast(message, 'info', duration),
    warning: (message, duration) => addToast(message, 'warning', duration),
  }), [addToast]);
}

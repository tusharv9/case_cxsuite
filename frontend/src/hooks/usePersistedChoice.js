// ===== PERSISTED CHOICE =====
// A choice among a fixed set of values (e.g. 'card' | 'list') that is remembered per user: applied immediately from the local
// cache, confirmed from the server, and saved back on every change.
//   const [view, setView] = usePersistedChoice('customer360.view-mode', ['card', 'list'], 'card');

import { useState, useEffect, useCallback, useRef } from 'react';
import { userPreferenceService } from '../services/userPreferenceService.js';

export function usePersistedChoice(key, allowed, fallback) {
  const valid = useCallback((v) => (allowed.includes(v) ? v : null), [allowed]);
  const [choice, setChoice] = useState(() => valid(userPreferenceService.getCached(key)) ?? fallback);
  const changedByUser = useRef(false);

  useEffect(() => {
    let alive = true;
    userPreferenceService.get(key).then((saved) => {
      // The server's answer arrives after first paint; it must not override a choice the user has already made since.
      if (alive && !changedByUser.current && valid(saved)) setChoice(saved);
    });
    return () => { alive = false; };
  }, [key, valid]);

  const update = useCallback((next) => {
    if (!valid(next)) return;
    changedByUser.current = true;
    setChoice(next);
    userPreferenceService.set(key, next);
  }, [key, valid]);

  return [choice, update];
}

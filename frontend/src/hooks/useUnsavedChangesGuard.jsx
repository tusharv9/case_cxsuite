// ===== UNSAVED-CHANGES GUARD =====
// One implementation for "you have unsaved work": warns on closing/refreshing the tab and on in-app navigation.
//   const guard = useUnsavedChangesGuard(isDirty);
//   …render {guard.dialog} once.
// (Needs a data router, which App.jsx provides.)

import { useCallback, useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { ConfirmDialog } from '../components/common/ConfirmDialog/ConfirmDialog.jsx';

export function useUnsavedChangesGuard(isDirty, message = 'You have unsaved changes. If you leave now, they will be lost.') {
  // Closing / refreshing the tab.
  useEffect(() => {
    if (!isDirty) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Navigating to another page inside the app.
  const blocker = useBlocker(useCallback(({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname, [isDirty]));

  const dialog = (
    <ConfirmDialog
      isOpen={blocker.state === 'blocked'}
      title="Discard unsaved changes?"
      message={message}
      confirmLabel="Discard and leave"
      variant="warning"
      onCancel={() => blocker.reset?.()}
      onConfirm={() => blocker.proceed?.()}
    />
  );

  return { isBlocked: blocker.state === 'blocked', dialog };
}

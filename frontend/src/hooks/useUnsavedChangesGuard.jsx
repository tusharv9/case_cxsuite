// ===== UNSAVED-CHANGES GUARD =====
// One implementation for "you have unsaved work": warns on closing/refreshing the tab and on in-app navigation.
//   const guard = useUnsavedChangesGuard(isDirty);
//   …render {guard.dialog} once.
// (Needs a data router, which App.jsx provides.)

import { useCallback, useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { UnsavedChangesDialog } from '../components/common/UnsavedChangesDialog/UnsavedChangesDialog.jsx';

/**
 * @param {boolean} isDirty
 * @param {string}  [message]  what will be lost
 * @param {object}  [options]
 * @param {'configuration'|'form'} [options.subject='configuration']
 * @param {string}  [options.itemName]  what is being edited (e.g. "SLA & Routing settings")
 * @param {() => (Promise<boolean|void>|boolean|void)} [options.onSave]  offers "Save changes"; resolve false when saving failed
 */
export function useUnsavedChangesGuard(isDirty, message, { subject = 'configuration', itemName, onSave } = {}) {
  // Closing / refreshing the tab (browsers show their own wording here).
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
    <UnsavedChangesDialog
      isOpen={blocker.state === 'blocked'}
      subject={subject}
      itemName={itemName}
      message={message}
      onContinue={() => blocker.reset?.()}
      onDiscard={() => blocker.proceed?.()}
      onSave={onSave}
      onSaved={() => blocker.proceed?.()}
    />
  );

  return { isBlocked: blocker.state === 'blocked', dialog };
}

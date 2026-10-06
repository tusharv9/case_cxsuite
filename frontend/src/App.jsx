// ===== APP.JSX — Root React component =====

import { useMemo } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from './components/common/ErrorBoundary/ErrorBoundary.jsx';
import { AppProvider } from './contexts/AppContext.jsx';
import { CaseProvider } from './contexts/CaseContext.jsx';
import { HostProvider } from './remote/HostContext.jsx';
import { resolveHostProps } from './remote/hostContract.js';
import { AppRoutes } from './routes/AppRoutes.jsx';
import { configureHost } from './services/hostBridge.js';

/**
 * App is the root component. It accepts the (optional) props a Host App passes when it mounts
 * this Remote — see src/remote/hostContract.js.
 *
 * Provider nesting order:
 *   HostProvider (what the Host gave us)
 *     └── AppProvider (user session, toasts)
 *           └── CaseProvider (board state)
 *                 └── data router (honours the Host-supplied basename; a data router is what lets screens guard unsaved changes)
 *                       └── AppRoutes (layout + pages)
 */
export default function App(props) {
  const resolved = resolveHostProps(props);
  const { basename } = resolved;

  // Must happen before any child effect runs, because the first API call needs to know whether a
  // Host token or the standalone dev identity applies.
  configureHost(resolved);

  // One router for the life of this basename (a Host pushing new props must not rebuild it and lose the current page).
  const router = useMemo(
    () => createBrowserRouter([{ path: '*', element: <AppRoutes /> }], { basename: basename || undefined }),
    [basename]
  );

  return (
    <ErrorBoundary title="Case Management could not be displayed">
      <HostProvider hostProps={props}>
        <AppProvider>
          <CaseProvider>
            <RouterProvider router={router} />
          </CaseProvider>
        </AppProvider>
      </HostProvider>
    </ErrorBoundary>
  );
}

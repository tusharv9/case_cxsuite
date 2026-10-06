// ===== APP.JSX — Root React component =====

import { BrowserRouter } from 'react-router-dom';
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
 *                 └── BrowserRouter (honours the Host-supplied basename)
 *                       └── AppRoutes (layout + pages)
 */
export default function App(props) {
  const resolved = resolveHostProps(props);
  const { basename } = resolved;

  // Must happen before any child effect runs, because the first API call needs to know whether a
  // Host token or the standalone dev identity applies.
  configureHost(resolved);

  return (
    <HostProvider hostProps={props}>
      <AppProvider>
        <CaseProvider>
          <BrowserRouter basename={basename || undefined}>
            <AppRoutes />
          </BrowserRouter>
        </CaseProvider>
      </AppProvider>
    </HostProvider>
  );
}

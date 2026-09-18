// ===== APP.JSX — Root React component =====

import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './contexts/AppContext.jsx';
import { CaseProvider } from './contexts/CaseContext.jsx';
import { AppRoutes } from './routes/AppRoutes.jsx';

/**
 * App is the root component.
 * Provider nesting order:
 *   AppProvider (user session, toasts)
 *     └── CaseProvider (board state)
 *           └── BrowserRouter
 *                 └── AppRoutes (layout + pages)
 */
export default function App() {
  return (
    <AppProvider>
      <CaseProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </CaseProvider>
    </AppProvider>
  );
}

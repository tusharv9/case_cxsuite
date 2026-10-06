// ===== IDENTITY GATE =====
// Nothing in the app may fetch data until the backend is ready and the caller is identified.
// Before this gate existed, pages fired requests at once with whatever identity was lying around
// and a backend that might still be starting; failures were swallowed and the dashboard simply
// looked empty on first load.

import { useApp } from '../../../contexts/AppContext.jsx';
import { Loader, ErrorState } from '../../common/Loader/Loader.jsx';

function seconds(ms) {
  return Math.max(0, Math.round((ms || 0) / 1000));
}

export function IdentityGate({ children }) {
  const { bootstrap, retryBootstrap } = useApp();

  if (bootstrap.phase === 'ready') return children;

  if (bootstrap.phase === 'error') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', padding: 24 }}>
        <ErrorState
          title="Case Management could not start"
          message={bootstrap.error}
          onRetry={retryBootstrap}
        />
      </div>
    );
  }

  const waited = seconds(bootstrap.elapsedMs);
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', padding: 24 }}>
      <Loader
        size="lg"
        text={waited >= 5 ? `${bootstrap.message} (${waited}s)` : bootstrap.message}
      />
    </div>
  );
}

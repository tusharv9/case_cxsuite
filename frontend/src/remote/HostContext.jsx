// ===== HOST CONTEXT =====
// Read-only view of what the Host App provided. Phase 1 only establishes the channel; later
// phases (Host identity integration) make the API client, permission checks and user pickers
// read from here instead of localStorage / hard-coded users.

import { createContext, useContext, useMemo } from 'react';
import { resolveHostProps } from './hostContract.js';

const HostContext = createContext(resolveHostProps());

export function HostProvider({ hostProps, children }) {
  const value = useMemo(() => resolveHostProps(hostProps), [hostProps]);
  return <HostContext.Provider value={value}>{children}</HostContext.Provider>;
}

export function useHost() {
  return useContext(HostContext);
}

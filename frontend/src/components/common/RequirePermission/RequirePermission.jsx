// ===== REQUIRE PERMISSION =====
// UI courtesy only: hides a page the user cannot use. The backend enforces the same permission on
// every endpoint, so removing this guard would not expose anything.

import { ShieldOff } from 'lucide-react';
import { useApp } from '../../../contexts/AppContext.jsx';
import { EmptyState } from '../Loader/Loader.jsx';

export function RequirePermission({ permission, children }) {
  const { can } = useApp();

  if (can(permission)) return children;

  return (
    <div style={{ padding: 24 }}>
      <EmptyState
        icon={ShieldOff}
        title="You don't have access to this page"
        description="Ask your administrator if you need the permission for it."
      />
    </div>
  );
}

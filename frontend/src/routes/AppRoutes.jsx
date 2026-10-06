// ===== APP ROUTES =====

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ErrorBoundary } from '../components/common/ErrorBoundary/ErrorBoundary.jsx';
import { AppLayout } from '../components/layout/AppLayout/AppLayout.jsx';
import { Loader } from '../components/common/Loader/Loader.jsx';
import { IdentityGate } from '../components/layout/IdentityGate/IdentityGate.jsx';
import { RequirePermission } from '../components/common/RequirePermission/RequirePermission.jsx';

const DashboardPage        = lazy(() => import('../pages/Dashboard/DashboardPage.jsx').then(m => ({ default: m.DashboardPage })));
const CustomerDirectoryPage = lazy(() => import('../pages/CustomerDirectory/CustomerDirectoryPage.jsx').then(m => ({ default: m.CustomerDirectoryPage })));
const Customer360Page      = lazy(() => import('../pages/Customer360/Customer360Page.jsx').then(m => ({ default: m.Customer360Page })));
const CaseManagementPage   = lazy(() => import('../pages/CaseManagement/CaseManagementPage.jsx').then(m => ({ default: m.CaseManagementPage })));
const CaseAuditTrailPage   = lazy(() => import('../pages/CaseAuditTrail/CaseAuditTrailPage.jsx').then(m => ({ default: m.CaseAuditTrailPage })));
const ConfigurableSettingsPage = lazy(() => import('../pages/ConfigurableSettings/ConfigurableSettingsPage.jsx').then(m => ({ default: m.ConfigurableSettingsPage })));
const CasesSlaRoutingPage = lazy(() => import('../pages/CasesSlaRouting/CasesSlaRoutingPage.jsx').then(m => ({ default: m.CasesSlaRoutingPage })));
const TeamsPage = lazy(() => import('../pages/Teams/TeamsPage.jsx').then(m => ({ default: m.TeamsPage })));
const TeamMonitoringPage = lazy(() => import('../pages/TeamMonitoring/TeamMonitoringPage.jsx').then(m => ({ default: m.TeamMonitoringPage })));

function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '60px 0' }}>
      <Loader text="Loading…" />
    </div>
  );
}

export function AppRoutes() {
  const { pathname } = useLocation();
  return (
    <IdentityGate>
    <AppLayout>
      <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Dashboard */}
          <Route path="/" element={<DashboardPage />} />

          {/* Customer 360 — directory listing */}
          <Route path="/customer360" element={<CustomerDirectoryPage />} />

          {/* Customer 360 — detail profile */}
          <Route path="/customer360/:customerId" element={<Customer360Page />} />

          {/* Case Management */}
          <Route path="/case-management" element={<CaseManagementPage />} />
          <Route path="/case-management/:caseId" element={<CaseManagementPage />} />

          {/* Cases SLA & Routing Configuration */}
          <Route path="/cases-sla-routing" element={<RequirePermission permission="config.manage"><CasesSlaRoutingPage /></RequirePermission>} />

          {/* Teams Management */}
          <Route path="/teams" element={<TeamsPage />} />

          {/* Team Operational Monitoring */}
          <Route path="/team-monitoring" element={<RequirePermission permission="monitoring.view"><TeamMonitoringPage /></RequirePermission>} />
          <Route path="/team-monitor" element={<RequirePermission permission="monitoring.view"><TeamMonitoringPage /></RequirePermission>} />

          {/* Case Audit Trail */}
          <Route path="/case-audit" element={<RequirePermission permission="audit.view"><CaseAuditTrailPage /></RequirePermission>} />
          <Route path="/audit-logs" element={<RequirePermission permission="audit.view"><CaseAuditTrailPage /></RequirePermission>} />

          {/* Configurable Settings */}
          <Route path="/configurable-settings" element={<RequirePermission permission="config.manage"><ConfigurableSettingsPage /></RequirePermission>} />
          <Route path="/field-settings" element={<RequirePermission permission="config.manage"><ConfigurableSettingsPage /></RequirePermission>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </AppLayout>
    </IdentityGate>
  );
}

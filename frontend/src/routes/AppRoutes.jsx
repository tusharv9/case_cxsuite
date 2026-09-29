// ===== APP ROUTES =====

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout/AppLayout.jsx';
import { Loader } from '../components/common/Loader/Loader.jsx';

const DashboardPage        = lazy(() => import('../pages/Dashboard/DashboardPage.jsx').then(m => ({ default: m.DashboardPage })));
const CustomerDirectoryPage = lazy(() => import('../pages/CustomerDirectory/CustomerDirectoryPage.jsx').then(m => ({ default: m.CustomerDirectoryPage })));
const Customer360Page      = lazy(() => import('../pages/Customer360/Customer360Page.jsx').then(m => ({ default: m.Customer360Page })));
const CaseManagementPage   = lazy(() => import('../pages/CaseManagement/CaseManagementPage.jsx').then(m => ({ default: m.CaseManagementPage })));
const CaseAuditTrailPage   = lazy(() => import('../pages/CaseAuditTrail/CaseAuditTrailPage.jsx').then(m => ({ default: m.CaseAuditTrailPage })));
const ConfigurableSettingsPage = lazy(() => import('../pages/ConfigurableSettings/ConfigurableSettingsPage.jsx').then(m => ({ default: m.ConfigurableSettingsPage })));
const CasesSlaRoutingPage = lazy(() => import('../pages/CasesSlaRouting/CasesSlaRoutingPage.jsx').then(m => ({ default: m.CasesSlaRoutingPage })));

function PageLoader() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '60px 0' }}>
      <Loader text="Loading…" />
    </div>
  );
}

export function AppRoutes() {
  return (
    <AppLayout>
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
          <Route path="/cases-sla-routing" element={<CasesSlaRoutingPage />} />

          {/* Case Audit Trail */}
          <Route path="/case-audit" element={<CaseAuditTrailPage />} />
          <Route path="/audit-logs" element={<CaseAuditTrailPage />} />

          {/* Configurable Settings */}
          <Route path="/configurable-settings" element={<ConfigurableSettingsPage />} />
          <Route path="/field-settings" element={<ConfigurableSettingsPage />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

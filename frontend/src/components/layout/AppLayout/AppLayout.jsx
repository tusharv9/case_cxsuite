import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from '../Sidebar/Sidebar.jsx';
import { Header } from '../Header/Header.jsx';
import { ToastContainer } from '../../common/Toast/Toast.jsx';
import { useApp } from '../../../contexts/AppContext.jsx';
import { useCase } from '../../../contexts/CaseContext.jsx';
import './AppLayout.css';

export function AppLayout({ children }) {
  const location = useLocation();
  const { isSidebarOpen } = useApp();
  const { selectedCase, isLoadingCase, closeDrawer } = useCase();

  // Automatically close case drawer when navigating away from Case Management
  useEffect(() => {
    if (!location.pathname.startsWith('/case-management')) {
      closeDrawer();
    }
  }, [location.pathname, closeDrawer]);

  const isCaseManagementRoute = location.pathname.startsWith('/case-management');
  const isDrawerOpen = isCaseManagementRoute && !!(selectedCase || isLoadingCase);

  const layoutClasses = [
    'app-layout',
    isSidebarOpen ? 'layout--sidebar-open' : 'layout--sidebar-closed',
    isDrawerOpen ? 'layout--drawer-open' : 'layout--drawer-closed',
  ].join(' ');

  return (
    <div className={layoutClasses}>
      <Sidebar />

      <div className="app-layout__main">
        <Header />

        <main id="main-content" className="app-layout__content scrollbar-thin">
          {children}
        </main>
      </div>

      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  );
}

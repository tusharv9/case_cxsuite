import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Sidebar } from '../Sidebar/Sidebar.jsx';
import { Header } from '../Header/Header.jsx';
import { AIAssistant } from '../../ai/AIAssistant/AIAssistant.jsx';
import { ToastContainer } from '../../common/Toast/Toast.jsx';
import { useApp } from '../../../contexts/AppContext.jsx';
import { useCase } from '../../../contexts/CaseContext.jsx';
import './AppLayout.css';

export function AppLayout({ children }) {
  const location = useLocation();
  const { isAIOpen, isSidebarOpen, dispatch } = useApp();
  const { selectedCase, isLoadingCase, closeDrawer } = useCase();
  const setIsAIOpen = (open) => dispatch({ type: 'SET_AI_OPEN', payload: open });

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
    isAIOpen ? 'layout--ai-open' : 'layout--ai-closed',
    isDrawerOpen ? 'layout--drawer-open' : 'layout--drawer-closed',
  ].join(' ');

  return (
    <div className={layoutClasses}>
      <Sidebar />

      <div className="app-layout__main">
        <Header onAIAssistantOpen={() => setIsAIOpen(true)} />

        <main id="main-content" className="app-layout__content scrollbar-thin">
          {children}
        </main>
      </div>

      {/* Floating AI Button */}
      <button
        id="ai-float-btn"
        className="ai-float-btn"
        onClick={() => setIsAIOpen(true)}
        aria-label="Open AI Assistant"
        title="AI Assistant"
      >
        <Sparkles size={22} />
        <span className="ai-float-badge" aria-hidden="true">2</span>
      </button>

      {/* AI Assistant Panel */}
      <AIAssistant isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} />

      {/* Toast Notifications */}
      <ToastContainer />
    </div>
  );
}

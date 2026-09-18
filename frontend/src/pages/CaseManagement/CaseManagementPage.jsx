// ===== CASE MANAGEMENT PAGE — OmniConnect Reference System =====

import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Layers, Sparkles, Filter, ChevronDown } from 'lucide-react';
import { CaseBoard } from '../../components/case/CaseBoard/CaseBoard.jsx';
import { useCase } from '../../contexts/CaseContext.jsx';
import { useCases } from '../../hooks/useCases.js';
import { ErrorState } from '../../components/common/Loader/Loader.jsx';
import './CaseManagementPage.css';

const CaseDrawer = lazy(() =>
  import('../../components/drawer/CaseDrawer/CaseDrawer.jsx').then((m) => ({ default: m.CaseDrawer }))
);
const CreateCaseDrawer = lazy(() =>
  import('../../components/drawer/CreateCaseDrawer/CreateCaseDrawer.jsx').then((m) => ({
    default: m.CreateCaseDrawer,
  }))
);

export function CaseManagementPage() {
  const { selectedCase, isLoadingCase, boardError, dispatch } = useCase();
  const { loadCaseDetails, refreshBoard } = useCases();
  const { caseId } = useParams();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Search & Filter States (Default: Dept = all, Status = all, CaseType = all so ALL cases load on initial page open)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptFilter, setSelectedDeptFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [selectedCaseTypeFilter, setSelectedCaseTypeFilter] = useState('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef(null);

  // If URL contains a caseId, open it
  useEffect(() => {
    if (caseId) loadCaseDetails(caseId);
  }, [caseId, loadCaseDetails]);

  // Click outside listener for filter popover
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterRef.current && !filterRef.current.contains(event.target)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCardClick = (caseData) => {
    dispatch({ type: 'SET_CASE_LOADING', payload: true });
    dispatch({ type: 'SET_SELECTED_CASE', payload: caseData });
    loadCaseDetails(caseData.id);
  };

  const handleCloseDrawer = () => {
    dispatch({ type: 'CLOSE_DRAWER' });
  };

  const handleCaseCreated = () => {
    refreshBoard();
  };

  const hasActiveFilters =
    selectedDeptFilter !== 'all' || selectedStatusFilter !== 'all' || selectedCaseTypeFilter !== 'all';

  return (
    <div className="case-management-page">
      {/* 1. BLUE GRADIENT HEADER BANNER WITH FILTER & CREATE BUTTONS */}
      <div className="case-management-page__header">
        <div className="case-management-banner">
          <div className="case-management-banner__left">
            <div className="case-management-banner__icon-box">
              <Layers size={22} color="#ffffff" />
            </div>
            <div className="case-management-banner__content">
              <div className="case-management-banner__badge">
                <Sparkles size={11} /> Module &middot; Case Management
              </div>
              <h1 className="case-management-banner__title">Cross-department board</h1>
            </div>
          </div>

          <div className="case-management-banner__controls">
            {/* Filter Button inside Blue Banner */}
            <button
              className={`btn-filter-banner ${isFilterOpen || hasActiveFilters ? 'btn-filter-banner--active' : ''}`}
              onClick={() => setIsFilterOpen(!isFilterOpen)}
            >
              <Filter size={15} />
              <span>Filter</span>
              {hasActiveFilters && <span className="banner-filter-dot" />}
              <ChevronDown size={14} />
            </button>

            {/* Create Case Button inside Blue Banner */}
            <button
              className="btn-create-case-banner"
              onClick={() => setIsCreateOpen(true)}
              id="btn-create-case"
            >
              <Plus size={15} />
              <span>Create Case</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. KANBAN BOARD WITH SEARCH BAR & FILTER POPOVER */}
      <div className="case-management-page__board">
        {boardError ? (
          <ErrorState title="Failed to load cases" message={boardError} onRetry={refreshBoard} />
        ) : (
          <CaseBoard
            onCardClick={handleCardClick}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedDeptFilter={selectedDeptFilter}
            setSelectedDeptFilter={setSelectedDeptFilter}
            selectedStatusFilter={selectedStatusFilter}
            setSelectedStatusFilter={setSelectedStatusFilter}
            selectedCaseTypeFilter={selectedCaseTypeFilter}
            setSelectedCaseTypeFilter={setSelectedCaseTypeFilter}
            isFilterOpen={isFilterOpen}
            setIsFilterOpen={setIsFilterOpen}
            filterRef={filterRef}
          />
        )}
      </div>

      {/* Case Drawer (right) */}
      <Suspense fallback={null}>
        {(selectedCase || isLoadingCase) && (
          <CaseDrawer
            caseData={selectedCase}
            isLoadingCase={isLoadingCase}
            onClose={handleCloseDrawer}
          />
        )}
      </Suspense>

      {/* Create Case Drawer (right) */}
      <Suspense fallback={null}>
        {isCreateOpen && (
          <CreateCaseDrawer
            isOpen={isCreateOpen}
            onClose={() => setIsCreateOpen(false)}
            onSuccess={handleCaseCreated}
          />
        )}
      </Suspense>
    </div>
  );
}

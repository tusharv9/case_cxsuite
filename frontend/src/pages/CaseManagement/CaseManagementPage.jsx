// ===== CASE MANAGEMENT PAGE — OmniConnect Reference System =====

import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Search, Check, ChevronDown, RotateCcw, X, Layers } from 'lucide-react';
import { CaseBoard } from '../../components/case/CaseBoard/CaseBoard.jsx';
import { CaseList } from '../../components/case/CaseList/CaseList.jsx';
import { useCase } from '../../contexts/CaseContext.jsx';
import { useCases } from '../../hooks/useCases.js';
import { useCaseListPage } from '../../hooks/useCaseListPage.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { ErrorState, Loader } from '../../components/common/Loader/Loader.jsx';
import { configurableSettingsService } from '../../services/configurableSettingsService.js';
import { Pagination } from '../../components/common/Pagination/Pagination.jsx';
import {
  STATUS_FILTER_OPTIONS,
  CASE_LIST_DEFAULT_PAGE_SIZE,
  CASE_LIST_PAGE_SIZE_OPTIONS,
} from '../../constants/index.js';
import './CaseManagementPage.css';

const CaseDrawer = lazy(() =>
  import('../../components/drawer/CaseDrawer/CaseDrawer.jsx').then((m) => ({ default: m.CaseDrawer }))
);
const CreateCaseDrawer = lazy(() =>
  import('../../components/drawer/CreateCaseDrawer/CreateCaseDrawer.jsx').then((m) => ({
    default: m.CreateCaseDrawer,
  }))
);

// Generic Dropdown with Checkmark for Filters
function FilterDropdown({ label, value, options, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentOption = options.find((o) => o.value === value) || options[0];

  return (
    <div className="case-filter-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className={`case-filter-dropdown__btn ${value !== 'all' ? 'case-filter-dropdown__btn--active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{currentOption?.label || label}</span>
        <ChevronDown size={14} className={`case-filter-dropdown__chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <ul className="case-filter-dropdown__menu" role="listbox">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                className={`case-filter-dropdown__item ${isSelected ? 'case-filter-dropdown__item--selected' : ''}`}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <span className="case-filter-dropdown__check">
                  {isSelected && <Check size={14} strokeWidth={2.5} />}
                </span>
                <span className="case-filter-dropdown__item-label">{option.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function CaseManagementPage() {
  const { caseStats, selectedCase, isLoadingCase, selectedDeptId, dispatch } = useCase();
  const { loadCaseDetails, refreshBoard } = useCases({ autoLoadStats: true });
  const { caseId } = useParams();

  const [viewMode, setViewMode] = useState('list'); // 'list' | 'board'
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Priority and channel filter options come from configuration (never a hard-coded list).
  const [priorityOptions, setPriorityOptions] = useState([{ value: 'all', label: 'All priorities' }]);
  const [channelOptions, setChannelOptions] = useState([{ value: 'all', label: 'All channels' }]);
  useEffect(() => {
    let live = true;
    configurableSettingsService.getSeverities()
      .then((list) => live && setPriorityOptions([
        { value: 'all', label: 'All priorities' },
        ...[...(list || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).map((p) => ({ value: p.name, label: p.name })),
      ]))
      .catch(() => {});
    configurableSettingsService.getLookupValues('SOURCE_CHANNEL')
      .then((list) => live && setChannelOptions([
        { value: 'all', label: 'All channels' },
        ...(list || []).map((c) => ({ value: c.value, label: c.label || c.value })),
      ]))
      .catch(() => {});
    return () => { live = false; };
  }, []);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState('all');
  const [selectedChannelFilter, setSelectedChannelFilter] = useState('all');

  // If URL contains a caseId, open it
  useEffect(() => {
    if (caseId) loadCaseDetails(caseId);
  }, [caseId, loadCaseDetails]);

  // Header counts come from GET /api/cases/stats (computed in the database), not from
  // downloading every case.
  const stats = {
    openCount: caseStats?.openCount ?? 0,
    breachedCount: caseStats?.breachedCount ?? 0,
  };

  // ---- List View: server-side pagination ----
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(CASE_LIST_DEFAULT_PAGE_SIZE);
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 300);

  // Any change to search or filters starts again from page 1.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedStatusFilter, selectedPriorityFilter, selectedChannelFilter, selectedDeptId, pageSize]);

  const listPage = useCaseListPage({
    page,
    pageSize,
    departmentId: selectedDeptId,
    search: debouncedSearch,
    status: selectedStatusFilter,
    priority: selectedPriorityFilter,
    channel: selectedChannelFilter,
    enabled: viewMode === 'list',
  });

  // If rows disappear (e.g. a case was resolved and filtered out) and the current page is now
  // past the end, step back to the last page that exists.
  useEffect(() => {
    if (!listPage.isLoading && listPage.totalPages > 0 && page > listPage.totalPages) {
      setPage(listPage.totalPages);
    }
  }, [listPage.isLoading, listPage.totalPages, page]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedStatusFilter !== 'all' ||
    selectedPriorityFilter !== 'all' ||
    selectedChannelFilter !== 'all';

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedStatusFilter('all');
    setSelectedPriorityFilter('all');
    setSelectedChannelFilter('all');
  };

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

  return (
    <div className="case-management-page">
      {/* 1. BLUE HEADER BANNER (Matching Dashboard Reference Pattern) */}
      <div className="case-management-page__header">
        <div className="case-management-banner">
          <div className="case-management-banner__left">
            <div className="case-management-banner__icon-box">
              <Layers size={22} color="#ffffff" />
            </div>
            <div className="case-management-banner__content">
              <div className="case-management-banner__title-row">
                <h1 className="case-management-banner__title">Case Management</h1>
              </div>
              <p className="case-management-banner__subtitle">
                {stats.openCount} open &middot; {stats.breachedCount} SLA breached &middot; omnichannel intake enabled
              </p>
            </div>
          </div>

          <div className="case-management-banner__controls">
            {/* List / Board View Switch Toggle */}
            <div className="banner-view-toggle-group" role="group" aria-label="View toggle">
              <button
                type="button"
                className={`banner-view-toggle-btn ${viewMode === 'list' ? 'banner-view-toggle-btn--active' : ''}`}
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
              >
                List
              </button>
              <button
                type="button"
                className={`banner-view-toggle-btn ${viewMode === 'board' ? 'banner-view-toggle-btn--active' : ''}`}
                onClick={() => setViewMode('board')}
                aria-pressed={viewMode === 'board'}
              >
                Board
              </button>
            </div>

            {/* + New Case Button (Previous blue theme button) */}
            <button
              type="button"
              className="btn-create-case-banner"
              onClick={() => setIsCreateOpen(true)}
              id="btn-create-case"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span>New Case</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. FILTER & SEARCH TOOLBAR */}
      <div className="case-management-toolbar">
        {/* Search Input */}
        <div className="case-management-search">
          <Search size={15} className="case-management-search__icon" />
          <input
            type="search"
            className="case-management-search__input"
            placeholder="Search cases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="case-management-search__clear"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filters Group */}
        <div className="case-management-filters">
          {/* Status Filter */}
          <FilterDropdown
            label="All statuses"
            value={selectedStatusFilter}
            options={STATUS_FILTER_OPTIONS}
            onChange={setSelectedStatusFilter}
          />

          {/* Priority Filter */}
          <FilterDropdown
            label="All priorities"
            value={selectedPriorityFilter}
            options={priorityOptions}
            onChange={setSelectedPriorityFilter}
          />

          {/* Channel Filter (Excludes Mobile App) */}
          <FilterDropdown
            label="All channels"
            value={selectedChannelFilter}
            options={channelOptions}
            onChange={setSelectedChannelFilter}
          />

          {/* Reset Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              className="case-management-reset-btn"
              onClick={handleResetFilters}
              title="Reset search & filters"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. MAIN CONTENT: LIST OR BOARD VIEW */}
      <div className="case-management-content">
        {viewMode === 'list' ? (
          listPage.error ? (
            <ErrorState title="Failed to load cases" message={listPage.error} onRetry={listPage.refresh} />
          ) : (
            <>
              {listPage.isLoading && listPage.items.length === 0 ? (
                <div className="case-management-list-loading">
                  <Loader text="Loading cases…" />
                </div>
              ) : (
                <CaseList
                  cases={listPage.items}
                  selectedCaseId={selectedCase?.id}
                  onCaseClick={handleCardClick}
                />
              )}
              <Pagination
                page={page}
                pageSize={pageSize}
                totalCount={listPage.totalCount}
                totalPages={listPage.totalPages}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={CASE_LIST_PAGE_SIZE_OPTIONS}
                isLoading={listPage.isLoading}
              />
            </>
          )
        ) : (
          <CaseBoard
            selectedCaseId={selectedCase?.id}
            onCardClick={handleCardClick}
            departmentId={selectedDeptId}
            searchQuery={searchQuery}
            selectedStatusFilter={selectedStatusFilter}
            selectedPriorityFilter={selectedPriorityFilter}
            selectedChannelFilter={selectedChannelFilter}
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

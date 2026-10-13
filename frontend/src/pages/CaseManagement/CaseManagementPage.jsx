// ===== CASE MANAGEMENT PAGE — OmniConnect Reference System =====

import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Search, RotateCcw, X, Layers } from 'lucide-react';
import { CaseBoard } from '../../components/case/CaseBoard/CaseBoard.jsx';
import { CaseList } from '../../components/case/CaseList/CaseList.jsx';
import { useCase } from '../../contexts/CaseContext.jsx';
import { useCases } from '../../hooks/useCases.js';
import { useCaseListPage } from '../../hooks/useCaseListPage.js';
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js';
import { ErrorState, Loader } from '../../components/common/Loader/Loader.jsx';
import { Select } from '../../components/common/Input/Input.jsx';
import { configurableSettingsService } from '../../services/configurableSettingsService.js';
import { departmentService } from '../../services/departmentService.js';
import { Pagination } from '../../components/common/Pagination/Pagination.jsx';
import {
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

// Where each configurable filter of the case list gets its options, and the list query parameter it sets.
function lookupSource(typeCode, param) {
  return {
    param,
    load: () => configurableSettingsService.getLookupValues(typeCode).then((list) => (list || []).map((v) => ({ value: v.value, label: v.label || v.value }))),
  };
}

const FILTER_SOURCES = {
  status: lookupSource('CASE_STATUS', 'status'),
  sourceChannel: lookupSource('SOURCE_CHANNEL', 'channel'),
  severity: {
    param: 'priority',
    load: () => configurableSettingsService.getSeverities().then((list) =>
      [...(list || [])].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).map((p) => ({ value: p.name, label: p.isActive === false ? `${p.name} (inactive)` : p.name }))),
  },
  caseType: {
    param: 'caseType',
    load: () => configurableSettingsService.getCaseTypes(false).then((list) => (list || []).map((c) => ({ value: c.name, label: c.isActive === false ? `${c.name} (inactive)` : c.name }))),
  },
  departmentId: {
    param: 'departmentId',
    load: () => departmentService.getAllDepartments().then((list) => (list || []).map((d) => ({ value: d.id, label: d.isActive === false ? `${d.name} (inactive)` : d.name }))),
  },
};

// A filter chip on the case list: the shared searchable Select in the list's compact chip style ("all" = no filter).
function FilterDropdown({ label, value, options, onChange }) {
  return (
    <div className="case-filter-dropdown">
      <Select
        aria-label={label}
        className={`case-filter-select${value !== 'all' ? ' case-filter-select--active' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={options}
        placeholder={label}
        searchPlaceholder="Search…"
      />
    </div>
  );
}

export function CaseManagementPage() {
  const { caseStats, selectedCase, isLoadingCase, selectedDeptId, dispatch } = useCase();
  const { loadCaseDetails, refreshBoard } = useCases({ autoLoadStats: true });
  const { caseId } = useParams();

  const [viewMode, setViewMode] = useState('list'); // 'list' | 'board'
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Filters come from Configurable Settings → Case Management → Case Filters (which, in what order, under what label); each one's
  // options come from the configured master data. A configured filter the list cannot apply is skipped, never faked.
  const [filters, setFilters] = useState([]);            // [{ apiField, label, param, options }]
  const [filterValues, setFilterValues] = useState({});  // apiField -> value ('all' = no filter)
  const [filtersError, setFiltersError] = useState(null);
  useEffect(() => {
    let live = true;
    configurableSettingsService.getFields('CaseManagement', 'Filters')
      .then(async (fields) => {
        const visible = (fields || []).filter((f) => f.isVisible !== false).sort((a, b) => a.displayOrder - b.displayOrder);
        const built = [];
        for (const f of visible) {
          const source = FILTER_SOURCES[f.apiField] || (f.lookupTypeCode ? lookupSource(f.lookupTypeCode, null) : null);
          if (!source?.param) continue;
          const options = await source.load().catch(() => []);
          built.push({ apiField: f.apiField, label: f.displayLabel || f.apiField, param: source.param, options });
        }
        if (!live) return;
        setFilters(built);
        setFilterValues(Object.fromEntries(built.map((f) => [f.apiField, 'all'])));
      })
      .catch((err) => live && setFiltersError(err?.message || 'The filters could not be loaded.'));
    return () => { live = false; };
  }, []);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const filterParam = (param) => {
    const f = filters.find((x) => x.param === param);
    return f ? filterValues[f.apiField] ?? 'all' : 'all';
  };
  const departmentFilter = filterParam('departmentId');
  const effectiveDeptId = departmentFilter !== 'all' ? departmentFilter : selectedDeptId;

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
  }, [debouncedSearch, filterValues, effectiveDeptId, pageSize]);

  const listPage = useCaseListPage({
    page,
    pageSize,
    departmentId: effectiveDeptId,
    search: debouncedSearch,
    status: filterParam('status'),
    priority: filterParam('priority'),
    channel: filterParam('channel'),
    caseType: filterParam('caseType'),
    enabled: viewMode === 'list',
  });

  // If rows disappear (e.g. a case was resolved and filtered out) and the current page is now
  // past the end, step back to the last page that exists.
  useEffect(() => {
    if (!listPage.isLoading && listPage.totalPages > 0 && page > listPage.totalPages) {
      setPage(listPage.totalPages);
    }
  }, [listPage.isLoading, listPage.totalPages, page]);

  const hasActiveFilters = searchQuery.trim() !== '' || Object.values(filterValues).some((v) => v !== 'all');

  const handleResetFilters = () => {
    setSearchQuery('');
    setFilterValues(Object.fromEntries(filters.map((f) => [f.apiField, 'all'])));
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
          {filters.map((f) => (
            <FilterDropdown
              key={f.apiField}
              label={`${f.label}: All`}
              value={filterValues[f.apiField] ?? 'all'}
              options={[{ value: 'all', label: `${f.label}: All` }, ...f.options]}
              onChange={(v) => setFilterValues((prev) => ({ ...prev, [f.apiField]: v }))}
            />
          ))}
          {filtersError && <span className="case-management-filters__error" title={filtersError}>Filters unavailable</span>}

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
            departmentId={effectiveDeptId}
            searchQuery={searchQuery}
            selectedStatusFilter={filterParam('status')}
            selectedPriorityFilter={filterParam('priority')}
            selectedChannelFilter={filterParam('channel')}
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

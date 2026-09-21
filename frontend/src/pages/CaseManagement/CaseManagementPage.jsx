// ===== CASE MANAGEMENT PAGE — OmniConnect Reference System =====

import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Search, Check, ChevronDown, RotateCcw, X, Layers, Sparkles } from 'lucide-react';
import { CaseBoard } from '../../components/case/CaseBoard/CaseBoard.jsx';
import { CaseList } from '../../components/case/CaseList/CaseList.jsx';
import { useCase } from '../../contexts/CaseContext.jsx';
import { useCases } from '../../hooks/useCases.js';
import { ErrorState } from '../../components/common/Loader/Loader.jsx';
import {
  STATUS_FILTER_OPTIONS,
  PRIORITY_FILTER_OPTIONS,
  CHANNEL_FILTER_OPTIONS,
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
  const { boardCases, selectedCase, isLoadingCase, isLoadingBoard, boardError, dispatch } = useCase();
  const { loadCaseDetails, refreshBoard } = useCases();
  const { caseId } = useParams();

  const [viewMode, setViewMode] = useState('list'); // 'list' | 'board'
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState('all');
  const [selectedChannelFilter, setSelectedChannelFilter] = useState('all');

  // If URL contains a caseId, open it
  useEffect(() => {
    if (caseId) loadCaseDetails(caseId);
  }, [caseId, loadCaseDetails]);

  // Statistics derived dynamically from database
  const stats = useMemo(() => {
    let openCount = 0;
    let breachedCount = 0;
    const now = Date.now();

    (boardCases || []).forEach((c) => {
      const isResolved = c.status === 'Resolved';
      const isPaused = c.status === 'WaitingOnCustomer' || c.status === 'Waiting on Customer' || Boolean(c.slaPausedAt);
      if (!isResolved) {
        openCount++;
      }
      if (!isResolved && !isPaused) {
        const start = new Date(c.slaStartTime || c.createdAt || now).getTime();
        const targetMs = (c.slaTargetHours || 24) * 3600 * 1000;
        const pausedMs = (c.slaTotalPausedMinutes || 0) * 60 * 1000;
        if (start + targetMs + pausedMs - now <= 0) {
          breachedCount++;
        }
      }
    });

    return { openCount, breachedCount };
  }, [boardCases]);

  // Unified Filter Logic (Single Source of Truth for List and Board)
  const filteredCases = useMemo(() => {
    return (boardCases || []).filter((c) => {
      // 1. Search Query
      if (searchQuery && searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesNumber = c.caseNumber?.toLowerCase().includes(q);
        const matchesTitle = c.title?.toLowerCase().includes(q);
        const matchesCustomer = c.customerName?.toLowerCase().includes(q);
        const matchesAgent = c.ownerName?.toLowerCase().includes(q);
        const matchesChildId = c.childRelations?.some((cr) => cr.childId?.toLowerCase().includes(q));
        if (!matchesNumber && !matchesTitle && !matchesCustomer && !matchesAgent && !matchesChildId) return false;
      }

      // 2. Status Filter
      if (selectedStatusFilter !== 'all') {
        const normFilter = selectedStatusFilter.toLowerCase().replace(/[\s_]/g, '');
        const normStatus = (c.status || '').toLowerCase().replace(/[\s_]/g, '');
        if (normStatus !== normFilter) return false;
      }

      // 3. Priority Filter
      if (selectedPriorityFilter !== 'all') {
        const normFilter = selectedPriorityFilter.toLowerCase();
        const normSeverity = (c.severity || '').toLowerCase();
        const mapped = normSeverity === 'bad' ? 'critical' : (normSeverity === 'warn' ? 'high' : (normSeverity === 'info' ? 'medium' : (normSeverity === 'ok' ? 'low' : normSeverity)));
        if (mapped !== normFilter) return false;
      }

      // 4. Channel Filter
      if (selectedChannelFilter !== 'all') {
        const normFilter = selectedChannelFilter.toLowerCase();
        const rawChannel = (c.sourceChannel || c.communicationChannel || 'Voice').toLowerCase();
        const mapped = rawChannel === 'phone' ? 'voice' : rawChannel;
        if (mapped !== normFilter) return false;
      }

      return true;
    });
  }, [boardCases, searchQuery, selectedStatusFilter, selectedPriorityFilter, selectedChannelFilter]);

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
                <span className="case-management-banner__badge">
                  <Sparkles size={11} /> Omnichannel
                </span>
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

            {/* + New Case Button */}
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
            options={PRIORITY_FILTER_OPTIONS}
            onChange={setSelectedPriorityFilter}
          />

          {/* Channel Filter (Excludes Mobile App) */}
          <FilterDropdown
            label="All channels"
            value={selectedChannelFilter}
            options={CHANNEL_FILTER_OPTIONS}
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
        {boardError ? (
          <ErrorState title="Failed to load cases" message={boardError} onRetry={refreshBoard} />
        ) : viewMode === 'list' ? (
          <CaseList
            cases={filteredCases}
            selectedCaseId={selectedCase?.id}
            onCaseClick={handleCardClick}
          />
        ) : (
          <CaseBoard
            cases={filteredCases}
            selectedCaseId={selectedCase?.id}
            onCardClick={handleCardClick}
            isLoadingBoard={isLoadingBoard}
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

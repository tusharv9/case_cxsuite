// ===== CASE BOARD — OmniConnect Reference System =====

import { useState, useMemo, useEffect } from 'react';
import { Package, RotateCcw, Search, X } from 'lucide-react';
import { CaseCard } from '../CaseCard/CaseCard.jsx';
import { useCase } from '../../../contexts/CaseContext.jsx';
import { caseService } from '../../../services/caseService.js';
import { useDepartments } from '../../../hooks/useDepartments.js';
import { BOARD_COLUMNS } from '../../../constants/index.js';
import { Skeleton } from '../../common/Skeleton/Skeleton.jsx';
import './CaseBoard.css';

// --- Single Kanban Column ---
function CaseColumn({ column, cases, selectedCaseId, onCardClick }) {
  const statusKey = column.key.toLowerCase().replace('inprogress', 'inprogress');
  return (
    <div className={`case-column case-column--${statusKey}`} role="region" aria-label={`${column.label} cases`}>
      <div className="case-column__header">
        <span className="case-column__indicator" aria-hidden="true" />
        <span className="case-column__title">{column.label}</span>
        <span className="case-column__count">{cases.length}</span>
      </div>
      <div className="case-column__body">
        {cases.length === 0 ? (
          <div className="case-column__empty">
            <Package size={28} strokeWidth={1.2} />
            <span>No cases</span>
          </div>
        ) : (
          cases.map((c) => (
            <CaseCard
              key={c.id}
              caseData={c}
              isSelected={c.id === selectedCaseId}
              onClick={() => onCardClick(c)}
              onHandleClick={() => onCardClick(c, 'InProgress')}
            />
          ))
        )}
      </div>
    </div>
  );
}

// --- Board ---
export function CaseBoard({
  onCardClick,
  searchQuery,
  setSearchQuery,
  selectedDeptFilter,
  setSelectedDeptFilter,
  selectedStatusFilter,
  setSelectedStatusFilter,
  selectedCaseTypeFilter,
  setSelectedCaseTypeFilter,
  isFilterOpen,
  setIsFilterOpen,
  filterRef,
}) {
  const { boardCases, isLoadingBoard, selectedCase, dispatch } = useCase();
  const { departments } = useDepartments();

  // Dynamic Department Options
  const deptOptions = useMemo(() => {
    const defaultDepts = [
      'Contact Center',
      'Cards',
      'Fraud',
      'Loans & Mortgages',
      'Micro Finance',
      'Customer Operations',
    ];
    if (!departments || departments.length === 0) return defaultDepts;
    const names = departments.map((d) => d.name);
    defaultDepts.forEach((d) => {
      if (!names.includes(d)) names.push(d);
    });
    return names;
  }, [departments]);

  // Combinable Filter Logic (Case Type = Inquiry / Complaint / Service / all)
  const filteredCases = useMemo(() => {
    return boardCases.filter((c) => {
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
      if (selectedStatusFilter !== 'all' && c.status !== selectedStatusFilter) {
        return false;
      }

      // 3. Department Filter
      if (
        selectedDeptFilter !== 'all' &&
        c.departmentName !== selectedDeptFilter &&
        c.departmentId !== selectedDeptFilter
      ) {
        return false;
      }

      // 4. Case Type Filter (Complaints -> Complaint, Service -> Service, Inquiry -> Inquiry / I-)
      if (selectedCaseTypeFilter !== 'all') {
        const type =
          c.caseType ||
          (c.caseNumber?.startsWith('S-')
            ? 'Service'
            : c.caseNumber?.startsWith('I-') || c.caseNumber?.startsWith('E-')
            ? 'Inquiry'
            : 'Complaint');

        const normFilter = selectedCaseTypeFilter === 'Enquiry' ? 'Inquiry' : selectedCaseTypeFilter;
        const normType = type === 'Enquiry' ? 'Inquiry' : type;

        if (normType !== normFilter) return false;
      }

      return true;
    });
  }, [boardCases, searchQuery, selectedStatusFilter, selectedDeptFilter, selectedCaseTypeFilter]);

  // Group Cases into Kanban Columns
  const groupedCases = useMemo(() => {
    return BOARD_COLUMNS.reduce((acc, col) => {
      acc[col.key] = filteredCases.filter((c) => c.status === col.key);
      return acc;
    }, {});
  }, [filteredCases]);

  // Card click handler — Open cases do NOT open side drawer! InProgress, Escalated, Resolved open drawer.
  const handleCardClickWithAction = async (c, newStatus) => {
    if (newStatus) {
      // Optimistic update for Handle button
      dispatch({ type: 'UPDATE_SELECTED_CASE', payload: { id: c.id, status: newStatus } });
      try {
        await caseService.updateCaseStatus(c.id, { status: newStatus });
      } catch (err) {
        console.error('Failed to update case status:', err);
        dispatch({ type: 'UPDATE_SELECTED_CASE', payload: { id: c.id, status: c.status } });
      }
    } else {
      // If case status is Open, do NOT open side drawer!
      if (c.status === 'Open') {
        return;
      }
      onCardClick(c);
    }
  };

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedDeptFilter !== 'all' ||
    selectedStatusFilter !== 'all' ||
    selectedCaseTypeFilter !== 'all';

  const handleReset = () => {
    setSearchQuery('');
    setSelectedDeptFilter('all');
    setSelectedStatusFilter('all');
    setSelectedCaseTypeFilter('all');
    setIsFilterOpen(false);
  };

  if (isLoadingBoard) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="board-toolbar">
          <Skeleton width="280px" height="34px" borderRadius="var(--radius-md)" />
        </div>
        <div className="case-board" role="main">
          {BOARD_COLUMNS.map((col) => {
            const statusKey = col.key.toLowerCase().replace('inprogress', 'inprogress');
            return (
              <div key={col.key} className={`case-column case-column--${statusKey}`}>
                <div className="case-column__header">
                  <span className="case-column__indicator" aria-hidden="true" />
                  <span className="case-column__title">{col.label}</span>
                  <span className="case-column__count">-</span>
                </div>
                <div className="case-column__body">
                  <Skeleton.Card style={{ marginBottom: 12, padding: 12 }}>
                    <Skeleton.Text lines={2} style={{ marginBottom: 12 }} />
                  </Skeleton.Card>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* TOOLBAR FOR DEDICATED CASE SEARCH & RESET */}
      <div className="board-toolbar">
        <div className="board-search-wrapper">
          <Search size={15} className="board-search-icon" />
          <input
            type="search"
            className="board-search-input"
            placeholder="Search case #, title, customer, agent..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="board-search-clear" onClick={() => setSearchQuery('')} title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>

        {hasActiveFilters && (
          <button className="board-reset-btn" onClick={handleReset} title="Reset search & filters">
            <RotateCcw size={14} /> Reset Filters
          </button>
        )}
      </div>

      {/* FILTER POPOVER PANEL (DEPARTMENT, STATUS, CASE TYPE) */}
      {isFilterOpen && (
        <div className="board-filter-popover" ref={filterRef}>
          <div className="filter-popover-header">
            <span className="filter-popover-title">FILTERS</span>
            <button className="filter-popover-close" onClick={() => setIsFilterOpen(false)}>
              <X size={14} />
            </button>
          </div>

          <div className="filter-popover-body">
            {/* 1. Department Filter */}
            <div className="filter-popover-field">
              <label className="filter-popover-label">Department</label>
              <select
                className="filter-popover-select"
                value={selectedDeptFilter}
                onChange={(e) => setSelectedDeptFilter(e.target.value)}
              >
                <option value="all">All Departments</option>
                {deptOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Status Filter */}
            <div className="filter-popover-field">
              <label className="filter-popover-label">Status</label>
              <select
                className="filter-popover-select"
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="Open">Open</option>
                <option value="InProgress">In Progress</option>
                <option value="Escalated">Escalated</option>
                <option value="Resolved">Resolved</option>
              </select>
            </div>

            {/* 3. Case Type Filter */}
            <div className="filter-popover-field">
              <label className="filter-popover-label">Case Type</label>
              <select
                className="filter-popover-select"
                value={selectedCaseTypeFilter}
                onChange={(e) => setSelectedCaseTypeFilter(e.target.value)}
              >
                <option value="all">All Case Types</option>
                <option value="Complaint">Complaints</option>
                <option value="Service">Service</option>
                <option value="Inquiry">Inquiry</option>
              </select>
            </div>
          </div>

          <div className="filter-popover-footer">
            <button className="filter-popover-btn-reset" onClick={handleReset}>
              Reset
            </button>
            <button className="filter-popover-btn-apply" onClick={() => setIsFilterOpen(false)}>
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Kanban columns */}
      <div className="case-board" role="main">
        {BOARD_COLUMNS.map((col) => (
          <CaseColumn
            key={col.key}
            column={col}
            cases={groupedCases[col.key] || []}
            selectedCaseId={selectedCase?.id}
            onCardClick={handleCardClickWithAction}
          />
        ))}
      </div>
    </div>
  );
}

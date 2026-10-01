// ===== CUSTOMER DIRECTORY PAGE — OmniConnect Reference System =====

import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, ChevronRight, Users, Search, Filter, RotateCcw, Sparkles, X, ChevronDown, UserCheck } from 'lucide-react';
import { Button } from '../../components/common/Button/Button.jsx';
import { Avatar } from '../../components/common/Avatar/Avatar.jsx';
import { Loader } from '../../components/common/Loader/Loader.jsx';
import { customerService } from '../../services/customerService.js';
import { configurableSettingsService } from '../../services/configurableSettingsService.js';
import { formatDate } from '../../utils/dateUtils.js';
import { createFieldMasker } from '../../utils/maskUtils.js';
import { CreateCustomerDrawer } from '../../components/drawer/CreateCustomerDrawer/CreateCustomerDrawer.jsx';
import { ExistingCustomerDrawer } from '../../components/drawer/ExistingCustomerDrawer/ExistingCustomerDrawer.jsx';
import { Pagination } from '../../components/common/Pagination/Pagination.jsx';
import './CustomerDirectoryPage.css';

function CustomerCard({ customer, onClick, mask }) {
  const rawIdType = customer.idType ||
    (Array.isArray(customer.customAttributes)
      ? customer.customAttributes.find((a) => a.fieldKey?.toLowerCase() === 'idtype')?.fieldValue
      : customer.customAttributes?.idType) ||
    'NRIC Number';

  const typeLower = (rawIdType || '').toLowerCase();
  let idLabel = 'NRIC';
  let rawIdVal = customer.nric || customer.idValue || '';
  if (typeLower.includes('passport')) {
    idLabel = 'Passport';
    rawIdVal = customer.passport || customer.idValue || '';
  } else if (typeLower.includes('account')) {
    idLabel = 'Account Number';
    rawIdVal = customer.accountNumber || customer.idValue || '';
  }

  const maskedId = mask ? (mask('idValue', rawIdVal) || mask('nric', rawIdVal) || rawIdVal) : (rawIdVal || '—');
  const maskedName = mask ? (mask('fullName', customer.fullName) || customer.fullName) : customer.fullName;
  const maskedPhone = mask ? (mask('phoneNumber', customer.phoneNumber) || customer.phoneNumber) : customer.phoneNumber;
  const maskedDob = customer.dateOfBirth
    ? (mask ? mask('dateOfBirth', formatDate(customer.dateOfBirth)) : formatDate(customer.dateOfBirth))
    : null;
  const maskedBranch = mask ? (mask('branch', customer.branch) || customer.branch) : customer.branch;
  const maskedLanguage = mask ? (mask('preferredLanguage', customer.preferredLanguage) || customer.preferredLanguage) : customer.preferredLanguage;

  return (
    <div
      className="customer-card"
      onClick={() => onClick(customer)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick(customer)}
    >
      <div className="customer-card__top">
        <Avatar name={customer.fullName} size="md" />
        <div className="customer-card__name-block">
          <p className="customer-card__name">{maskedName}</p>
          <p className="customer-card__nric">{`${idLabel}: ${maskedId}`}</p>
        </div>
        <span className="customer-card__badge">Active</span>
      </div>

      <div className="customer-card__divider" />

      <div className="customer-card__details">
        {customer.dateOfBirth && (
          <div className="customer-card__detail-row">
            <span className="customer-card__detail-label">DOB</span>
            <span>{maskedDob}</span>
          </div>
        )}
        {customer.phoneNumber && (
          <div className="customer-card__detail-row">
            <span className="customer-card__detail-label">Phone</span>
            <span>{maskedPhone}</span>
          </div>
        )}
        {customer.branch && (
          <div className="customer-card__detail-row">
            <span className="customer-card__detail-label">Branch</span>
            <span>{maskedBranch}</span>
          </div>
        )}
        {customer.preferredLanguage && (
          <div className="customer-card__detail-row">
            <span className="customer-card__detail-label">Language</span>
            <span>{maskedLanguage}</span>
          </div>
        )}
        {!customer.phoneNumber && !customer.branch && !customer.preferredLanguage && (
          <div className="customer-card__detail-row" style={{ color: 'var(--color-text-tertiary)' }}>
            No additional details available
          </div>
        )}
      </div>

      <div className="customer-card__arrow">
        <ChevronRight size={16} />
      </div>
    </div>
  );
}

export function CustomerDirectoryPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isExistingOpen, setIsExistingOpen] = useState(false);

  // Search & Filter States
  const [search, setSearch] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [languageFilter, setLanguageFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const filterRef = useRef(null);

  // Pagination States
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await customerService.getPaginatedCustomers({
        search: search.trim() || undefined,
        preferredLanguage: languageFilter !== 'all' ? languageFilter : undefined,
        branch: branchFilter !== 'all' ? branchFilter : undefined,
        page,
        pageSize,
      });
      if (data && Array.isArray(data.items)) {
        setCustomers(data.items);
        setTotalCount(data.totalCount || 0);
        setTotalPages(data.totalPages || 1);
      } else if (Array.isArray(data)) {
        setCustomers(data);
        setTotalCount(data.length);
        setTotalPages(1);
      }
    } catch (err) {
      setError(err.message || 'Failed to load customers.');
    } finally {
      setIsLoading(false);
    }
  }, [search, languageFilter, branchFilter, page, pageSize]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

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

  const [dbLanguages, setDbLanguages] = useState([]);
  const [dbBranches, setDbBranches] = useState([]);
  // Sensitive/masking configuration for the values rendered on each customer card
  const [maskFn, setMaskFn] = useState(() => null);

  useEffect(() => {
    async function fetchLookups() {
      try {
        const [langs, brs] = await Promise.all([
          configurableSettingsService.getLookupValues('PREFERRED_LANGUAGE', true),
          configurableSettingsService.getLookupValues('HOME_BRANCH', true),
        ]);
        if (langs) setDbLanguages(langs.map((l) => l.value));
        if (brs) setDbBranches(brs.map((b) => b.value));
      } catch (e) {
        console.error('Failed to load database filter lookups:', e);
      }

      try {
        const fields = await configurableSettingsService.getFields('Customer360', null, true);
        const fn = createFieldMasker(fields || []);
        setMaskFn(() => fn);
      } catch (e) {
        console.error('Failed to load masking configuration:', e);
      }
    }
    fetchLookups();
  }, []);

  // Dynamically extract unique available languages and branches
  const availableLanguages = useMemo(() => {
    const langs = new Set(dbLanguages);
    customers.forEach((c) => {
      if (c.preferredLanguage) langs.add(c.preferredLanguage);
    });
    return Array.from(langs).sort();
  }, [customers, dbLanguages]);

  const availableBranches = useMemo(() => {
    const branches = new Set(dbBranches);
    customers.forEach((c) => {
      if (c.branch) branches.add(c.branch);
    });
    return Array.from(branches).sort();
  }, [customers, dbBranches]);

  const handleCustomerClick = (customer) => {
    localStorage.setItem('csm_selected_customer_id', customer.id);
    navigate(`/customer360/${customer.id}`);
  };

  const handleCustomerCreated = () => {
    loadCustomers(true);
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleLanguageChange = (val) => {
    setLanguageFilter(val);
    setPage(1);
  };

  const handleBranchChange = (val) => {
    setBranchFilter(val);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch('');
    setLanguageFilter('all');
    setBranchFilter('all');
    setPage(1);
    setIsFilterOpen(false);
  };

  const hasActiveFilters = search.trim() !== '' || languageFilter !== 'all' || branchFilter !== 'all';

  return (
    <div className="customer-dir-page">
      {/* 1. BLUE GRADIENT HEADER BANNER */}
      <div className="customer-dir-page__header">
        <div className="customer-dir-banner">
          <div className="customer-dir-banner__left">
            <div className="customer-dir-banner__icon-box">
              <Users size={22} color="#ffffff" />
            </div>
            <div className="customer-dir-banner__content">
              <h1 className="customer-dir-banner__title">Customer Directory</h1>
              <p className="customer-dir-banner__subtitle">
                {isLoading
                  ? 'Loading customer base…'
                  : `${totalCount.toLocaleString()} Customers`}
              </p>
            </div>
          </div>

          <div className="customer-dir-banner__actions">
            <button
              className="btn-create-customer-banner"
              onClick={() => setIsCreateOpen(true)}
              id="btn-create-customer"
            >
              <PlusCircle size={15} />
              <span>Create Customer</span>
            </button>

            <button
              className="btn-existing-customer-banner"
              onClick={() => setIsExistingOpen(true)}
              id="btn-existing-customer"
            >
              <UserCheck size={15} />
              <span>Existing Customer</span>
            </button>
          </div>
        </div>

        {/* 2. DEDICATED SEARCH & FILTER TOOLBAR */}
        <div className="customer-dir-toolbar">
          <div className="customer-dir-search-wrapper">
            <Search size={15} className="customer-dir-search-icon" />
            <input
              type="search"
              className="customer-dir-search-input"
              placeholder="Search name, ID, phone, branch..."
              value={search}
              onChange={handleSearchChange}
            />
            {search && (
              <button className="customer-dir-search-clear" onClick={() => { setSearch(''); setPage(1); }} title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="customer-dir-toolbar-actions" ref={filterRef}>
            <button
              className={`customer-dir-filter-btn ${isFilterOpen || (hasActiveFilters && search === '') ? 'customer-dir-filter-btn--active' : ''}`}
              onClick={() => setIsFilterOpen(!isFilterOpen)}
            >
              <Filter size={15} />
              <span>Filter</span>
              {(languageFilter !== 'all' || branchFilter !== 'all') && (
                <span className="filter-badge-dot" />
              )}
              <ChevronDown size={14} />
            </button>

            {hasActiveFilters && (
              <button
                className="customer-dir-reset-btn"
                onClick={handleResetFilters}
                title="Reset all search and filters"
              >
                <RotateCcw size={14} />
                <span>Reset</span>
              </button>
            )}

            {/* Filter Popover Panel */}
            {isFilterOpen && (
              <div className="customer-dir-filter-popover">
                <div className="filter-popover-header">
                  <span className="filter-popover-title">FILTERS</span>
                  <button className="filter-popover-close" onClick={() => setIsFilterOpen(false)}>
                    <X size={14} />
                  </button>
                </div>

                <div className="filter-popover-body">
                  {/* Preferred Language Filter */}
                  <div className="filter-popover-field">
                    <label className="filter-popover-label">Preferred Language</label>
                    <select
                      className="filter-popover-select"
                      value={languageFilter}
                      onChange={(e) => handleLanguageChange(e.target.value)}
                    >
                      <option value="all">All Languages</option>
                      {availableLanguages.map((lang) => (
                        <option key={lang} value={lang}>
                          {lang}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Home Branch Filter */}
                  <div className="filter-popover-field">
                    <label className="filter-popover-label">Home Branch</label>
                    <select
                      className="filter-popover-select"
                      value={branchFilter}
                      onChange={(e) => handleBranchChange(e.target.value)}
                    >
                      <option value="all">All Branches</option>
                      {availableBranches.map((br) => (
                        <option key={br} value={br}>
                          {br}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="filter-popover-footer">
                  <button className="filter-popover-btn-reset" onClick={handleResetFilters}>
                    Reset
                  </button>
                  <button className="filter-popover-btn-apply" onClick={() => setIsFilterOpen(false)}>
                    Apply Filters
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. CUSTOMER CARDS GRID */}
      <div className="customer-dir-page__body scrollbar-thin">
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <Loader text="Loading customer directory…" />
          </div>
        ) : error ? (
          <div className="customer-dir-empty">
            <Users size={40} style={{ opacity: 0.3 }} />
            <p className="customer-dir-empty__title">Failed to load customers</p>
            <p className="customer-dir-empty__desc">{error}</p>
            <Button variant="outline" onClick={() => loadCustomers(true)} style={{ marginTop: 8 }}>
              Retry
            </Button>
          </div>
        ) : customers.length === 0 ? (
          <div className="customer-dir-empty">
            <Users size={40} style={{ opacity: 0.3 }} />
            <p className="customer-dir-empty__title">No customers found</p>
            <p className="customer-dir-empty__desc">
              {hasActiveFilters
                ? 'No customer records match your search or filter criteria. Try resetting your filters.'
                : 'Create your first customer to get started.'}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" onClick={handleResetFilters} style={{ marginTop: 8 }}>
                Reset Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="customer-dir-grid">
            {customers.map((c) => (
              <CustomerCard key={c.id} customer={c} onClick={handleCustomerClick} mask={maskFn} />
            ))}
          </div>
        )}
      </div>

      {/* 4. PINNED BOTTOM PAGINATION */}
      {!isLoading && !error && customers.length > 0 && (
        <div className="customer-dir-page__footer">
          <Pagination
            itemLabel="customers"
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(1);
            }}
            pageSizeOptions={[10, 20, 50]}
            isLoading={isLoading}
          />
        </div>
      )}

      {/* Create Customer Drawer */}
      {isCreateOpen && (
        <CreateCustomerDrawer
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={handleCustomerCreated}
        />
      )}

      {/* Existing Customer Drawer */}
      {isExistingOpen && (
        <ExistingCustomerDrawer
          isOpen={isExistingOpen}
          onClose={() => setIsExistingOpen(false)}
        />
      )}
    </div>
  );
}

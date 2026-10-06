// ===== CUSTOMER 360 PAGE =====

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Avatar } from '../../components/common/Avatar/Avatar.jsx';
import { DeptBadge, SeverityBadge } from '../../components/common/Badge/Badge.jsx';
import { getSlaConfig } from '../../utils/slaUtils.js';
import { useNow } from '../../hooks/useNow.js';
import { Tabs } from '../../components/common/Tabs/Tabs.jsx';
import { EmptyState, ErrorState, Loader } from '../../components/common/Loader/Loader.jsx';
import { Skeleton } from '../../components/common/Skeleton/Skeleton.jsx';
import { Pagination } from '../../components/common/Pagination/Pagination.jsx';
import { useCustomer } from '../../hooks/useCustomer.js';
import { formatDate } from '../../utils/dateUtils.js';
import { customerService } from '../../services/customerService.js';
import { configurableSettingsService } from '../../services/configurableSettingsService.js';
import { ProductHoldingCards } from '../../components/customer360/ProductHoldingCards/ProductHoldingCards.jsx';
import { BankingTimeline } from '../../components/customer360/BankingTimeline/BankingTimeline.jsx';
import { TransactionTable } from '../../components/customer360/TransactionTable/TransactionTable.jsx';
import { ReferralChain } from '../../components/customer360/ReferralChain/ReferralChain.jsx';
import { RefreshStatusButton } from '../../components/customer360/RefreshStatusButton/RefreshStatusButton.jsx';
import './Customer360Page.css';

function OverviewTab({ customer }) {
  return (
    <div style={{ padding: '0 4px' }}>
      {/* Products Holding */}
      <p className="overview-section-title">PRODUCT HOLDING (SHARIAH-AWARE)</p>
      <ProductHoldingCards products={customer?.products} />

      {/* Recent Interactions */}
      <p className="overview-section-title">RECENT INTERACTIONS TIMELINE</p>
      <BankingTimeline events={customer?.timelineEvents} />
    </div>
  );
}

// ---- Customer Profile Panel ----
function ProfilePanel({ customer }) {
  const rawIdType = customer?.idType ||
    (Array.isArray(customer?.customAttributes)
      ? customer.customAttributes.find((a) => a.fieldKey?.toLowerCase() === 'idtype')?.fieldValue
      : customer?.customAttributes?.idType) ||
    'NRIC Number';

  const typeLower = (rawIdType || '').toLowerCase();
  let idLabel = 'NRIC';
  let rawIdVal = customer?.nric || customer?.idValue || '';
  if (typeLower.includes('passport')) {
    idLabel = 'Passport';
    rawIdVal = customer?.passport || customer?.idValue || '';
  } else if (typeLower.includes('account')) {
    idLabel = 'Account Number';
    rawIdVal = customer?.accountNumber || customer?.idValue || '';
  }

  // Sensitive values arrive already masked by the server; this page only displays them.
  const maskedId = rawIdVal || '—';
  const maskedPhone = customer?.phoneNumber || '—';
  const maskedEmail = customer?.email || '—';
  const maskedBranch = customer?.branch || '—';
  const maskedLanguage = customer?.preferredLanguage || '—';

  const formattedDob = customer?.dateOfBirth ? formatDate(customer.dateOfBirth) : '—';
  const maskedDob = customer?.dateOfBirth ? formattedDob : '—';

  const formatAttributeLabel = (key) => {
    if (!key) return '';
    if (key.toLowerCase() === 'idtype') return 'ID Type';
    return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
  };

  return (
    <div className="customer-profile-panel">
      {/* Main profile card */}
      <div className="profile-card">
        <div className="profile-card__top">
          <Avatar name={customer?.fullName || 'Customer'} size="xl" />
          <div>
            <p className="profile-card__name">{customer?.fullName}</p>
            <p className="profile-card__nric">{idLabel}: {maskedId}</p>
          </div>
        </div>

        <div className="profile-info-list">
          <div className="profile-info-row">
            <span className="profile-info-row__label">Date of birth</span>
            <span className="profile-info-row__value">{maskedDob}</span>
          </div>
          <div className="profile-info-row">
            <span className="profile-info-row__label">Phone</span>
            <span className="profile-info-row__value">{maskedPhone}</span>
          </div>
          <div className="profile-info-row">
            <span className="profile-info-row__label">Email</span>
            <span className="profile-info-row__value">{maskedEmail}</span>
          </div>
          <div className="profile-info-row">
            <span className="profile-info-row__label">Home branch</span>
            <span className="profile-info-row__value">{maskedBranch}</span>
          </div>
          <div className="profile-info-row">
            <span className="profile-info-row__label">Preferred language</span>
            <span className="profile-info-row__value" style={{ fontWeight: 700, color: '#1d4ed8' }}>
              {maskedLanguage}
            </span>
          </div>
          {Array.isArray(customer?.customAttributes)
            ? customer.customAttributes
                .filter((attr) => !['idtype', 'idvalue', 'nric', 'passport', 'accountnumber'].includes((attr.fieldKey || '').toLowerCase()))
                .map((attr) => (
                  <div key={attr.fieldKey || attr.id} className="profile-info-row">
                    <span className="profile-info-row__label">{formatAttributeLabel(attr.fieldKey)}</span>
                    <span className="profile-info-row__value">{attr.fieldValue}</span>
                  </div>
                ))
            : customer?.customAttributes &&
              Object.entries(customer.customAttributes)
                .filter(([key]) => !['idtype', 'idvalue', 'nric', 'passport', 'accountnumber'].includes((key || '').toLowerCase()))
                .map(([key, val]) => (
                  <div key={key} className="profile-info-row">
                    <span className="profile-info-row__label">{formatAttributeLabel(key)}</span>
                    <span className="profile-info-row__value">{val}</span>
                  </div>
                ))}
        </div>
      </div>
    </div>
  );
}

// ---- Cases List Tab ----
function CasesList({ customerId, initialCases = [], totalCases = 0 }) {
  const now = useNow(1000);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5); // Requirement 12: Default rows per page: 5 on initial load
  const [cases, setCases] = useState(initialCases.slice(0, 5));
  const [totalCount, setTotalCount] = useState(totalCases || initialCases.length);
  const [totalPages, setTotalPages] = useState(Math.max(1, Math.ceil((totalCases || initialCases.length) / 5)));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCases = async (targetPage, targetPageSize) => {
    if (!customerId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await customerService.getCustomerCases(customerId, { page: targetPage, pageSize: targetPageSize });
      if (res && Array.isArray(res.items)) {
        setCases(res.items);
        setTotalCount(res.totalCount);
        setTotalPages(res.totalPages || Math.max(1, Math.ceil(res.totalCount / targetPageSize)));
      } else if (Array.isArray(res)) {
        setCases(res);
        setTotalCount(res.length);
        setTotalPages(1);
      }
    } catch (err) {
      setError(err?.message || 'Failed to load cases.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialCases.length > 5) {
      fetchCases(1, 5);
    } else {
      setCases(initialCases);
      const count = totalCases || initialCases.length;
      setTotalCount(count);
      setTotalPages(Math.max(1, Math.ceil(count / 5)));
      setPage(1);
    }
  }, [customerId, initialCases, totalCases]);

  const handlePageChange = (newPage) => {
    setPage(newPage);
    fetchCases(newPage, pageSize);
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setPage(1);
    fetchCases(1, newSize);
  };

  if (isLoading && cases.length === 0) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
        <Loader text="Loading customer cases…" />
      </div>
    );
  }

  if (error && cases.length === 0) {
    return (
      <ErrorState
        title="Failed to load cases"
        message={error}
        onRetry={() => fetchCases(page, pageSize)}
      />
    );
  }

  if (!cases?.length) {
    return <EmptyState title="No cases" description="No case history found for this customer." />;
  }

  return (
    <div className="cases-list-container">
      <div className="cases-list">
        <div className="case-list-header">
          <div className="case-list-header__main">CASE</div>
          <div className="case-list-header__col">DEPARTMENT</div>
          <div className="case-list-header__col">SEVERITY</div>
          <div className="case-list-header__col">SLA</div>
        </div>
        {cases.map((c) => {
          const isResolved = c.status === 'Resolved';
          const created = new Date(c.slaStartTime || c.createdAt || Date.now()).getTime();
          const { internalHours } = getSlaConfig(c.severity, c.slaTargetHours);
          const remainingMs = Math.max(0, created + (internalHours * 3600 * 1000) - now);
          const absMs = Math.abs(remainingMs);
          const hours = String(Math.floor(absMs / 3600000)).padStart(2, '0');
          const minutes = String(Math.floor((absMs % 3600000) / 60000)).padStart(2, '0');
          const seconds = String(Math.floor((absMs % 60000) / 1000)).padStart(2, '0');
          const slaText = isResolved ? 'WITHIN' : `${hours}h ${minutes}m ${seconds}s`;

          return (
            <div key={c.id} className="case-list-item">
              <div className="case-list-item__main">
                <p className="case-list-item__number">{c.caseNumber}</p>
                <p className="case-list-item__title">{isResolved ? `Resolved · ${c.title}` : c.title}</p>
              </div>
              <div className="case-list-item__col">
                <DeptBadge name={c.departmentName} size="sm" />
              </div>
              <div className="case-list-item__col">
                <SeverityBadge severity={c.severity} size="sm" />
              </div>
              <div className="case-list-item__col case-list-item__col--sla">
                {slaText}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '16px' }}>
        <Pagination
          itemLabel="cases"
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={[5, 10, 20, 'Custom']}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}

// ---- Main Customer360 Page ----
export function Customer360Page() {
  const { customerId } = useParams();
  const { customer, isLoading, error, loadCustomer360 } = useCustomer();

  const customerCases = customer?.cases ?? [];

  useEffect(() => {
    if (customerId) {
      loadCustomer360(customerId);
    }
  }, [customerId, loadCustomer360]);

  if (!customerId || isLoading) {
    return (
      <div className="customer360-page">
        <div className="customer360-page__header">
          <div className="customer360-banner">
            <div className="customer360-banner__left">
              <div className="customer360-banner__icon-box">
                <Users size={22} color="#ffffff" />
              </div>
              <div className="customer360-banner__content">
                <h1 className="customer360-banner__title">Customer 360°</h1>
                <p className="customer360-banner__subtitle">Loading customer profile…</p>
              </div>
            </div>
          </div>
        </div>

        <div className="customer360-layout">
          <div className="customer-profile-panel">
            <Skeleton.Card className="profile-card">
              <div className="profile-card__top">
                <Skeleton.Avatar size={56} />
                <div style={{ flex: 1, paddingLeft: 12 }}>
                  <Skeleton.Text lines={1} width="80%" style={{ marginBottom: 4 }} />
                  <Skeleton.Text lines={1} width="60%" />
                </div>
              </div>
            </Skeleton.Card>
          </div>
          <div className="customer-content-panel">
            <Skeleton.Card style={{ height: '500px' }} />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState title="Failed to load customer" message={error} onRetry={() => loadCustomer360(customerId)} />;
  }

  if (!customer) {
    return <EmptyState title="Customer not found" />;
  }

  const products = customer.products || [];
  const timelineEvents = customer.timelineEvents || [];
  const transactions = customer.transactions || [];
  const referrals = customer.referrals || [];

  const tabs = [
    {
      key: 'overview',
      label: 'Overview',
      content: <OverviewTab customer={customer} />,
    },
    {
      key: 'products',
      label: `Products (${products.length})`,
      content: <div style={{ padding: '8px 0' }}><ProductHoldingCards products={products} /></div>,
    },
    {
      key: 'timeline',
      label: 'Timeline',
      content: <div style={{ padding: '8px 0' }}><BankingTimeline events={timelineEvents} /></div>,
    },
    {
      key: 'cases',
      label: `Cases (${customer?.totalCasesCount ?? customerCases.length})`,
      content: (
        <div style={{ padding: '8px 0' }}>
          <CasesList
            customerId={customerId}
            initialCases={customerCases}
            totalCases={customer?.totalCasesCount ?? customerCases.length}
          />
        </div>
      ),
    },
    {
      key: 'transaction',
      label: 'Transaction',
      content: <div style={{ padding: '8px 0' }}><TransactionTable transactions={transactions} /></div>,
    },
    {
      key: 'referral',
      label: `Referral chain (${referrals.length})`,
      content: (
        <div style={{ padding: '8px 0' }}>
          <ReferralChain referrals={referrals} referralStatus={customer.referralStatus} />
        </div>
      ),
    },
  ];

  return (
    <div className="customer360-page">
      <div className="customer360-page__header">
        <div className="customer360-banner">
          <div className="customer360-banner__left">
            <div className="customer360-banner__icon-box">
              <Users size={22} color="#ffffff" />
            </div>
            <div className="customer360-banner__content">
              <h1 className="customer360-banner__title">Customer 360°</h1>
              <p className="customer360-banner__subtitle">
                {customer?.fullName ? `${customer.fullName} · Profile & Cases` : 'Comprehensive customer profile'}
              </p>
            </div>
          </div>

          <div className="customer360-banner__actions">
            <RefreshStatusButton onRefresh={() => loadCustomer360(customerId)} />
          </div>
        </div>
      </div>

      <div className="customer360-layout">
        <ProfilePanel customer={customer} />
        <div className="customer-content-panel">
          <Tabs tabs={tabs} defaultTab="overview" />
        </div>
      </div>
    </div>
  );
}

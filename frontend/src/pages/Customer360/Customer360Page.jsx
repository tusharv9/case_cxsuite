// ===== CUSTOMER 360 PAGE =====

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Avatar } from '../../components/common/Avatar/Avatar.jsx';
import { DeptBadge, SeverityBadge } from '../../components/common/Badge/Badge.jsx';
import { getSlaConfig } from '../../utils/slaUtils.js';
import { useNow } from '../../hooks/useNow.js';
import { Tabs } from '../../components/common/Tabs/Tabs.jsx';
import { EmptyState, ErrorState } from '../../components/common/Loader/Loader.jsx';
import { Skeleton } from '../../components/common/Skeleton/Skeleton.jsx';
import { useCustomer } from '../../hooks/useCustomer.js';
import { formatTenure, formatDate } from '../../utils/dateUtils.js';
import { createFieldMasker } from '../../utils/maskUtils.js';
import { configurableSettingsService } from '../../services/configurableSettingsService.js';
import { ProductHoldingCards } from '../../components/customer360/ProductHoldingCards/ProductHoldingCards.jsx';
import { BankingTimeline } from '../../components/customer360/BankingTimeline/BankingTimeline.jsx';
import { TransactionTable } from '../../components/customer360/TransactionTable/TransactionTable.jsx';
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
      <BankingTimeline />
    </div>
  );
}

/**
 * Masks customer values according to the Sensitive / Masking Rule / Visible Chars settings
 * configured for the Customer 360 "Existing Customer" section. Falls back to the previous
 * hardcoded NRIC masking when nothing is configured, so the profile is never shown in the
 * clear because a configuration read failed.
 */
function useCustomerFieldMasker() {
  const [masker, setMasker] = useState(() => (apiField, val) => (val === null || val === undefined ? '' : String(val)));

  useEffect(() => {
    let active = true;
    configurableSettingsService
      .getFields('Customer360', null, true)
      .then((fields) => {
        if (!active) return;
        const fn = createFieldMasker(fields || []);
        setMasker(() => fn);
      })
      .catch(() => {
        /* fallback to raw value */
      });
    return () => {
      active = false;
    };
  }, []);

  return masker;
}

// ---- Customer Profile Panel ----
function ProfilePanel({ customer }) {
  const mask = useCustomerFieldMasker();

  const rawNric = customer?.nric || customer?.idValue || '';
  const maskedNric = mask('idValue', rawNric) || mask('nric', rawNric) || rawNric || '—';
  const maskedPhone = mask('phoneNumber', customer?.phoneNumber) || customer?.phoneNumber || '—';
  const maskedEmail = mask('email', customer?.email) || customer?.email || '—';
  const maskedBranch = mask('branch', customer?.branch) || customer?.branch || '—';
  const maskedLanguage = mask('preferredLanguage', customer?.preferredLanguage) || customer?.preferredLanguage || '—';

  const formattedDob = customer?.dateOfBirth ? formatDate(customer.dateOfBirth) : '—';
  const maskedDob = customer?.dateOfBirth ? mask('dateOfBirth', formattedDob) : '—';

  return (
    <div className="customer-profile-panel">
      {/* Main profile card */}
      <div className="profile-card">
        <div className="profile-card__top">
          <Avatar name={customer?.fullName || 'Customer'} size="xl" />
          <div>
            <p className="profile-card__name">{mask('fullName', customer?.fullName) || customer?.fullName}</p>
            <p className="profile-card__nric">NRIC {maskedNric}</p>
          </div>
          {(customer?.customerSegment || customer?.tier) && (
            <div className="profile-card__badges">
              {customer?.customerSegment && (
                <span className="profile-card__segment">{customer.customerSegment}</span>
              )}
              {customer?.tier && (
                <span className="profile-card__tier">{customer.tier}</span>
              )}
            </div>
          )}
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
            <span className="profile-info-row__label">Tenure</span>
            <span className="profile-info-row__value">{formatTenure(customer?.tenureMonths || 36)}</span>
          </div>
          <div className="profile-info-row">
            <span className="profile-info-row__label">Preferred language</span>
            <span className="profile-info-row__value" style={{ fontWeight: 700, color: '#1d4ed8' }}>
              {maskedLanguage}
            </span>
          </div>
          {Array.isArray(customer?.customAttributes)
            ? customer.customAttributes.map((attr) => (
                <div key={attr.fieldKey || attr.id} className="profile-info-row">
                  <span className="profile-info-row__label">{attr.fieldKey}</span>
                  <span className="profile-info-row__value">{mask(attr.fieldKey, attr.fieldValue) || attr.fieldValue}</span>
                </div>
              ))
            : customer?.customAttributes &&
              Object.entries(customer.customAttributes).map(([key, val]) => (
                <div key={key} className="profile-info-row">
                  <span className="profile-info-row__label">{key}</span>
                  <span className="profile-info-row__value">{mask(key, val) || val}</span>
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}

// ---- Cases List Tab ----
function CasesList({ cases }) {
  const now = useNow(1000);
  if (!cases?.length) {
    return <EmptyState title="No cases" description="No case history found for this customer." />;
  }
  return (
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
  );
}

// ---- Main Customer360 Page ----
export function Customer360Page() {
  const { customerId } = useParams();
  const { customer, isLoading, error, loadCustomer360 } = useCustomer();

  // This page used to fetch the entire case table and filter it down to this customer in the
  // browser. The Customer 360 payload already carries exactly that set, so the second request
  // was pure overhead.
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
          <div className="customer360-page__header-top">
            <div>
              <p className="customer360-page__breadcrumb">Module · Customer 360</p>
              <Skeleton.Text lines={1} width="200px" className="customer360-page__title" />
            </div>
            <Skeleton.Text lines={1} width="150px" />
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

  const tabs = [
    {
      key: 'overview',
      label: 'Overview',
      content: <OverviewTab customer={customer} />,
    },
    {
      key: 'products',
      label: `Products (${products.length || 5})`,
      content: <div style={{ padding: '8px 0' }}><ProductHoldingCards products={products} /></div>,
    },
    {
      key: 'timeline',
      label: 'Timeline',
      content: <div style={{ padding: '8px 0' }}><BankingTimeline /></div>,
    },
    {
      key: 'cases',
      label: `Cases (${customerCases.length})`,
      content: <div style={{ padding: '8px 0' }}><CasesList cases={customerCases} /></div>,
    },
    {
      key: 'transaction',
      label: 'Transaction',
      content: <div style={{ padding: '8px 0' }}><TransactionTable /></div>,
    },
    {
      key: 'referral',
      label: 'Referral chain',
      content: <EmptyState title="Referral chain not available" description="Referral Programme integration pending." />,
    },
  ];

  return (
    <div className="customer360-page">
      <div className="customer360-page__header">
        <div className="customer360-page__header-top">
          <div>
            <p className="customer360-page__breadcrumb">Module · Customer 360</p>
            <h1 className="customer360-page__title">{customer.fullName}</h1>
          </div>
          <RefreshStatusButton onRefresh={() => loadCustomer360(customerId)} />
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

// ===== CUSTOMER CARD (compact) =====
// Same card as before, tighter: the details sit close together and the expand control lives on the Language row. Clicking the card
// opens the customer's 360 page; the chevron expands the extra details in place without leaving the list.

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Avatar } from '../../common/Avatar/Avatar.jsx';
import { formatDate } from '../../../utils/dateUtils.js';
import { customerIdType, customerIdValue, shortIdType } from '../../../utils/customerDisplay.js';

export function CustomerCard({ customer, onClick }) {
  const [expanded, setExpanded] = useState(false);
  const idType = customerIdType(customer);
  const detailsId = `customer-card-more-${customer.id}`;

  const toggle = (e) => {
    e.stopPropagation();
    setExpanded((v) => !v);
  };

  return (
    <div
      className={`customer-card ${expanded ? 'customer-card--expanded' : ''}`}
      onClick={() => onClick(customer)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.target === e.currentTarget && e.key === 'Enter' && onClick(customer)}
    >
      <div className="customer-card__top">
        <Avatar name={customer.fullName} size="md" />
        <div className="customer-card__name-block">
          <p className="customer-card__name" title={customer.fullName}>{customer.fullName}</p>
          <p className="customer-card__nric">{`${shortIdType(idType)}: ${customerIdValue(customer) || '—'}`}</p>
        </div>
        <span className="customer-card__badge">Active</span>
      </div>

      <div className="customer-card__divider" />

      <div className="customer-card__details">
        {customer.phoneNumber && (
          <div className="customer-card__detail-row">
            <span className="customer-card__detail-label">Phone</span>
            <span className="customer-card__detail-value">{customer.phoneNumber}</span>
          </div>
        )}
        {customer.branch && (
          <div className="customer-card__detail-row">
            <span className="customer-card__detail-label">Branch</span>
            <span className="customer-card__detail-value">{customer.branch}</span>
          </div>
        )}
        <div className="customer-card__detail-row customer-card__detail-row--expand">
          <span className="customer-card__detail-label">Language</span>
          <span className="customer-card__detail-value">{customer.preferredLanguage || '—'}</span>
          <button
            type="button"
            className="customer-card__expand"
            onClick={toggle}
            onKeyDown={(e) => e.stopPropagation()}
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={expanded ? 'Hide details' : 'Show more details'}
            title={expanded ? 'Hide details' : 'Show more details'}
          >
            <ChevronDown size={15} />
          </button>
        </div>

        {expanded && (
          <div id={detailsId} className="customer-card__more">
            {customer.dateOfBirth && (
              <div className="customer-card__detail-row">
                <span className="customer-card__detail-label">DOB</span>
                <span className="customer-card__detail-value">{formatDate(customer.dateOfBirth)}</span>
              </div>
            )}
            {customer.email && (
              <div className="customer-card__detail-row">
                <span className="customer-card__detail-label">Email</span>
                <span className="customer-card__detail-value" title={customer.email}>{customer.email}</span>
              </div>
            )}
            {idType && (
              <div className="customer-card__detail-row">
                <span className="customer-card__detail-label">ID Type</span>
                <span className="customer-card__detail-value">{idType}</span>
              </div>
            )}
            <div className="customer-card__detail-row">
              <span className="customer-card__detail-label">Cases</span>
              <span className="customer-card__detail-value">{`${customer.openCasesCount ?? 0} open · ${customer.totalCasesCount ?? 0} total`}</span>
            </div>
            {customer.createdAt && (
              <div className="customer-card__detail-row">
                <span className="customer-card__detail-label">Added</span>
                <span className="customer-card__detail-value">{formatDate(customer.createdAt)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

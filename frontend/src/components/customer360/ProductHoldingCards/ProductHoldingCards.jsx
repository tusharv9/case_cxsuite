// ===== PRODUCT HOLDING CARDS =====

import './ProductHoldingCards.css';

export const MOCK_PRODUCT_HOLDINGS = [
  {
    id: 'prod-1',
    name: 'Akaun Simpanan BSN-i',
    type: 'Shariah savings',
    balance: 'MYR 12,840',
  },
  {
    id: 'prod-2',
    name: 'GIRO BSN-i',
    type: 'Current account',
    balance: 'MYR 3,420',
  },
  {
    id: 'prod-3',
    name: 'Personal Financing-i',
    type: 'Tenure 5y - 18mo in',
    balance: 'MYR 28,500',
  },
  {
    id: 'prod-4',
    name: 'BSN Visa Debit',
    type: 'Active',
    balance: 'Linked',
  },
  {
    id: 'prod-5',
    name: 'SSPN-i Plus',
    type: 'Education fund',
    balance: 'MYR 4,200',
  },
];

export function ProductHoldingCards({ products = MOCK_PRODUCT_HOLDINGS }) {
  const items = products && products.length > 0 ? products : MOCK_PRODUCT_HOLDINGS;

  return (
    <div className="product-holdings-grid">
      {items.map((item, idx) => {
        const title = item.name || item.title || 'Product';
        const sub = item.type || item.sub || item.accountNo || '';
        const val = item.balance || item.value || 'Active';

        return (
          <div key={item.id || idx} className="product-holding-card">
            <h4 className="product-holding-card__title">{title}</h4>
            <p className="product-holding-card__sub">{sub}</p>
            <p className="product-holding-card__value">{val}</p>
          </div>
        );
      })}
    </div>
  );
}

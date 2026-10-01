// ===== PRODUCT HOLDING CARDS =====

import './ProductHoldingCards.css';

export function ProductHoldingCards({ products = [] }) {
  const items = Array.isArray(products) ? products : [];

  if (items.length === 0) {
    return (
      <div className="product-holdings-empty" style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', background: 'var(--color-surface, #ffffff)', borderRadius: 'var(--radius-md, 8px)', border: '1px dashed var(--color-border, #e2e8f0)' }}>
        <p style={{ fontWeight: 600, color: 'var(--color-text-primary, #0f172a)' }}>No products available</p>
        <p style={{ fontSize: '13px', marginTop: 4, color: 'var(--color-text-tertiary, #64748b)' }}>No product holding records available for this customer.</p>
      </div>
    );
  }

  return (
    <div className="product-holdings-grid">
      {items.map((item, idx) => {
        const title = item.productName || item.name || item.title || 'Product';
        const sub = item.productType || item.type || item.sub || item.accountNumber || '';
        const val = item.balance || item.value || item.status || 'Active';

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

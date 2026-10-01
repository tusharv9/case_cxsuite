// ===== TRANSACTION TABLE COMPONENT =====

import { ArrowDownLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { formatDate } from '../../../utils/dateUtils.js';
import './TransactionTable.css';

export function TransactionTable({ transactions = [] }) {
  const items = Array.isArray(transactions) ? transactions : [];

  if (items.length === 0) {
    return (
      <div className="transaction-empty" style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', background: 'var(--color-surface, #ffffff)', borderRadius: 'var(--radius-md, 8px)', border: '1px dashed var(--color-border, #e2e8f0)' }}>
        <p style={{ fontWeight: 600, color: 'var(--color-text-primary, #0f172a)' }}>No transaction data available</p>
        <p style={{ fontSize: '13px', marginTop: 4, color: 'var(--color-text-tertiary, #64748b)' }}>No transaction records found for this customer.</p>
      </div>
    );
  }

  return (
    <div className="transaction-section">
      <div className="transaction-section__header">
        <div className="transaction-section__header-title">
          <span>Customer Transactions ({items.length})</span>
        </div>
      </div>

      <div className="transaction-table-wrapper">
        <table className="transaction-table">
          <thead>
            <tr>
              <th>DATE</th>
              <th>DESCRIPTION</th>
              <th>DEBIT</th>
              <th>CREDIT</th>
              <th>BALANCE</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {items.map((tx, idx) => {
              const isCredit = (tx.type || '').toLowerCase() === 'credit';
              const amtFormatted = tx.amount != null ? `MYR ${Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
              const balFormatted = tx.balanceAfter != null ? `MYR ${Number(tx.balanceAfter).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
              const dateFormatted = tx.transactionDate ? formatDate(tx.transactionDate) : (tx.date || '—');

              return (
                <tr key={tx.id || idx}>
                  <td className="tx-date">{dateFormatted}</td>
                  <td>
                    <div className="tx-desc">
                      <span className={`tx-icon ${isCredit ? 'tx-icon-credit' : 'tx-icon-debit'}`}>
                        {isCredit ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                      </span>
                      <span>{tx.description || 'Transaction'}</span>
                    </div>
                  </td>
                  <td className="tx-debit">
                    {!isCredit ? <span className="tx-amount-debit">{amtFormatted}</span> : '—'}
                  </td>
                  <td className="tx-credit">
                    {isCredit ? <span className="tx-amount-credit">{amtFormatted}</span> : '—'}
                  </td>
                  <td className="tx-balance">{balFormatted}</td>
                  <td>
                    <span className="tx-status-chip">
                      <CheckCircle2 size={12} />
                      <span>{tx.status || 'Completed'}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

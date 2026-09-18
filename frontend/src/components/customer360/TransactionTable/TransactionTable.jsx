// ===== TRANSACTION TABLE COMPONENT =====

import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronDown, Download } from 'lucide-react';
import './TransactionTable.css';

export const MOCK_MONTHLY_CASHFLOW = [
  { month: 'Jan', amount: 'MYR 5,800', barHeight: 65, active: false },
  { month: 'Feb', amount: 'MYR 5,650', barHeight: 60, active: false },
  { month: 'Mar', amount: 'MYR 5,900', barHeight: 70, active: false },
  { month: 'Apr', amount: 'MYR 6,100', barHeight: 78, active: false },
  { month: 'May', amount: 'MYR 6,420', barHeight: 88, active: false },
  { month: 'Jun', amount: 'MYR 6,740', barHeight: 100, active: true },
];

export const MOCK_TRANSACTIONS = [
  {
    id: 'tx-1',
    date: '15 Jun 2026',
    description: 'Salary Credit - PETRONAS DAGANGAN BHD',
    debit: '—',
    credit: 'MYR 6,740.00',
    balance: 'MYR 12,840.50',
    status: 'Completed',
    type: 'credit'
  },
  {
    id: 'tx-2',
    date: '14 Jun 2026',
    description: 'ATM Withdrawal - BSN KL HQ Branch',
    debit: 'MYR 500.00',
    credit: '—',
    balance: 'MYR 6,100.50',
    status: 'Completed',
    type: 'debit'
  },
  {
    id: 'tx-3',
    date: '10 Jun 2026',
    description: 'DuitNow Transfer to Ahmad Zaki',
    debit: 'MYR 350.00',
    credit: '—',
    balance: 'MYR 6,600.50',
    status: 'Completed',
    type: 'debit'
  },
  {
    id: 'tx-4',
    date: '05 Jun 2026',
    description: 'JomPAY Bill Payment - TNB Electricity',
    debit: 'MYR 185.20',
    credit: '—',
    balance: 'MYR 6,950.50',
    status: 'Completed',
    type: 'debit'
  },
  {
    id: 'tx-5',
    date: '01 Jun 2026',
    description: 'Auto-Debit Standing Order - Home Financing-i',
    debit: 'MYR 1,250.00',
    credit: '—',
    balance: 'MYR 7,135.70',
    status: 'Completed',
    type: 'debit'
  },
  {
    id: 'tx-6',
    date: '28 May 2026',
    description: 'E-Commerce Purchase - Shopee Pay',
    debit: 'MYR 145.00',
    credit: '—',
    balance: 'MYR 8,385.70',
    status: 'Completed',
    type: 'debit'
  },
  {
    id: 'tx-7',
    date: '15 May 2026',
    description: 'Salary Credit - PETRONAS DAGANGAN BHD',
    debit: '—',
    credit: 'MYR 6,420.00',
    balance: 'MYR 8,530.70',
    status: 'Completed',
    type: 'credit'
  },
  {
    id: 'tx-8',
    date: '10 May 2026',
    description: 'BSN Term Deposit Profit Payout',
    debit: '—',
    credit: 'MYR 285.00',
    balance: 'MYR 2,110.70',
    status: 'Completed',
    type: 'credit'
  }
];

export function TransactionTable({ transactions = MOCK_TRANSACTIONS }) {
  const [filterMonth, setFilterMonth] = useState('last 6 months');

  return (
    <div className="transaction-section">
      {/* Header Banner */}
      <div className="transaction-section__header">
        <div className="transaction-section__header-title">
          <span>From BSN EDW &middot; last 6 months</span>
        </div>
        <div className="transaction-section__filter-box">
          <select
            className="transaction-section__select"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
          >
            <option value="last 6 months">last 6 months</option>
            <option value="last 3 months">last 3 months</option>
            <option value="last 30 days">last 30 days</option>
          </select>
        </div>
      </div>

      {/* 6 Months Cashflow Cards Bar (Matching Screenshot 4) */}
      <div className="cashflow-months-grid">
        {MOCK_MONTHLY_CASHFLOW.map((m) => (
          <div key={m.month} className={`cashflow-month-card ${m.active ? 'cashflow-month-card--active' : ''}`}>
            <span className="cashflow-month-card__label">{m.month}</span>
            <span className="cashflow-month-card__value">{m.amount}</span>
            <div className="cashflow-month-card__bar-bg">
              <div
                className="cashflow-month-card__bar-fill"
                style={{ height: `${m.barHeight}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Subtext Notice */}
      <div className="cashflow-summary-subtext">
        Net positive cashflow &middot; 18% YoY growth &middot; stable salary credit pattern &middot; qualified for cross-sell (Home Financing-i propensity 0.87).
      </div>
    </div>
  );
}

// ===== REFERRAL CHAIN COMPONENT =====

import { Users, Gift, CheckCircle, Clock } from 'lucide-react';
import { formatDate } from '../../../utils/dateUtils.js';
import './ReferralChain.css';

export function ReferralChain({ referrals = [], referralStatus = 'Active' }) {
  const items = Array.isArray(referrals) ? referrals : [];

  if (items.length === 0) {
    return (
      <div className="referral-chain-empty">
        <Users size={32} style={{ opacity: 0.35, marginBottom: 8 }} />
        <p className="referral-chain-empty__title">No referral data available</p>
        <p className="referral-chain-empty__desc">No referral data recorded for this customer.</p>
      </div>
    );
  }

  const totalRewards = items.reduce((sum, r) => sum + (Number(r.rewardAmount) || 0), 0);

  return (
    <div className="referral-chain-section">
      <div className="referral-summary-cards">
        <div className="referral-summary-card">
          <div className="referral-summary-card__icon-box referral-summary-card__icon-box--blue">
            <Users size={18} />
          </div>
          <div>
            <span className="referral-summary-card__label">Referral Status</span>
            <p className="referral-summary-card__value">{referralStatus || 'Active Referrer'}</p>
          </div>
        </div>

        <div className="referral-summary-card">
          <div className="referral-summary-card__icon-box referral-summary-card__icon-box--green">
            <Gift size={18} />
          </div>
          <div>
            <span className="referral-summary-card__label">Total Rewards Earned</span>
            <p className="referral-summary-card__value">MYR {totalRewards.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="referral-summary-card">
          <div className="referral-summary-card__icon-box referral-summary-card__icon-box--purple">
            <Users size={18} />
          </div>
          <div>
            <span className="referral-summary-card__label">Referred Accounts</span>
            <p className="referral-summary-card__value">{items.length}</p>
          </div>
        </div>
      </div>

      <div className="referral-table-wrapper">
        <table className="referral-table">
          <thead>
            <tr>
              <th>REFERRED NAME</th>
              <th>DATE</th>
              <th>REWARD</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {items.map((ref, idx) => {
              const isCompleted = (ref.status || '').toLowerCase() === 'completed';
              return (
                <tr key={ref.id || idx}>
                  <td className="ref-name">{ref.referredCustomerName || 'Referred Contact'}</td>
                  <td className="ref-date">{ref.referralDate ? formatDate(ref.referralDate) : '—'}</td>
                  <td className="ref-reward">MYR {Number(ref.rewardAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  <td>
                    <span className={`ref-status-chip ${isCompleted ? 'ref-status-chip--completed' : 'ref-status-chip--pending'}`}>
                      {isCompleted ? <CheckCircle size={12} /> : <Clock size={12} />}
                      <span>{ref.status || 'Pending'}</span>
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

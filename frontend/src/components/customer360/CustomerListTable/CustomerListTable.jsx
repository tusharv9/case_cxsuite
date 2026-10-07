// ===== CUSTOMER LIST TABLE =====
// The List view of the customer directory. Sorting is the SERVER's: a header click only reports the column; the page asks the
// API for the sorted page. The table scrolls sideways on narrow screens and keeps the name column in view.

import { ArrowUp, ArrowDown, ArrowUpDown, ChevronRight } from 'lucide-react';
import { Avatar } from '../../common/Avatar/Avatar.jsx';
import { formatDate } from '../../../utils/dateUtils.js';
import { customerIdType, customerIdValue } from '../../../utils/customerDisplay.js';
import './CustomerListTable.css';

// `sortKey` is what the API accepts for ?sortBy=; a column without one is not sortable.
const COLUMNS = [
  { key: 'name', label: 'Customer Name', sortKey: 'name', render: (c) => (
    <span className="customer-table__name">
      <Avatar name={c.fullName} size="sm" />
      <span title={c.fullName}>{c.fullName}</span>
    </span>
  ) },
  { key: 'idValue', label: 'Customer ID', sortKey: 'idValue', render: (c) => customerIdValue(c) || '—' },
  { key: 'idType', label: 'ID Type', sortKey: 'idType', render: (c) => customerIdType(c) || '—' },
  { key: 'phone', label: 'Phone', sortKey: 'phone', render: (c) => c.phoneNumber || '—' },
  { key: 'email', label: 'Email', sortKey: 'email', render: (c) => (c.email ? <span title={c.email}>{c.email}</span> : '—') },
  { key: 'language', label: 'Language', sortKey: 'language', render: (c) => c.preferredLanguage || '—' },
  { key: 'branch', label: 'Branch', sortKey: 'branch', render: (c) => c.branch || '—' },
  { key: 'createdAt', label: 'Created Date', sortKey: 'createdAt', render: (c) => (c.createdAt ? formatDate(c.createdAt) : '—') },
];

/**
 * @param {object[]} props.customers
 * @param {string} props.sortBy        the active sortKey
 * @param {'asc'|'desc'} props.sortDir
 * @param {(sortKey: string) => void} props.onSort
 * @param {(customer: object) => void} props.onOpen
 */
export function CustomerListTable({ customers, sortBy, sortDir, onSort, onOpen, isBusy = false }) {
  return (
    <div className={`customer-table-wrap scrollbar-thin ${isBusy ? 'customer-table-wrap--busy' : ''}`} aria-busy={isBusy}>
      <table className="customer-table">
        <thead>
          <tr>
            {COLUMNS.map((col) => {
              const active = sortBy === col.sortKey;
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={col.key === 'name' ? 'customer-table__sticky' : undefined}
                  aria-sort={active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                >
                  <button type="button" className={`customer-table__sort ${active ? 'customer-table__sort--active' : ''}`} onClick={() => onSort(col.sortKey)}>
                    {col.label}
                    {active ? (sortDir === 'desc' ? <ArrowDown size={13} /> : <ArrowUp size={13} />) : <ArrowUpDown size={12} className="customer-table__sort-idle" />}
                  </button>
                </th>
              );
            })}
            <th scope="col" className="customer-table__actions-head">Actions</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} className="customer-table__row" onClick={() => onOpen(c)}>
              {COLUMNS.map((col) => (
                <td key={col.key} className={col.key === 'name' ? 'customer-table__sticky' : undefined}>{col.render(c)}</td>
              ))}
              <td className="customer-table__actions">
                <button
                  type="button"
                  className="customer-table__open"
                  onClick={(e) => { e.stopPropagation(); onOpen(c); }}
                  aria-label={`Open ${c.fullName}`}
                >
                  View 360 <ChevronRight size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

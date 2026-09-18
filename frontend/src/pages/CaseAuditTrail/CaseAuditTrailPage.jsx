import { useState, useEffect, useCallback } from 'react';
import { Shield, Search, Download, RotateCcw, Eye, Sparkles, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { caseService } from '../../services/caseService.js';
import { formatDate } from '../../utils/dateUtils.js';
import { Loader } from '../../components/common/Loader/Loader.jsx';
import { CaseAuditDetailsDrawer } from '../../components/drawer/CaseAuditDetailsDrawer/CaseAuditDetailsDrawer.jsx';
import './CaseAuditTrailPage.css';

const ACTION_OPTIONS = [
  { value: 'all', label: 'All Action Types' },
  { value: 'config', label: 'Configuration Changes' },
  { value: 'create', label: 'Case Created' },
  { value: 'assign', label: 'Case Assigned' },
  { value: 'status', label: 'Case Status Changed' },
  { value: 'escalate', label: 'Case Escalated' },
  { value: 'resolve', label: 'Case Resolved' },
  { value: 'transfer', label: 'Department Transferred' },
  { value: 'note', label: 'Note Added' },
];

export function CaseAuditTrailPage() {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Pagination & Filtering
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [actionFilter, setActionFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Audit Details Drawer
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const loadAuditEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await caseService.getAuditLogs({
        page,
        pageSize,
        actionType: actionFilter !== 'all' ? actionFilter : undefined,
        search: searchQuery.trim() || undefined,
      });

      if (res && typeof res === 'object' && 'items' in res) {
        setEvents(res.items || []);
        setTotalCount(res.totalCount || 0);
        setTotalPages(res.totalPages || Math.ceil((res.totalCount || 0) / pageSize));
      } else {
        const arrayData = Array.isArray(res) ? res : [];
        setEvents(arrayData);
        setTotalCount(arrayData.length);
        setTotalPages(Math.ceil(arrayData.length / pageSize));
      }
    } catch (err) {
      setError(err.message || 'Failed to load audit logs.');
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, actionFilter, searchQuery]);

  useEffect(() => {
    loadAuditEvents();
  }, [loadAuditEvents]);

  const handleActionChange = (e) => {
    setActionFilter(e.target.value);
    setPage(1);
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    setPage(1);
  };

  // Export CSV Handler
  const handleExportCsv = () => {
    if (!events.length) return;

    const headers = ['Timestamp', 'Action', 'Actor Name', 'Role', 'Case ID', 'Customer', 'Description', 'Status'];
    const rows = events.map((e) => [
      formatDate(e.timestamp),
      `"${e.actionLabel || e.actionType}"`,
      `"${e.actorName || ''}"`,
      `"${e.actorRole || ''}"`,
      `"${e.caseNumber || ''}"`,
      `"${e.customerName || ''}"`,
      `"${(e.description || '').replace(/"/g, '""')}"`,
      `"${e.status || 'Success'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `case_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleInspect = (record) => {
    setSelectedRecord(record);
    setIsDetailsOpen(true);
  };

  const getActionBadgeClass = (actionType) => {
    const type = (actionType || '').toLowerCase();
    if (type.includes('create')) return 'action-badge action-badge--create';
    if (type.includes('assign')) return 'action-badge action-badge--assign';
    if (type.includes('escalat')) return 'action-badge action-badge--escalate';
    if (type.includes('resolv')) return 'action-badge action-badge--resolve';
    if (type.includes('status')) return 'action-badge action-badge--status';
    return 'action-badge action-badge--view';
  };

  const startItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalCount);

  return (
    <div className="case-audit-page">
      {/* 1. BLUE GRADIENT HEADER BANNER */}
      <div className="case-audit-page__header">
        <div className="case-audit-banner">
          <div className="case-audit-banner__left">
            <div className="case-audit-banner__icon-box">
              <Shield size={22} color="#ffffff" />
            </div>
            <div className="case-audit-banner__content">
              <div className="case-audit-banner__badge">
                <Sparkles size={11} /> Compliance &middot; Audit Trail
              </div>
              <div className="case-audit-banner__title-row">
                <h1 className="case-audit-banner__title">Case Audit Trail Logs</h1>
                <span className="case-audit-banner__count-pill">
                  {isLoading ? 'Loading…' : `${totalCount} Events Logged`}
                </span>
              </div>
              <p className="case-audit-banner__subtitle">
                Complete audit history of case creation, updates, assignments, status changes, and case activity
              </p>
            </div>
          </div>

          <button className="btn-export-csv-banner" onClick={handleExportCsv} disabled={!events.length}>
            <Download size={15} />
            <span>Export CSV</span>
          </button>
        </div>

        {/* 2. SEARCH & FILTER TOOLBAR */}
        <div className="case-audit-toolbar">
          <div className="case-audit-toolbar__left">
            <select
              className="case-audit-select-filter"
              value={actionFilter}
              onChange={handleActionChange}
            >
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <div className="case-audit-search-wrapper">
              <Search size={15} color="#94a3b8" />
              <input
                type="search"
                className="case-audit-search-input"
                placeholder="Search case ID, customer, user, description…"
                value={searchQuery}
                onChange={handleSearchChange}
              />
            </div>
          </div>

          <button className="case-audit-refresh-btn" onClick={loadAuditEvents} title="Refresh audit logs">
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {/* 3. TABLE BODY */}
      <div className="case-audit-body scrollbar-thin">
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <Loader text="Retrieving audit log entries…" />
          </div>
        ) : error ? (
          <div className="case-audit-empty">
            <AlertCircle size={32} color="#ef4444" />
            <h3>Failed to load audit logs</h3>
            <p>{error}</p>
          </div>
        ) : events.length === 0 ? (
          <div className="case-audit-empty">
            <Shield size={36} color="#94a3b8" />
            <h3>No case audit events found</h3>
            <p>No audit records match your current filter or search criteria.</p>
          </div>
        ) : (
          <div className="case-audit-table-card">
            <table className="case-audit-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Actor / Role</th>
                  <th>Case</th>
                  <th>Event Description</th>
                  <th>Status &amp; IP</th>
                  <th style={{ textAlign: 'right' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                      {formatDate(e.timestamp)}
                    </td>

                    <td>
                      <span className={getActionBadgeClass(e.actionType)}>
                        {e.actionLabel || e.actionType}
                      </span>
                    </td>

                    <td>
                      <div className="actor-cell">
                        <div className="actor-avatar-letter">
                          {(e.actorName || 'U').charAt(0).toUpperCase()}
                        </div>
                        <div className="actor-info">
                          <span className="actor-name">{e.actorName || 'System'}</span>
                          <span className="actor-role">{e.actorRole || 'User'}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, color: '#1d4ed8' }}>{e.caseNumber}</span>
                        {e.customerName && (
                          <span style={{ fontSize: '11px', color: '#64748b' }}>Cust: {e.customerName}</span>
                        )}
                      </div>
                    </td>

                    <td style={{ maxWidth: '320px', lineHeight: 1.4 }}>
                      {e.description}
                    </td>

                    <td>
                      <div className="status-ip-cell">
                        <span className="audit-badge-success">
                          &bull; {e.status || 'Success'}
                        </span>
                        <span className="ip-text">{e.ipAddress || '127.0.0.1'}</span>
                      </div>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <button className="btn-inspect" onClick={() => handleInspect(e)}>
                        <Eye size={13} /> Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 4. PAGINATION FOOTER */}
            <div className="case-audit-pagination">
              <div className="case-audit-pagination__info">
                Showing {startItem}–{endItem} of {totalCount} events
              </div>

              <div className="case-audit-pagination__controls">
                <button
                  className="case-audit-page-btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  title="Previous Page"
                >
                  <ChevronLeft size={14} /> Previous
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                  .map((p, idx, arr) => {
                    const prevP = arr[idx - 1];
                    const showEllipsis = prevP && p - prevP > 1;
                    return (
                      <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {showEllipsis && <span style={{ color: '#94a3b8', fontSize: '12px' }}>&hellip;</span>}
                        <button
                          className={`case-audit-page-btn ${page === p ? 'case-audit-page-btn--active' : ''}`}
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </button>
                      </span>
                    );
                  })}

                <button
                  className="case-audit-page-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || totalPages === 0}
                  title="Next Page"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Details Drawer Overlay */}
      {isDetailsOpen && (
        <CaseAuditDetailsDrawer
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          auditRecord={selectedRecord}
        />
      )}
    </div>
  );
}

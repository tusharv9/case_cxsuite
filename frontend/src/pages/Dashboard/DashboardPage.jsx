// ===== REDESIGNED CASE MANAGEMENT DASHBOARD PAGE — OmniConnect Reference System =====

import { useEffect, useState, useMemo, useCallback, lazy, Suspense, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderOpen,
  UserCheck,
  ShieldCheck,
  CheckCircle2,
  Activity,
  Plus,
  RotateCcw,
  Calendar,
  ChevronDown,
  Filter,
  Search,
  Users,
  Sparkles,
  PieChart,
  Layers,
  UserPlus,
  LineChart
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext.jsx';
import { caseService } from '../../services/caseService.js';
import { departmentService } from '../../services/departmentService.js';
import { configurableSettingsService } from '../../services/configurableSettingsService.js';
import { DeptBadge } from '../../components/common/Badge/Badge.jsx';
import { getSlaConfig } from '../../utils/slaUtils.js';
import { useNow } from '../../hooks/useNow.js';
import { EmptyState } from '../../components/common/Loader/Loader.jsx';
import { Skeleton } from '../../components/common/Skeleton/Skeleton.jsx';
import { ActivityFeed } from './components/ActivityFeed.jsx';
import { AttentionCasesList } from './components/AttentionCasesList.jsx';
import { RecentCasesTable } from './components/RecentCasesTable.jsx';
import './DashboardPage.css';

const CreateCaseDrawer = lazy(() =>
  import('../../components/drawer/CreateCaseDrawer/CreateCaseDrawer.jsx').then((m) => ({
    default: m.CreateCaseDrawer,
  }))
);

const CreateCustomerDrawer = lazy(() =>
  import('../../components/drawer/CreateCustomerDrawer/CreateCustomerDrawer.jsx').then((m) => ({
    default: m.CreateCustomerDrawer,
  }))
);

// Spline Curve Helper for Smooth Line Charts
function getSplinePath(points) {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const cx1 = p0.x + (p1.x - p0.x) / 2;
    const cy1 = p0.y;
    const cx2 = p0.x + (p1.x - p0.x) / 2;
    const cy2 = p1.y;
    d += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export function DashboardPage() {
  const now = useNow(10000);
  const { currentUser } = useApp();
  const navigate = useNavigate();

  // Core Data States
  const [summaryData, setSummaryData] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Configurable master data states
  const [quickActionsConfig, setQuickActionsConfig] = useState([]);
  const [dateRangesConfig, setDateRangesConfig] = useState([]);
  const [statusConfig, setStatusConfig] = useState([]);
  const [caseTypesConfig, setCaseTypesConfig] = useState([]);
  const [severityConfig, setSeverityConfig] = useState([]);
  const [slaStatusConfig, setSlaStatusConfig] = useState([]);

  // Quick Action & Drawer States
  const [isQuickActionsOpen, setIsQuickActionsOpen] = useState(false);
  const [isCreateCaseOpen, setIsCreateCaseOpen] = useState(false);
  const [isCreateCustomerOpen, setIsCreateCustomerOpen] = useState(false);

  // Date Filter Popover State (Screenshot 4 UX Pattern)
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
  const datePopoverRef = useRef(null);
  const searchInputRef = useRef(null);

  // Filter States
  const [dateRange, setDateRange] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [caseTypeFilter, setCaseTypeFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [slaFilter, setSlaFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [myCasesOnly, setMyCasesOnly] = useState(false);
  const [resolvedTimeframe, setResolvedTimeframe] = useState('daily');
  const [activeChartPoint, setActiveChartPoint] = useState(null);

  // Fetch initial configuration lookups
  useEffect(() => {
    Promise.all([
      departmentService.getAllDepartments(true).catch((err) => {
        console.error('Failed to load departments:', err);
        return [];
      }),
      configurableSettingsService.getLookupValues('DASHBOARD_QUICK_ACTION', true).catch(() => []),
      configurableSettingsService.getLookupValues('DASHBOARD_DATE_RANGE', true).catch(() => []),
      configurableSettingsService.getLookupValues('CASE_STATUS', true).catch(() => []),
      configurableSettingsService.getCaseTypes().catch(() => []),
      configurableSettingsService.getSeverities().catch(() => []),
      configurableSettingsService.getLookupValues('SLA_STATUS', true).catch(() => []),
    ])
      .then(([deptData, qaData, drData, csData, ctData, sevData, slaData]) => {
        setDepartments(Array.isArray(deptData) ? deptData : []);
        if (Array.isArray(qaData) && qaData.length > 0) setQuickActionsConfig(qaData);
        if (Array.isArray(drData) && drData.length > 0) setDateRangesConfig(drData);
        if (Array.isArray(csData) && csData.length > 0) setStatusConfig(csData);
        if (Array.isArray(ctData) && ctData.length > 0) setCaseTypesConfig(ctData);
        if (Array.isArray(sevData) && sevData.length > 0) setSeverityConfig(sevData);
        if (Array.isArray(slaData) && slaData.length > 0) setSlaStatusConfig(slaData);
      })
      .catch((err) => console.error('Failed to load dashboard configuration:', err));
  }, []);

  // Fetch server-side aggregated summary
  const fetchDashboardData = useCallback(() => {
    setIsLoading(true);
    const params = {};
    if (deptFilter !== 'all') params.departmentId = deptFilter;
    if (caseTypeFilter !== 'all') params.caseType = caseTypeFilter;
    if (statusFilter !== 'all') params.status = statusFilter;
    if (severityFilter !== 'all') params.severity = severityFilter;
    if (dateRange !== 'all') {
      params.dateRange = dateRange;
      if (dateRange === 'custom') {
        if (customStartDate) params.customStartDate = customStartDate;
        if (customEndDate) params.customEndDate = customEndDate;
      }
    }
    if (myCasesOnly) params.myCasesOnly = true;

    caseService.getDashboardSummary(params)
      .then((data) => setSummaryData(data))
      .catch((err) => console.error('Failed to load dashboard summary:', err))
      .finally(() => setIsLoading(false));
  }, [deptFilter, caseTypeFilter, statusFilter, severityFilter, dateRange, customStartDate, customEndDate, myCasesOnly]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Close Popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (datePopoverRef.current && !datePopoverRef.current.contains(event.target)) {
        setIsDatePopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Server-side Aggregated KPI Metrics
  const metrics = useMemo(() => {
    if (!summaryData) {
      return {
        total: 0,
        openCount: 0,
        assignedCount: 0,
        resolvedCount: 0,
        inProgressCount: 0,
        slaAdherencePct: '100',
        withinSlaCount: 0,
        breachedCount: 0,
      };
    }

    return {
      total: summaryData.totalCases,
      openCount: summaryData.openCases,
      assignedCount: Math.max(0, summaryData.totalCases - summaryData.unassignedCases),
      resolvedCount: summaryData.resolvedCases,
      inProgressCount: summaryData.inProgressCases,
      slaAdherencePct: summaryData.slaAdherencePercent != null ? summaryData.slaAdherencePercent.toFixed(1) : '100',
      withinSlaCount: summaryData.slaHealthyCases,
      breachedCount: summaryData.slaBreachedCases,
    };
  }, [summaryData]);

  // Analytics: Cases by Department (Horizontal Bar Chart Data)
  const deptChartData = useMemo(() => {
    if (!summaryData?.casesByDepartment) return [];
    const items = summaryData.casesByDepartment.map((d) => ({
      name: d.departmentName,
      count: d.count,
    }));
    const maxCount = Math.max(...items.map((i) => i.count), 1);

    return items.map((item, idx) => ({
      ...item,
      percentage: Math.round((item.count / maxCount) * 100),
      colorVar: `var(--color-dept-${idx % 10})`,
    }));
  }, [summaryData]);

  // Analytics: Cases by Severity (Doughnut Chart Data)
  const severityChartData = useMemo(() => {
    if (!summaryData) return [];
    const total = summaryData.totalCases || 1;
    return [
      { name: 'Critical', count: summaryData.criticalCases, color: '#ef4444', pct: Math.round((summaryData.criticalCases / total) * 100) },
      { name: 'High', count: summaryData.highCases, color: '#f97316', pct: Math.round((summaryData.highCases / total) * 100) },
      { name: 'Medium', count: summaryData.mediumCases, color: '#f59e0b', pct: Math.round((summaryData.mediumCases / total) * 100) },
      { name: 'Low', count: summaryData.lowCases, color: '#10b981', pct: Math.round((summaryData.lowCases / total) * 100) },
    ];
  }, [summaryData]);

  // Analytics: Cases Resolved Over Time (Smooth Line Chart Data)
  const resolvedLineData = useMemo(() => {
    if (!summaryData) return [];
    const list = resolvedTimeframe === 'daily'
      ? summaryData.resolvedDaily
      : resolvedTimeframe === 'weekly'
      ? summaryData.resolvedWeekly
      : summaryData.resolvedMonthly;

    return (list || []).map((item) => ({ label: item.label, val: item.count }));
  }, [summaryData, resolvedTimeframe]);

  // Operational: Recent Activity
  const recentActivities = useMemo(() => {
    if (!summaryData?.recentActivities) return [];
    return summaryData.recentActivities.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      sub: a.sub,
      time: new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      caseId: a.caseId,
    }));
  }, [summaryData]);

  // Operational: Cases Requiring SLA Attention
  const attentionCases = useMemo(() => {
    if (!summaryData?.attentionCases) return [];
    let list = summaryData.attentionCases;
    if (slaFilter !== 'all') {
      list = list.filter((c) => {
        const isBreached = Boolean(c.slaBreachedAt);
        if (slaFilter === 'breached') return isBreached;
        if (slaFilter === 'approaching') return !isBreached;
        if (slaFilter === 'healthy') return false;
        return true;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) =>
        c.caseNumber?.toLowerCase().includes(q) ||
        c.title?.toLowerCase().includes(q) ||
        c.customerName?.toLowerCase().includes(q) ||
        c.ownerName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [summaryData, slaFilter, searchQuery]);

  // Operational: Recent Cases Table Overview
  const recentCases = useMemo(() => {
    if (!summaryData?.recentCases) return [];
    let list = summaryData.recentCases;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) =>
        c.caseNumber?.toLowerCase().includes(q) ||
        c.title?.toLowerCase().includes(q) ||
        c.customerName?.toLowerCase().includes(q) ||
        c.ownerName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [summaryData, searchQuery]);

  const totalCasesCount = summaryData?.totalCases || 0;

  // Stable handlers
  const handleSelectCase = useCallback((caseId) => navigate(`/case-management/${caseId}`), [navigate]);
  const handleViewBoard = useCallback(() => navigate('/case-management'), [navigate]);

  // Reset Filters
  const handleResetFilters = () => {
    setDateRange('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setDeptFilter('all');
    setStatusFilter('all');
    setCaseTypeFilter('all');
    setSeverityFilter('all');
    setSlaFilter('all');
    setSearchQuery('');
    setMyCasesOnly(false);
  };

  const welcomeName = currentUser?.name || 'Super Admin';

  // Derived Config Lists with Safe Defaults & Active Filter
  const visibleDepartments = useMemo(() => {
    return (departments || []).filter((d) => d.isActive !== false);
  }, [departments]);

  const quickActionsList = useMemo(() => {
    const raw = quickActionsConfig.length > 0 ? quickActionsConfig : [
      { id: 'qa-1', value: 'create_case', label: 'Create Case', isActive: true },
      { id: 'qa-2', value: 'create_customer', label: 'Create Customer', isActive: true },
      { id: 'qa-3', value: 'assign_case', label: 'Assign Case', isActive: true },
      { id: 'qa-4', value: 'search_cases', label: 'Search Cases', isActive: true },
      { id: 'qa-5', value: 'my_cases_toggle', label: 'My Cases Only', isActive: true },
    ];
    return raw.filter((qa) => qa.isActive !== false);
  }, [quickActionsConfig]);

  const dateRangesList = useMemo(() => {
    const raw = dateRangesConfig.length > 0 ? dateRangesConfig : [
      { id: 'dr-1', value: 'today', label: 'Today', isActive: true },
      { id: 'dr-2', value: 'this_week', label: 'This Week', isActive: true },
      { id: 'dr-3', value: 'last_week', label: 'Last Week', isActive: true },
      { id: 'dr-4', value: 'this_month', label: 'This Month', isActive: true },
      { id: 'dr-5', value: 'last_month', label: 'Last Month', isActive: true },
      { id: 'dr-6', value: 'this_quarter', label: 'This Quarter', isActive: true },
      { id: 'dr-7', value: 'this_year', label: 'This Year', isActive: true },
      { id: 'dr-8', value: 'all', label: 'All Time', isActive: true },
      { id: 'dr-9', value: 'custom', label: 'Custom Range', isActive: true },
    ];
    return raw.filter((dr) => dr.isActive !== false);
  }, [dateRangesConfig]);

  const statusesList = useMemo(() => {
    const raw = statusConfig.length > 0 ? statusConfig : [
      { id: 'st-1', value: 'Open', label: 'Open', isActive: true },
      { id: 'st-2', value: 'InProgress', label: 'In Progress', isActive: true },
      { id: 'st-3', value: 'Escalated', label: 'Escalated', isActive: true },
      { id: 'st-4', value: 'Closed', label: 'Closed', isActive: true },
      { id: 'st-5', value: 'Resolved', label: 'Resolved', isActive: true },
    ];
    return raw.filter((st) => st.isActive !== false && st.value?.toLowerCase() !== 'within customer');
  }, [statusConfig]);

  const caseTypesList = useMemo(() => {
    const raw = caseTypesConfig.length > 0 ? caseTypesConfig : [
      { id: 'ct-1', code: 'Complaint', name: 'Complaints', isActive: true },
      { id: 'ct-2', code: 'Service', name: 'Service', isActive: true },
      { id: 'ct-3', code: 'Inquiry', name: 'Inquiry', isActive: true },
    ];
    return raw.filter((ct) => ct.isActive !== false && ct.code !== 'InfoReq' && ct.name?.toLowerCase() !== 'info request');
  }, [caseTypesConfig]);

  const severitiesList = useMemo(() => {
    const raw = severityConfig.length > 0 ? severityConfig : [
      { id: 'sv-1', name: 'Critical', isActive: true },
      { id: 'sv-2', name: 'High', isActive: true },
      { id: 'sv-3', name: 'Medium', isActive: true },
      { id: 'sv-4', name: 'Low', isActive: true },
    ];
    return raw.filter((sv) => sv.isActive !== false);
  }, [severityConfig]);

  const slaStatusesList = useMemo(() => {
    const raw = slaStatusConfig.length > 0 ? slaStatusConfig : [
      { id: 'sla-1', value: 'healthy', label: 'Within SLA', isActive: true },
      { id: 'sla-2', value: 'approaching', label: 'Approaching SLA', isActive: true },
      { id: 'sla-3', value: 'breached', label: 'SLA Breached', isActive: true },
    ];
    return raw.filter((sla) => sla.isActive !== false);
  }, [slaStatusConfig]);

  const getDateRangeLabel = () => {
    const match = dateRangesList.find((dr) => dr.value === dateRange || dr.label?.toLowerCase() === dateRange.toLowerCase());
    if (match) return match.label || match.value;
    switch (dateRange) {
      case 'today': return 'Today';
      case 'this_week': return 'This Week';
      case 'last_week': return 'Last Week';
      case 'this_month': return 'This Month';
      case 'last_month': return 'Last Month';
      case 'this_quarter': return 'This Quarter';
      case 'this_year': return 'This Year';
      case 'custom': return 'Custom Range';
      default: return 'All Time';
    }
  };

  if (isLoading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-page__header">
          <Skeleton height="80px" borderRadius="var(--radius-lg)" />
          <Skeleton height="40px" width="300px" style={{ margin: '16px 0 8px' }} />
          <div className="dashboard-kpi-grid-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton.Card key={i} style={{ height: '110px' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      {/* 1. WELCOME BLUE HEADER BANNER (Matching Lead Management Overview Header) */}
      <div className="dashboard-page__header">
        <div className="dashboard-welcome-banner">
          <div className="dashboard-welcome-banner__left">
            <div className="dashboard-welcome-banner__icon-box">
              <Layers size={22} color="#ffffff" />
            </div>
            <div className="dashboard-welcome-banner__content">
              <div className="dashboard-welcome-banner__title-row">
                <h1 className="dashboard-welcome-banner__title">Welcome back, {welcomeName}</h1>
                <span className="dashboard-welcome-banner__badge">
                  <Sparkles size={12} /> Live
                </span>
              </div>
              <p className="dashboard-welcome-banner__subtitle">
                Real-time operational metrics, SLA resolution pipelines &amp; department distributions
              </p>
            </div>
          </div>

          {/* EMBEDDED CONTROLS ON RIGHT SIDE OF BLUE HEADER */}
          <div className="dashboard-banner-controls">
            {/* Quick Actions Control */}
            <div className="quick-actions-container">
              <button
                className="quick-actions-btn"
                onClick={() => setIsQuickActionsOpen(!isQuickActionsOpen)}
              >
                <Plus size={15} />
                <span>Quick Actions</span>
                <ChevronDown size={14} />
              </button>

              {isQuickActionsOpen && (
                <div className="quick-actions-dropdown">
                  {quickActionsList.map((qa, index) => {
                    const rawVal = (qa.value || qa.label || '').toLowerCase();
                    const isCreateCase = rawVal.includes('create_case') || rawVal.includes('create case');
                    const isCreateCust = rawVal.includes('create_customer') || rawVal.includes('create customer');
                    const isAssignCase = rawVal.includes('assign_case') || rawVal.includes('assign case');
                    const isSearchCases = rawVal.includes('search_cases') || rawVal.includes('search case');
                    const isMyCases = rawVal.includes('my_cases') || rawVal.includes('my cases');

                    const Icon = isCreateCase
                      ? Plus
                      : isCreateCust
                      ? UserPlus
                      : isAssignCase
                      ? UserCheck
                      : isSearchCases
                      ? Search
                      : isMyCases
                      ? Users
                      : Sparkles;

                    const displayLabel = isMyCases
                      ? myCasesOnly
                        ? 'Show All Cases'
                        : qa.label || 'My Cases Only'
                      : qa.label || qa.value;

                    return (
                      <button
                        key={qa.id || qa.value || index}
                        className={`quick-actions-item ${index === 0 ? 'quick-actions-item--primary' : ''}`}
                        onClick={() => {
                          setIsQuickActionsOpen(false);
                          if (isCreateCase) setIsCreateCaseOpen(true);
                          else if (isCreateCust) setIsCreateCustomerOpen(true);
                          else if (isAssignCase) navigate('/case-management');
                          else if (isSearchCases) {
                            if (searchInputRef.current) {
                              searchInputRef.current.focus();
                              searchInputRef.current.select();
                            }
                          }
                          else if (isMyCases) setMyCasesOnly((prev) => !prev);
                          else navigate('/case-management');
                        }}
                      >
                        <Icon size={15} /> {displayLabel}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Date Range Filter Selector (Matching Screenshot 4 Dual-Pane Popover UX) */}
            <div className="date-filter-popover-container" ref={datePopoverRef}>
              <button
                className="date-filter-trigger-btn"
                onClick={() => setIsDatePopoverOpen(!isDatePopoverOpen)}
              >
                <Calendar size={15} />
                <span>{getDateRangeLabel()}</span>
                <ChevronDown size={14} />
              </button>

              {isDatePopoverOpen && (
                <div className="date-filter-popover-card">
                  {/* Left Pane: Presets */}
                  <div className="date-popover-presets">
                    {dateRangesList.map((preset) => {
                      const val = preset.value || preset.id;
                      return (
                        <button
                          key={preset.id || val}
                          className={`date-preset-item ${dateRange === val ? 'date-preset-item--active' : ''}`}
                          onClick={() => {
                            setDateRange(val);
                            if (val !== 'custom') {
                              setIsDatePopoverOpen(false);
                            }
                          }}
                        >
                          {preset.label || preset.value}
                        </button>
                      );
                    })}
                  </div>

                  {/* Right Pane: Custom Range */}
                  <div className="date-popover-custom-pane">
                    <h5 className="date-popover-custom-title">Custom Range</h5>
                    <div className="date-popover-field">
                      <label className="date-popover-label">From</label>
                      <input
                        type="date"
                        className="date-popover-input"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                      />
                    </div>

                    <div className="date-popover-field">
                      <label className="date-popover-label">To</label>
                      <input
                        type="date"
                        className="date-popover-input"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                      />
                    </div>

                    <button
                      className="date-popover-apply-btn"
                      onClick={() => {
                        setDateRange('custom');
                        setIsDatePopoverOpen(false);
                      }}
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Reset Button */}
            <button className="reset-filter-btn" onClick={handleResetFilters} title="Reset Dashboard Filters">
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* 2. FILTER TOOLBAR */}
        <div className="dashboard-filter-bar">
          <span className="filter-bar-label">
            <Filter size={14} /> Filters
          </span>

          <select
            className="filter-select"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="all">All Departments</option>
            {visibleDepartments.map((d) => (
              <option key={d.id || d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            {statusesList.map((st) => (
              <option key={st.id || st.value} value={st.value}>
                {st.label || st.value}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={caseTypeFilter}
            onChange={(e) => setCaseTypeFilter(e.target.value)}
          >
            <option value="all">All Case Types</option>
            {caseTypesList.map((ct) => (
              <option key={ct.id || ct.code || ct.value} value={ct.code || ct.value || ct.name}>
                {ct.name || ct.label || ct.code || ct.value}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
          >
            <option value="all">All Severities</option>
            {severitiesList.map((sev) => (
              <option key={sev.id || sev.name || sev.value} value={sev.name || sev.value}>
                {sev.name || sev.label || sev.value}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={slaFilter}
            onChange={(e) => setSlaFilter(e.target.value)}
          >
            <option value="all">All SLA Statuses</option>
            {slaStatusesList.map((sla) => (
              <option key={sla.id || sla.value} value={sla.value}>
                {sla.label || sla.value}
              </option>
            ))}
          </select>

          <div className="filter-search-wrapper">
            <Search size={14} className="filter-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="filter-search-input"
              placeholder="Search by case #, customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* 3. 5 KPI CARDS GRID (Matching Lead Management KPI Card Structure & Top Accents) */}
        <div className="dashboard-kpi-grid-5">
          {/* KPI 1 — Open Cases */}
          <div
            className={`kpi-card-v2 kpi-card-v2--blue ${statusFilter === 'Open' ? 'kpi-card-v2--selected' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'Open' ? 'all' : 'Open')}
            title="Click to filter by Open cases"
            style={{ cursor: 'pointer' }}
          >
            <div className="kpi-card-v2__top-row">
              <div className="kpi-card-v2__icon-box kpi-icon-blue">
                <FolderOpen size={18} />
              </div>
              <span className="kpi-card-v2__title">Total Open</span>
            </div>
            <div className="kpi-card-v2__value">{metrics.openCount}</div>
            <div className="kpi-card-v2__bottom-row">
              <span className="kpi-badge-positive">↑ All Active</span>
              <span className="kpi-card-v2__subtext">System-wide</span>
            </div>
          </div>

          {/* KPI 2 — Assigned Cases */}
          <div className="kpi-card-v2 kpi-card-v2--purple">
            <div className="kpi-card-v2__top-row">
              <div className="kpi-card-v2__icon-box kpi-icon-purple">
                <UserCheck size={18} />
              </div>
              <span className="kpi-card-v2__title">Assigned Cases</span>
            </div>
            <div className="kpi-card-v2__value">{metrics.assignedCount}</div>
            <div className="kpi-card-v2__bottom-row">
              <span className="kpi-badge-positive">
                ↑ {metrics.total > 0 ? Math.round((metrics.assignedCount / metrics.total) * 100) : 0}%
              </span>
              <span className="kpi-card-v2__subtext">Assigned rate</span>
            </div>
          </div>

          {/* KPI 3 — SLA Adherence */}
          <div className="kpi-card-v2 kpi-card-v2--amber">
            <div className="kpi-card-v2__top-row">
              <div className="kpi-card-v2__icon-box kpi-icon-amber">
                <ShieldCheck size={18} />
              </div>
              <span className="kpi-card-v2__title">SLA Target</span>
            </div>
            <div className="kpi-card-v2__value">{metrics.slaAdherencePct}%</div>
            <div className="kpi-card-v2__bottom-row">
              <span className={metrics.breachedCount > 0 ? 'kpi-badge-negative' : 'kpi-badge-positive'}>
                {metrics.withinSlaCount} of {metrics.total}
              </span>
              <span className="kpi-card-v2__subtext">Healthy SLA</span>
            </div>
          </div>

          {/* KPI 4 — Resolved Cases */}
          <div
            className={`kpi-card-v2 kpi-card-v2--green ${statusFilter === 'Resolved' ? 'kpi-card-v2--selected' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'Resolved' ? 'all' : 'Resolved')}
            title="Click to filter by Resolved cases"
            style={{ cursor: 'pointer' }}
          >
            <div className="kpi-card-v2__top-row">
              <div className="kpi-card-v2__icon-box kpi-icon-green">
                <CheckCircle2 size={18} />
              </div>
              <span className="kpi-card-v2__title">Resolved Cases</span>
            </div>
            <div className="kpi-card-v2__value">{metrics.resolvedCount}</div>
            <div className="kpi-card-v2__bottom-row">
              <span className="kpi-badge-positive">
                ↑ {metrics.total > 0 ? Math.round((metrics.resolvedCount / metrics.total) * 100) : 0}%
              </span>
              <span className="kpi-card-v2__subtext">Resolution efficiency</span>
            </div>
          </div>

          {/* KPI 5 — In Progress Cases */}
          <div
            className={`kpi-card-v2 kpi-card-v2--orange ${statusFilter === 'InProgress' ? 'kpi-card-v2--selected' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'InProgress' ? 'all' : 'InProgress')}
            title="Click to filter by In Progress cases"
            style={{ cursor: 'pointer' }}
          >
            <div className="kpi-card-v2__top-row">
              <div className="kpi-card-v2__icon-box kpi-icon-orange">
                <Activity size={18} />
              </div>
              <span className="kpi-card-v2__title">In Progress</span>
            </div>
            <div className="kpi-card-v2__value">{metrics.inProgressCount}</div>
            <div className="kpi-card-v2__bottom-row">
              <span className="kpi-badge-neutral">Under review</span>
              <span className="kpi-card-v2__subtext">Active investigations</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. MAIN CONTENT AREA */}
      <div className="dashboard-page__content">
        {totalCasesCount === 0 ? (
          <EmptyState
            title="No cases match your filters"
            description="Try resetting your date range or filter criteria to view cases."
            actionText="Reset Filters"
            onAction={handleResetFilters}
          />
        ) : (
          <>
            {/* ANALYTICS CHARTS — ONE SINGLE HORIZONTAL ROW (3-COLUMN GRID) */}
            <div className="analytics-grid-row-3col">
              {/* Chart 1: Cases Resolved Performance — Smooth Spline Line Chart with Gradient Area Fill (Matching Leads Over Time) */}
              <div className="chart-card">
                <div className="chart-card__header">
                  <div>
                    <h4 className="chart-card__title">
                      <LineChart size={16} color="#1d4ed8" /> Cases Resolved Performance
                    </h4>
                    <span className="chart-card__subtitle">Resolution submission trends</span>
                  </div>

                  <div className="chart-time-toggle">
                    <button
                      className={`chart-toggle-btn ${resolvedTimeframe === 'daily' ? 'chart-toggle-btn--active' : ''}`}
                      onClick={() => setResolvedTimeframe('daily')}
                    >
                      Daily
                    </button>
                    <button
                      className={`chart-toggle-btn ${resolvedTimeframe === 'weekly' ? 'chart-toggle-btn--active' : ''}`}
                      onClick={() => setResolvedTimeframe('weekly')}
                    >
                      Weekly
                    </button>
                    <button
                      className={`chart-toggle-btn ${resolvedTimeframe === 'monthly' ? 'chart-toggle-btn--active' : ''}`}
                      onClick={() => setResolvedTimeframe('monthly')}
                    >
                      Monthly
                    </button>
                  </div>
                </div>

                <div className="line-chart-svg-container">
                  {(() => {
                    const maxVal = Math.max(...resolvedLineData.map((d) => d.val), 4);
                    const yTicks = [];
                    const step = maxVal <= 5 ? 1 : maxVal <= 10 ? 2 : Math.ceil(maxVal / 5);
                    for (let i = 0; i <= maxVal; i += step) {
                      yTicks.push(i);
                    }
                    if (yTicks[yTicks.length - 1] < maxVal) {
                      yTicks.push(maxVal);
                    }

                    const chartWidth = 500;
                    const chartHeight = 190;
                    const paddingLeft = 35;
                    const paddingRight = 20;
                    const paddingTop = 20;
                    const paddingBottom = 35;

                    const plotWidth = chartWidth - paddingLeft - paddingRight;
                    const plotHeight = chartHeight - paddingTop - paddingBottom;
                    const numItems = resolvedLineData.length || 1;

                    // Calculate X/Y coordinates for spline curve
                    const pts = resolvedLineData.map((d, i) => {
                      const x = paddingLeft + (numItems > 1 ? (i / (numItems - 1)) * plotWidth : plotWidth / 2);
                      const y = paddingTop + plotHeight - (d.val / maxVal) * plotHeight;
                      return { x, y, label: d.label, val: d.val };
                    });

                    const linePath = getSplinePath(pts);
                    const areaPath = pts.length > 0
                      ? `${linePath} L ${pts[pts.length - 1].x} ${paddingTop + plotHeight} L ${pts[0].x} ${paddingTop + plotHeight} Z`
                      : '';

                    return (
                      <svg width="100%" height="100%" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="resolvedLineAreaGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.30" />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {/* Gridlines */}
                        {yTicks.map((tickVal) => {
                          const yPos = paddingTop + plotHeight - (tickVal / maxVal) * plotHeight;
                          return (
                            <g key={tickVal}>
                              <line
                                x1={paddingLeft}
                                y1={yPos}
                                x2={chartWidth - paddingRight}
                                y2={yPos}
                                stroke="#e2e8f0"
                                strokeDasharray="3 3"
                                strokeWidth="1"
                              />
                              <text
                                x={paddingLeft - 8}
                                y={yPos + 4}
                                fontSize="10"
                                fill="#94a3b8"
                                textAnchor="end"
                                fontWeight="500"
                              >
                                {tickVal}
                              </text>
                            </g>
                          );
                        })}

                        {/* Smooth Gradient Area Fill */}
                        {areaPath && <path d={areaPath} fill="url(#resolvedLineAreaGradient)" />}

                        {/* Smooth Spline Line */}
                        {linePath && (
                          <path
                            d={linePath}
                            fill="none"
                            stroke="#2563eb"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        )}

                        {/* Point Markers & Tooltips */}
                        {pts.map((p) => {
                          const isHovered = activeChartPoint?.label === p.label;
                          return (
                            <g
                              key={p.label}
                              onMouseEnter={() => setActiveChartPoint(p)}
                              onMouseLeave={() => setActiveChartPoint(null)}
                              style={{ cursor: 'pointer' }}
                            >
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r={isHovered ? "6" : "4.5"}
                                fill="#2563eb"
                                stroke="#ffffff"
                                strokeWidth="2"
                                style={{ transition: 'all 0.15s ease' }}
                              />
                              <text
                                x={p.x}
                                y={chartHeight - 10}
                                fontSize="10"
                                fill="#64748b"
                                textAnchor="middle"
                                fontWeight="500"
                              >
                                {p.label}
                              </text>
                            </g>
                          );
                        })}

                        {/* Hover Tooltip */}
                        {activeChartPoint && (() => {
                          const pt = pts.find((p) => p.label === activeChartPoint.label);
                          if (!pt) return null;
                          const tooltipY = Math.max(10, pt.y - 25);
                          return (
                            <g transform={`translate(${pt.x}, ${tooltipY})`} style={{ pointerEvents: 'none' }}>
                              <rect
                                x="-55"
                                y="-12"
                                width="110"
                                height="22"
                                rx="4"
                                fill="#0f172a"
                                opacity="0.9"
                              />
                              <text
                                x="0"
                                y="3"
                                fill="#ffffff"
                                fontSize="10"
                                fontWeight="600"
                                textAnchor="middle"
                              >
                                {pt.label}: {pt.val} resolved
                              </text>
                            </g>
                          );
                        })()}
                      </svg>
                    );
                  })()}
                </div>
                <div style={{ marginTop: 'auto', fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                  Showing: <strong>{resolvedTimeframe} breakdown</strong>
                </div>
              </div>

              {/* Chart 2: Cases by Department — Horizontal Bar Chart */}
              <div className="chart-card">
                <div className="chart-card__header">
                  <div>
                    <h4 className="chart-card__title">
                      <Layers size={16} color="#1d4ed8" /> Cases by Department
                    </h4>
                    <span className="chart-card__subtitle">Departmental distribution</span>
                  </div>
                </div>

                <div className="dept-bars-list">
                  {deptChartData.length === 0 ? (
                    <span style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>No data</span>
                  ) : (
                    deptChartData.map((item) => (
                      <div
                        key={item.name}
                        className="dept-bar-item"
                        onClick={() => setDeptFilter(deptFilter === item.name ? 'all' : item.name)}
                        style={{ cursor: 'pointer' }}
                        title={`Click to filter by ${item.name}`}
                      >
                        <div className="dept-bar-info">
                          <span className="dept-bar-label">
                            <DeptBadge name={item.name} size="sm" />
                          </span>
                          <span className="dept-bar-count">{item.count} cases</span>
                        </div>
                        <div className="dept-bar-track">
                          <div
                            className="dept-bar-fill"
                            style={{
                              width: `${item.percentage}%`,
                              backgroundColor: item.colorVar || 'var(--color-status-open)',
                            }}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Chart 3: Cases by Severity — Donut Chart (Matching Leads by Product Representation) */}
              <div className="chart-card">
                <div className="chart-card__header">
                  <div>
                    <h4 className="chart-card__title">
                      <PieChart size={16} color="#1d4ed8" /> Cases by Severity
                    </h4>
                    <span className="chart-card__subtitle">Risk level distribution</span>
                  </div>
                </div>

                <div className="doughnut-chart-wrapper">
                  <div className="doughnut-svg-box">
                    <svg viewBox="0 0 36 36" className="doughnut-svg">
                      {(() => {
                        let cumulativePct = 0;
                        return severityChartData.map((item) => {
                          if (item.count === 0) return null;
                          const strokeDasharray = `${item.pct} ${100 - item.pct}`;
                          const strokeDashoffset = 100 - cumulativePct + 25;
                          cumulativePct += item.pct;
                          return (
                            <circle
                              key={item.name}
                              cx="18"
                              cy="18"
                              r="15.91549430918954"
                              fill="transparent"
                              stroke={item.color}
                              strokeWidth="4.2"
                              strokeDasharray={strokeDasharray}
                              strokeDashoffset={strokeDashoffset}
                            />
                          );
                        });
                      })()}
                    </svg>

                    <div className="doughnut-center-text">
                      <div className="doughnut-center-number">{totalCasesCount}</div>
                      <div className="doughnut-center-label">TOTAL</div>
                    </div>
                  </div>

                  <div className="doughnut-legend-list">
                    {severityChartData.map((item) => (
                      <div
                        key={item.name}
                        className="legend-item"
                        onClick={() => setSeverityFilter(severityFilter === item.name ? 'all' : item.name)}
                        style={{ cursor: 'pointer' }}
                        title={`Click to filter by ${item.name} severity`}
                      >
                        <div className="legend-left">
                          <span className="legend-dot" style={{ backgroundColor: item.color }} />
                          <span>{item.name}</span>
                        </div>
                        <div className="legend-right">
                          {item.count} <span style={{ color: '#94a3b8', fontWeight: 500 }}>({item.pct}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* OPERATIONAL SECTION */}
            <div className="operational-grid">
              <ActivityFeed activities={recentActivities} onSelectCase={handleSelectCase} />

              <AttentionCasesList cases={attentionCases} onSelectCase={handleSelectCase} />

              <RecentCasesTable
                cases={recentCases}
                onSelectCase={handleSelectCase}
                onViewBoard={handleViewBoard}
              />
            </div>
          </>
        )}
      </div>

      {/* DRAWERS FOR QUICK ACTIONS */}
      <Suspense fallback={null}>
        {isCreateCaseOpen && (
          <CreateCaseDrawer
            isOpen={isCreateCaseOpen}
            onClose={() => setIsCreateCaseOpen(false)}
            onSuccess={() => {
              setIsCreateCaseOpen(false);
              fetchData();
            }}
          />
        )}

        {isCreateCustomerOpen && (
          <CreateCustomerDrawer
            isOpen={isCreateCustomerOpen}
            onClose={() => setIsCreateCustomerOpen(false)}
            onSuccess={() => {
              setIsCreateCustomerOpen(false);
            }}
          />
        )}
      </Suspense>
    </div>
  );
}

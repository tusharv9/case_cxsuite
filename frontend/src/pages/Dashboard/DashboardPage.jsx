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
  const [allCases, setAllCases] = useState([]);
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

  // Fetch initial data
  const fetchData = () => {
    setIsLoading(true);
    Promise.all([
      caseService.getBoardCases(null, null).catch((err) => {
        console.error('Failed to load board cases:', err);
        return [];
      }),
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
      .then(([casesData, deptData, qaData, drData, csData, ctData, sevData, slaData]) => {
        const casesList = Array.isArray(casesData) ? casesData : casesData?.items || [];
        setAllCases(casesList);
        setDepartments(Array.isArray(deptData) ? deptData : []);
        if (Array.isArray(qaData) && qaData.length > 0) setQuickActionsConfig(qaData);
        if (Array.isArray(drData) && drData.length > 0) setDateRangesConfig(drData);
        if (Array.isArray(csData) && csData.length > 0) setStatusConfig(csData);
        if (Array.isArray(ctData) && ctData.length > 0) setCaseTypesConfig(ctData);
        if (Array.isArray(sevData) && sevData.length > 0) setSeverityConfig(sevData);
        if (Array.isArray(slaData) && slaData.length > 0) setSlaStatusConfig(slaData);
      })
      .catch((err) => console.error('Failed to load dashboard data:', err))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

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

  // Filter Logic
  //
  // Split into two passes on purpose. Everything here is time-independent, so it only re-runs
  // when the data or a filter control actually changes — not on every tick of the `now` clock.
  // The SLA filter, which is the only genuinely time-dependent predicate, is applied separately
  // below. Filtering is a conjunction of predicates, so splitting it cannot change the result.
  const baseFilteredCases = useMemo(() => {
    return allCases.filter((c) => {
      const createdDate = new Date(c.createdAt || c.slaStartTime || Date.now());

      if (dateRange !== 'all') {
        const nowDate = new Date();
        if (dateRange === 'today') {
          const startOfToday = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
          if (createdDate < startOfToday) return false;
        } else if (dateRange === 'this_week') {
          const day = nowDate.getDay() || 7;
          const startOfWeek = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - day + 1);
          if (createdDate < startOfWeek) return false;
        } else if (dateRange === 'last_week') {
          const day = nowDate.getDay() || 7;
          const startOfLastWeek = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - day - 6);
          const endOfLastWeek = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - day);
          if (createdDate < startOfLastWeek || createdDate > endOfLastWeek) return false;
        } else if (dateRange === 'this_month') {
          const startOfMonth = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
          if (createdDate < startOfMonth) return false;
        } else if (dateRange === 'last_month') {
          const startOfLastMonth = new Date(nowDate.getFullYear(), nowDate.getMonth() - 1, 1);
          const endOfLastMonth = new Date(nowDate.getFullYear(), nowDate.getMonth(), 0);
          if (createdDate < startOfLastMonth || createdDate > endOfLastMonth) return false;
        } else if (dateRange === 'this_quarter') {
          const currentQuarter = Math.floor(nowDate.getMonth() / 3);
          const startOfQuarter = new Date(nowDate.getFullYear(), currentQuarter * 3, 1);
          if (createdDate < startOfQuarter) return false;
        } else if (dateRange === 'this_year') {
          const startOfYear = new Date(nowDate.getFullYear(), 0, 1);
          if (createdDate < startOfYear) return false;
        } else if (dateRange === 'custom') {
          if (customStartDate && createdDate < new Date(customStartDate)) return false;
          if (customEndDate && createdDate > new Date(customEndDate + 'T23:59:59')) return false;
        }
      }

      if (deptFilter !== 'all' && c.departmentId !== deptFilter && c.departmentName !== deptFilter) {
        return false;
      }

      if (statusFilter !== 'all' && c.status !== statusFilter) {
        return false;
      }

      if (caseTypeFilter !== 'all') {
        const type =
          c.caseType ||
          (c.caseNumber?.startsWith('S-')
            ? 'Service'
            : c.caseNumber?.startsWith('I-') || c.caseNumber?.startsWith('E-')
            ? 'Inquiry'
            : 'Complaint');

        const normFilter = caseTypeFilter === 'Enquiry' ? 'Inquiry' : caseTypeFilter;
        const normType = type === 'Enquiry' ? 'Inquiry' : type;

        if (normType !== normFilter) return false;
      }

      if (severityFilter !== 'all' && c.severity !== severityFilter) {
        return false;
      }

      if (myCasesOnly && currentUser && c.ownerId !== currentUser.id) {
        return false;
      }

      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchesNumber = c.caseNumber?.toLowerCase().includes(q);
        const matchesTitle = c.title?.toLowerCase().includes(q);
        const matchesCustomer = c.customerName?.toLowerCase().includes(q);
        const matchesAgent = c.ownerName?.toLowerCase().includes(q);
        const matchesChildId = c.childRelations?.some((cr) => cr.childId?.toLowerCase().includes(q));
        if (!matchesNumber && !matchesTitle && !matchesCustomer && !matchesAgent && !matchesChildId) return false;
      }

      return true;
    });
  }, [allCases, dateRange, customStartDate, customEndDate, deptFilter, statusFilter, caseTypeFilter, severityFilter, searchQuery, myCasesOnly, currentUser]);

  // Time-dependent pass. When no SLA filter is selected — the default — this returns the base
  // array unchanged, so its identity is stable across clock ticks and every memo below it stops
  // recomputing on a timer. The predicate itself is byte-for-byte the one that used to live
  // inside the single combined filter.
  const filteredCases = useMemo(() => {
    if (slaFilter === 'all') return baseFilteredCases;

    return baseFilteredCases.filter((c) => {
      const createdTime = new Date(c.slaStartTime || c.createdAt || Date.now()).getTime();
      const { internalHours } = getSlaConfig(c.severity, c.slaTargetHours);
      const targetDeadline = createdTime + internalHours * 3600 * 1000;
      const isResolved = c.status === 'Resolved';
      const resolvedTime = c.resolvedAt ? new Date(c.resolvedAt).getTime() : now;
      const isBreached = isResolved
        ? resolvedTime > targetDeadline
        : now > targetDeadline;
      const remainingMs = targetDeadline - now;
      const isApproaching = !isResolved && !isBreached && remainingMs < 2 * 3600 * 1000;

      if (slaFilter === 'breached' && !isBreached) return false;
      if (slaFilter === 'approaching' && !isApproaching) return false;
      if (slaFilter === 'healthy' && (isBreached || isApproaching)) return false;

      return true;
    });
  }, [baseFilteredCases, slaFilter, now]);

  // Dynamic KPI Metrics Calculations
  const metrics = useMemo(() => {
    const total = filteredCases.length;
    const openCases = filteredCases.filter((c) => c.status !== 'Resolved');
    const assignedCases = filteredCases.filter(
      (c) => c.ownerId && c.ownerId !== '00000000-0000-0000-0000-000000000000'
    );
    const resolvedCases = filteredCases.filter((c) => c.status === 'Resolved');
    const inProgressCases = filteredCases.filter((c) => c.status === 'InProgress' || c.status === 'Working');

    let breachedCount = 0;
    filteredCases.forEach((c) => {
      const createdTime = new Date(c.slaStartTime || c.createdAt || Date.now()).getTime();
      const { internalHours } = getSlaConfig(c.severity, c.slaTargetHours);
      const targetDeadline = createdTime + internalHours * 3600 * 1000;
      const isResolved = c.status === 'Resolved';
      const resolvedTime = c.resolvedAt ? new Date(c.resolvedAt).getTime() : now;

      if (isResolved) {
        if (resolvedTime > targetDeadline) breachedCount++;
      } else {
        if (now > targetDeadline) breachedCount++;
      }
    });

    const withinSlaCount = Math.max(0, total - breachedCount);
    const slaAdherencePct = total > 0 ? ((withinSlaCount / total) * 100).toFixed(1) : '100';

    return {
      total,
      openCount: openCases.length,
      assignedCount: assignedCases.length,
      resolvedCount: resolvedCases.length,
      inProgressCount: inProgressCases.length,
      slaAdherencePct,
      withinSlaCount,
      breachedCount,
    };
  }, [filteredCases, now]);

  // Analytics: Cases by Department (Horizontal Bar Chart Data)
  const deptChartData = useMemo(() => {
    const counts = {};
    filteredCases.forEach((c) => {
      const dName = c.departmentName || 'General';
      counts[dName] = (counts[dName] || 0) + 1;
    });

    const items = Object.entries(counts).map(([name, count]) => ({
      name,
      count,
    }));

    items.sort((a, b) => b.count - a.count);
    const maxCount = Math.max(...items.map((i) => i.count), 1);

    return items.map((item, idx) => ({
      ...item,
      percentage: Math.round((item.count / maxCount) * 100),
      colorVar: `var(--color-dept-${idx % 10})`,
    }));
  }, [filteredCases]);

  // Analytics: Cases by Severity (Doughnut Chart Data)
  const severityChartData = useMemo(() => {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    filteredCases.forEach((c) => {
      const sev = c.severity || 'Medium';
      if (counts[sev] !== undefined) counts[sev]++;
      else counts.Medium++;
    });

    const total = filteredCases.length || 1;
    return [
      { name: 'Critical', count: counts.Critical, color: '#ef4444', pct: Math.round((counts.Critical / total) * 100) },
      { name: 'High', count: counts.High, color: '#f97316', pct: Math.round((counts.High / total) * 100) },
      { name: 'Medium', count: counts.Medium, color: '#f59e0b', pct: Math.round((counts.Medium / total) * 100) },
      { name: 'Low', count: counts.Low, color: '#10b981', pct: Math.round((counts.Low / total) * 100) },
    ];
  }, [filteredCases]);

  // Analytics: Cases Resolved Over Time (Smooth Line Chart Data)
  const resolvedLineData = useMemo(() => {
    const resolvedOnly = filteredCases.filter((c) => c.status === 'Resolved' && c.resolvedAt);
    const intervalMap = {};
    const now = new Date();

    if (resolvedTimeframe === 'daily') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        intervalMap[key] = 0;
      }
      resolvedOnly.forEach((c) => {
        const rDate = new Date(c.resolvedAt);
        const key = rDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (intervalMap[key] !== undefined) intervalMap[key]++;
      });
    } else if (resolvedTimeframe === 'weekly') {
      for (let i = 3; i >= 0; i--) {
        const key = `Wk ${4 - i}`;
        intervalMap[key] = 0;
      }
      resolvedOnly.forEach((c) => {
        const rDate = new Date(c.resolvedAt);
        const diffWeeks = Math.floor((now - rDate) / (7 * 24 * 3600 * 1000));
        if (diffWeeks >= 0 && diffWeeks < 4) {
          const key = `Wk ${4 - diffWeeks}`;
          if (intervalMap[key] !== undefined) intervalMap[key]++;
        }
      });
    } else {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toLocaleDateString('en-US', { month: 'short' });
        intervalMap[key] = 0;
      }
      resolvedOnly.forEach((c) => {
        const rDate = new Date(c.resolvedAt);
        const key = rDate.toLocaleDateString('en-US', { month: 'short' });
        if (intervalMap[key] !== undefined) intervalMap[key]++;
      });
    }

    return Object.entries(intervalMap).map(([label, val]) => ({ label, val }));
  }, [filteredCases, resolvedTimeframe]);

  // Operational: Recent Activity
  const recentActivities = useMemo(() => {
    const activities = [];
    filteredCases.forEach((c) => {
      if (c.status === 'Resolved' && c.resolvedAt) {
        activities.push({
          id: `act-res-${c.id}`,
          type: 'resolved',
          title: `Case ${c.caseNumber} resolved`,
          sub: `${c.title} · ${c.ownerName || 'Agent'}`,
          time: new Date(c.resolvedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          caseId: c.id,
        });
      } else {
        activities.push({
          id: `act-cre-${c.id}`,
          type: c.status === 'Escalated' ? 'escalated' : 'created',
          title: `Case ${c.caseNumber} ${c.status === 'Escalated' ? 'escalated' : 'updated'}`,
          sub: `${c.title} · Department: ${c.departmentName}`,
          time: new Date(c.createdAt || c.slaStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          caseId: c.id,
        });
      }
    });
    return activities;
  }, [filteredCases]);

  // Operational: Cases Requiring SLA Attention
  const attentionCases = useMemo(() => {
    return filteredCases.filter((c) => {
      if (c.status === 'Resolved') return false;
      const createdTime = new Date(c.slaStartTime || c.createdAt || Date.now()).getTime();
      const { internalHours } = getSlaConfig(c.severity, c.slaTargetHours);
      const targetDeadline = createdTime + internalHours * 3600 * 1000;
      const remainingMs = targetDeadline - now;

      const isBreached = remainingMs < 0;
      const isApproaching = remainingMs > 0 && remainingMs < 3 * 3600 * 1000;
      const isCritical = c.severity === 'Critical' || c.severity === 'High';
      const isUnassigned = !c.ownerId || c.ownerId === '00000000-0000-0000-0000-000000000000';

      return isBreached || isApproaching || isCritical || isUnassigned;
    });
  }, [filteredCases, now]);

  // Stable handlers: a new function identity on every render would defeat the memo() on the
  // extracted list components below.
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
        {filteredCases.length === 0 ? (
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
                      <div className="doughnut-center-number">{filteredCases.length}</div>
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
                cases={filteredCases}
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

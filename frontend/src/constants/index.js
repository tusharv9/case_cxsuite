// ===== APPLICATION CONSTANTS =====

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Default logged-in user ID (first user from /api/users is used until auth is wired)
export const LOGGED_IN_USER_ID_KEY = 'csm_logged_in_user_id';

// Seeded fallback user ID (Siti Nurhaliza) — used as X-User-Id header on bootstrap
// before localStorage is populated so the backend 401 guard doesn't block /api/users.
export const DEFAULT_USER_ID = '7ef3fe56-2fa7-4cdb-83c0-3e697ec3f6e1'; 

// Case Status
export const CASE_STATUS = {
  OPEN: 'Open',
  IN_PROGRESS: 'InProgress',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
};

export const CASE_STATUS_LABELS = {
  Open: 'Open',
  InProgress: 'In Progress',
  Escalated: 'Escalated',
  Resolved: 'Resolved',
};

export const CASE_STATUS_COLORS = {
  Open: { color: 'var(--color-status-open)', bg: 'var(--color-status-open-bg)', border: 'var(--color-status-open-border)' },
  InProgress: { color: 'var(--color-status-inprogress)', bg: 'var(--color-status-inprogress-bg)', border: 'var(--color-status-inprogress-border)' },
  Escalated: { color: 'var(--color-status-escalated)', bg: 'var(--color-status-escalated-bg)', border: 'var(--color-status-escalated-border)' },
  Resolved: { color: 'var(--color-status-resolved)', bg: 'var(--color-status-resolved-bg)', border: 'var(--color-status-resolved-border)' },
};

// Severity (Strictly: Low, Medium, High, Critical)
export const SEVERITY = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export const SEVERITY_LABELS = {
  Low: 'Low',
  Medium: 'Medium',
  High: 'High',
  Critical: 'Critical',
  // Backward compatibility fallback for legacy data
  Ok: 'Low',
  Info: 'Medium',
  Warn: 'High',
  Bad: 'Critical',
};

export const SEVERITY_COLORS = {
  Low: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  Medium: { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  High: { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  Critical: { color: '#ffffff', bg: '#dc2626', border: '#dc2626' },
  // Fallbacks
  Ok: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
  Info: { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  Warn: { color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  Bad: { color: '#ffffff', bg: '#dc2626', border: '#dc2626' },
};

// SLA Configurations (Internal SLA is 2 hours less than External SLA)
export const SEVERITY_SLA_MAPPING = {
  Critical: { external: 4, internal: 2 },
  High: { external: 8, internal: 6 },
  Medium: { external: 12, internal: 10 },
  Low: { external: 24, internal: 22 },
  Bad: { external: 4, internal: 2 },
  Warn: { external: 8, internal: 6 },
  Info: { external: 12, internal: 10 },
  Ok: { external: 24, internal: 22 },
};

// Agent Statuses
export const AGENT_STATUSES = ['Available', 'Busy', 'Away'];

// Preferred Languages
export const PREFERRED_LANGUAGES = ['English', 'Bahasa Malaysia', 'Chinese'];

// Event types
export const EVENT_TYPE_LABELS = {
  Create: 'CREATE',
  Assign: 'ASSIGN',
  Note: 'NOTE',
  Cowork: 'COWORK',
  Transfer: 'TRANSFER',
  Escalate: 'ESCALATE',
  Resolve: 'RESOLVE',
};

export const EVENT_TYPE_COLORS = {
  Create: { color: '#1d4ed8', bg: '#dbeafe' },
  Assign: { color: '#1d4ed8', bg: '#dbeafe' },
  Note: { color: '#4b5563', bg: '#f3f4f6' },
  Cowork: { color: '#7c3aed', bg: '#ede9fe' },
  Transfer: { color: '#b45309', bg: '#fef3c7' },
  Escalate: { color: '#dc2626', bg: '#fee2e2' },
  Resolve: { color: '#15803d', bg: '#dcfce7' },
};

// Participant roles
export const PARTICIPANT_ROLE = {
  CO_WORKER: 'CoWorker',
  WATCHER: 'Watcher',
};

// Board columns definition
export const BOARD_COLUMNS = [
  { key: 'Open',       label: 'OPEN',                  statusClass: 'col--open' },
  { key: 'InProgress', label: 'IN PROGRESS',            statusClass: 'col--inprogress' },
  { key: 'Escalated',  label: 'ESCALATED · SLA RISK',   statusClass: 'col--escalated' },
  { key: 'Resolved',   label: 'RESOLVED · TODAY',       statusClass: 'col--resolved' },
];

// Predefined Escalation reasons (Without 'Other' duplicate since UI appends a single 'Other' option)
export const ESCALATION_REASONS = [
  'SLA Breach',
  'Customer Complaint Repeat',
  'Regulatory / BNM',
  'Sharia Concern',
  'Fraud Risk',
];

// Resolve dispositions
export const RESOLVE_DISPOSITIONS = [
  'Resolved on First Contact',
  'Resolved after Follow-up',
  'Customer Dropped',
  'Merged',
  'Out of Scope',
];

// Link relationship types
export const LINK_RELATIONSHIPS = [
  'Duplicate Of',
  'Related To',
  'Follow Up Of',
  'Caused By',
];

// Department color assignment (cycling index)
export const DEPT_COLOR_COUNT = 10;

// ===== GLOBAL SEARCH (header smart search) =====
// The backend enforces its own minimum query length and result cap (the "Search" section of
// appsettings); these values only govern when the UI bothers to ask.
export const SEARCH_MIN_QUERY_LENGTH = 2;
export const SEARCH_DEBOUNCE_MS = 250;

// ===== NOTIFICATIONS =====
// How often the unread badge re-checks while the tab is visible. Polling is suspended while
// the tab is hidden and resumes with an immediate refresh, so background tabs cost nothing.
export const NOTIFICATION_POLL_INTERVAL_MS = 8000;

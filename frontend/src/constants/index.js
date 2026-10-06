// ===== APPLICATION CONSTANTS =====

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// STANDALONE (development) only: the user picked in the dev user picker. Under a Host App identity
// comes from the Host's token and this key is never read or written.
export const LOGGED_IN_USER_ID_KEY = 'csm_logged_in_user_id';

// Case Status
export const CASE_STATUS = {
  OPEN: 'Open',
  IN_PROGRESS: 'InProgress',
  WAITING_ON_CUSTOMER: 'WaitingOnCustomer',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
};

export const CASE_STATUS_LABELS = {
  Open: 'Open',
  InProgress: 'In Progress',
  WaitingOnCustomer: 'Waiting on Customer',
  Escalated: 'Escalated',
  Resolved: 'Resolved',
};

// Priorities (severities), their SLA targets and display order are configuration: fetch them from the API.

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
  { key: 'Open',              label: 'OPEN',                 statusClass: 'col--open' },
  { key: 'InProgress',        label: 'IN PROGRESS',           statusClass: 'col--inprogress' },
  { key: 'WaitingOnCustomer', label: 'WAITING ON CUSTOMER',  statusClass: 'col--waiting' },
  { key: 'Escalated',         label: 'ESCALATED',             statusClass: 'col--escalated' },
  { key: 'Resolved',          label: 'RESOLVED',              statusClass: 'col--resolved' },
];

// Defined Filter Options for Case Management
export const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'Open', label: 'Open' },
  { value: 'InProgress', label: 'In Progress' },
  { value: 'WaitingOnCustomer', label: 'Waiting on Customer' },
  { value: 'Escalated', label: 'Escalated' },
  { value: 'Resolved', label: 'Resolved' },
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

// ===== CASE LIST VIEW PAGINATION =====
// Rows per page in the Case Management List View (server-side pagination).
export const CASE_LIST_DEFAULT_PAGE_SIZE = 10;
export const CASE_LIST_PAGE_SIZE_OPTIONS = [10, 25, 50];

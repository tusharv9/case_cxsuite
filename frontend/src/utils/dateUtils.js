// ===== DATE UTILITIES =====

/**
 * Format a date to readable string: "Today · 09:14" or "3 days ago"
 */
export function formatRelativeDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today · ${formatTime(date)}`;
  } else if (diffDays === 1) {
    return `Yesterday · ${formatTime(date)}`;
  } else if (diffDays < 30) {
    return `${diffDays} days ago`;
  } else {
    return formatDate(date);
  }
}

/**
 * Format date + time: "2026-07-06 · 12:54"
 */
export function formatDateTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const d = date.toISOString().slice(0, 10);
  const t = formatTime(date);
  return `${d} · ${t}`;
}

/**
 * Format time only: "09:14"
 */
export function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Format date only: "12 Jun 2026"
 */
export function formatDate(dateInput) {
  if (!dateInput) return '';
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Convert ISO string to "2026-06-12 09:14" for display
 */
export function formatFullDateTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const datePart = date.toISOString().slice(0, 10);
  const timePart = formatTime(date);
  return `${datePart} ${timePart}`;
}

/**
 * Format tenure in months to human readable
 */
export function formatTenure(months) {
  if (!months) return '—';
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years === 0) return `${remainingMonths} months`;
  if (remainingMonths === 0) return `${years} year${years !== 1 ? 's' : ''}`;
  return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
}

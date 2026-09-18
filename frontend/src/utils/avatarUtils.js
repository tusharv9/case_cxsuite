// ===== AVATAR UTILITIES =====

import { DEPT_COLOR_COUNT } from '../constants/index.js';

const AVATAR_COLORS = [
  { bg: '#1d4ed8', text: '#ffffff' },
  { bg: '#7c3aed', text: '#ffffff' },
  { bg: '#0891b2', text: '#ffffff' },
  { bg: '#2563eb', text: '#ffffff' },
  { bg: '#b45309', text: '#ffffff' },
  { bg: '#dc2626', text: '#ffffff' },
  { bg: '#be185d', text: '#ffffff' },
  { bg: '#1e3a8a', text: '#ffffff' },
  { bg: '#1e40af', text: '#ffffff' },
  { bg: '#92400e', text: '#ffffff' },
];

/**
 * Get initials from a full name (max 2 chars)
 */
export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Get a deterministic color pair from a name
 */
export function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

/**
 * Get department color index (cycling 0–9)
 */
export function getDeptColorIndex(deptName) {
  if (!deptName) return 0;
  let hash = 0;
  for (let i = 0; i < deptName.length; i++) {
    hash = deptName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % DEPT_COLOR_COUNT;
}

/**
 * Get short initials for a department (e.g., "Micro-Finance" → "MF")
 */
export function getDeptInitials(name) {
  if (!name) return '?';
  return name
    .split(/[\s\-/]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

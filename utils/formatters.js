import { STATUS } from '@/lib/constants';

/** @see {@link __tests__/formatters.test.js} */
export function normalizedStatus(status) {
  return status === STATUS.PASS || status === STATUS.FAIL
    ? status
    : STATUS.PENDING;
}

/** @see {@link __tests__/formatters.test.js} */
export function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

/** @see {@link __tests__/formatters.test.js} */
export function toDateInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

/** @see {@link __tests__/formatters.test.js} */
export function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Format a test case record's display ID as `TC0001`.
 * Uses `testCaseId` when present, falls back to `_id`.
 *
 * @param {{ testCaseId?: string | number, _id?: string | number }} tc
 * @returns {string}
 * @see {@link __tests__/formatters.test.js}
 */
export function formatTcId(tc) {
  return `TC${String(tc.testCaseId || tc._id).padStart(4, '0')}`;
}

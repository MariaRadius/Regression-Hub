export const QA_USERS = ['Ammad', 'Maria', 'Sohail'];
export const STATUSES = ['', 'Pass', 'Fail'];

export function normalizedStatus(status) {
  return status === 'Pass' || status === 'Fail' ? status : 'Pending';
}

export function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

export function toDateInputValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

export function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

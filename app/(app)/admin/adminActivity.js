import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';

function titleCase(value) {
  if (!value) return 'Unknown';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatChange(change) {
  return `${change.label}: ${change.before ?? '—'} -> ${change.after ?? '—'}`;
}

function buildTitle(event) {
  if (event.category === AUDIT_CATEGORY.USER) {
    if (event.action === AUDIT_ACTION.ROLE_CHANGE) return 'User role updated';
    if (event.action === AUDIT_ACTION.PASSWORD_CHANGE)
      return 'User password updated';
    if (event.action === AUDIT_ACTION.ACTIVATE) return 'User status updated';
    if (event.action === AUDIT_ACTION.DEACTIVATE) return 'User status updated';
    if (event.action === AUDIT_ACTION.CREATE) return 'User created';
    return 'User updated';
  }

  if (event.category === AUDIT_CATEGORY.IMPORT) return 'Import completed';
  if (
    event.category === AUDIT_CATEGORY.CONFIG &&
    event.action === AUDIT_ACTION.RESET_DATA
  ) {
    return 'Team data cleared';
  }

  return `${titleCase(event.category)} updated`;
}

function buildSubject(event) {
  if (event.targetUserName) return event.targetUserName;
  if (event.environment) return `${event.environment} environment`;
  return event.subject || 'Admin activity';
}

function buildDetails(event) {
  if (Array.isArray(event.changes) && event.changes.length > 0) {
    return event.changes.map(formatChange);
  }

  if (event.category === AUDIT_CATEGORY.IMPORT) {
    const details = [];
    if (typeof event.importedCount === 'number') {
      details.push(`Created ${event.importedCount} test cases`);
    }
    if (typeof event.updatedCount === 'number') {
      details.push(`Updated ${event.updatedCount} test cases`);
    }
    return details;
  }

  if (event.category === AUDIT_CATEGORY.CONFIG && event.deleted) {
    return Object.entries(event.deleted).map(
      ([key, value]) => `${titleCase(key)} removed: ${value}`,
    );
  }

  return [];
}

export function formatAdminActivityEntries(events) {
  return (events || []).map((event) => ({
    _id: event._id,
    timestamp: event.at,
    actor: event.by || 'System',
    title: buildTitle(event),
    subject: buildSubject(event),
    details: buildDetails(event),
    raw: event,
  }));
}

function escapeCsv(value) {
  const stringValue = String(value ?? '');
  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n')
  ) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

export function buildAdminActivityCsv(entries) {
  const header = ['Timestamp', 'Actor', 'Activity', 'Subject', 'Details'];
  const rows = (entries || []).map((entry) => [
    entry.timestamp,
    entry.actor,
    entry.title,
    entry.subject,
    (entry.details || []).join(' | '),
  ]);

  return [header, ...rows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\n');
}

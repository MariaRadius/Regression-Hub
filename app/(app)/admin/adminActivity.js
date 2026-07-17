import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';

const RELEASE_ACTION_TITLES = {
  [AUDIT_ACTION.CREATE]: 'Release created',
  [AUDIT_ACTION.CLONE]: 'Release cloned',
  [AUDIT_ACTION.ARCHIVE]: 'Release archived',
  [AUDIT_ACTION.UNARCHIVE]: 'Release unarchived',
  [AUDIT_ACTION.DELETE]: 'Release deleted',
  [AUDIT_ACTION.UPDATE]: 'Release renamed',
  [AUDIT_ACTION.ADD_ENVIRONMENT]: 'Environment added',
  [AUDIT_ACTION.REMOVE_ENVIRONMENT]: 'Environment removed',
};

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

  if (event.category === AUDIT_CATEGORY.RELEASE) {
    return RELEASE_ACTION_TITLES[event.action] ?? 'Release updated';
  }

  if (event.category === AUDIT_CATEGORY.TEST_CASE) {
    if (event.action === AUDIT_ACTION.EDIT) return 'Test case updated';
    if (event.action === AUDIT_ACTION.DELETE) return 'Test case deleted';
    return 'Test case changed';
  }

  if (event.category === AUDIT_CATEGORY.CONFIG) {
    if (event.action === AUDIT_ACTION.RESET_DATA) return 'Team data cleared';
    if (event.action === AUDIT_ACTION.UPDATE) return 'Settings updated';
    return 'Config updated';
  }

  return `${titleCase(event.category)} updated`;
}

function buildSubject(event) {
  if (event.targetUserName) return event.targetUserName;
  if (event.subject) return event.subject;
  if (event.environment) return `${event.environment} environment`;
  if (event.tcId) return event.tcId;
  return 'Admin activity';
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

  if (event.category === AUDIT_CATEGORY.RELEASE && event.environment) {
    return [`Environment: ${event.environment}`];
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

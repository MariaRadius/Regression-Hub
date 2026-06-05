import { describe, expect, it } from 'vitest';
import {
  buildAdminActivityCsv,
  formatAdminActivityEntries,
} from '../adminActivity';

describe('formatAdminActivityEntries', () => {
  it('formats admin user and import events into readable entries', () => {
    const entries = formatAdminActivityEntries([
      {
        _id: 'evt-1',
        category: 'user',
        action: 'role-change',
        by: 'Maria',
        at: '2026-06-05T09:00:00.000Z',
        targetUserName: 'Ammad',
        changes: [{ label: 'Role', before: 'qa', after: 'admin' }],
      },
      {
        _id: 'evt-2',
        category: 'import',
        action: 'import',
        by: 'Maria',
        at: '2026-06-05T10:00:00.000Z',
        environment: 'QA',
        importedCount: 12,
        updatedCount: 4,
      },
    ]);

    expect(entries).toEqual([
      expect.objectContaining({
        actor: 'Maria',
        title: 'User role updated',
        subject: 'Ammad',
        details: ['Role: qa -> admin'],
      }),
      expect.objectContaining({
        actor: 'Maria',
        title: 'Import completed',
        subject: 'QA environment',
        details: ['Created 12 test cases', 'Updated 4 test cases'],
      }),
    ]);
  });
});

describe('buildAdminActivityCsv', () => {
  it('serializes formatted entries into downloadable csv rows', () => {
    const csv = buildAdminActivityCsv([
      {
        timestamp: '2026-06-05T09:00:00.000Z',
        actor: 'Maria',
        title: 'User role updated',
        subject: 'Ammad',
        details: ['Role: qa -> admin'],
      },
    ]);

    expect(csv).toContain('Timestamp,Actor,Activity,Subject,Details');
    expect(csv).toContain('Maria');
    expect(csv).toContain('User role updated');
    expect(csv).toContain('Role: qa -> admin');
  });
});

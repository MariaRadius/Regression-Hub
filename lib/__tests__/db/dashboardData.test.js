import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { PRIORITIES } from '@/lib/constants';
import { getDashboardData } from '@/lib/db/dashboardData';

const TEAM = 'team-1';
const RELEASE = 'release-1';
const ENV = 'QA';
const { db, collections, reset } = createMockDb();

beforeEach(() => reset());

describe('getDashboardData', () => {
  it('returns zero summary when aggregation is empty', async () => {
    collections.testResults = {
      aggregate: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          {
            summary: [],
            byModule: [],
            byTester: [],
            highPrioritySummary: [],
            byCriticalCase: [],
          },
        ]),
      })),
    };
    collections.applications = {
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    };
    collections.modules = {
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    };

    const data = await getDashboardData(db, TEAM, RELEASE, ENV);
    expect(data.summary).toEqual({
      total: 0,
      passed: 0,
      failed: 0,
      pending: 0,
      passPercent: 0,
      failPercent: 0,
    });
    expect(data.criticalSummary).toEqual({
      total: 0,
      passed: 0,
      failed: 0,
      pending: 0,
    });
    expect(data.topFailingModules).toEqual([]);
    expect(data.criticalFailures).toEqual([]);
  });

  it('scopes the aggregation match to the given (teamId, releaseId, environment)', async () => {
    const aggregateSpy = vi.fn(() => ({
      toArray: vi.fn().mockResolvedValue([
        {
          summary: [],
          byModule: [],
          byTester: [],
          highPrioritySummary: [],
          byCriticalCase: [],
        },
      ]),
    }));
    collections.testResults = { aggregate: aggregateSpy };
    collections.applications = {
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    };
    collections.modules = {
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    };

    await getDashboardData(db, TEAM, RELEASE, ENV);

    const pipeline = aggregateSpy.mock.calls[0][0];
    expect(pipeline[0]).toEqual({
      $match: { teamId: TEAM, releaseId: RELEASE, environment: ENV },
    });
  });

  it('derives top failing modules and high-priority critical failures', async () => {
    collections.testResults = {
      aggregate: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          {
            summary: [{ total: 46, passed: 8, failed: 25 }],
            byModule: [
              { _id: 'm1', total: 8, passed: 1, failed: 5 },
              { _id: 'm2', total: 10, passed: 1, failed: 9 },
              { _id: 'm3', total: 7, passed: 1, failed: 6 },
              { _id: 'm4', total: 6, passed: 1, failed: 4 },
              { _id: 'm5', total: 5, passed: 0, failed: 5 },
              { _id: 'm6', total: 10, passed: 2, failed: 7 },
              { _id: 'm7', total: 6, passed: 1, failed: 5 },
            ],
            byTester: [],
            highPrioritySummary: [{ total: 9, passed: 3, failed: 4 }],
            byCriticalCase: [
              {
                _id: 'SAP-0454',
                total: 1,
                passed: 0,
                failed: 1,
                priority: PRIORITIES.HIGH,
                moduleId: 'm3',
                applicationId: 'a1',
              },
              {
                _id: 'PPO-0399',
                total: 1,
                passed: 0,
                failed: 1,
                priority: PRIORITIES.HIGH,
                moduleId: 'm1',
                applicationId: 'a2',
              },
            ],
          },
        ]),
      })),
    };
    collections.applications = {
      find: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          { _id: { toString: () => 'a1' }, name: 'Super Admin' },
          { _id: { toString: () => 'a2' }, name: 'Practice Admin' },
        ]),
      })),
    };
    collections.modules = {
      find: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          {
            _id: { toString: () => 'm1' },
            name: 'Billing',
            applicationId: null,
          },
          {
            _id: { toString: () => 'm2' },
            name: 'Assessment Engine',
            applicationId: null,
          },
          {
            _id: { toString: () => 'm3' },
            name: 'Scheduling',
            applicationId: null,
          },
          {
            _id: { toString: () => 'm4' },
            name: 'Claims',
            applicationId: null,
          },
          {
            _id: { toString: () => 'm5' },
            name: 'Enrollment',
            applicationId: null,
          },
          {
            _id: { toString: () => 'm6' },
            name: 'Provider Search',
            applicationId: null,
          },
          {
            _id: { toString: () => 'm7' },
            name: 'Notifications',
            applicationId: null,
          },
        ]),
      })),
    };

    const data = await getDashboardData(db, TEAM, RELEASE, ENV);

    expect(data.topFailingModules).toEqual([
      { id: 'm2', name: 'Assessment Engine', failed: 9, total: 10 },
      { id: 'm6', name: 'Provider Search', failed: 7, total: 10 },
      { id: 'm3', name: 'Scheduling', failed: 6, total: 7 },
      { id: 'm1', name: 'Billing', failed: 5, total: 8 },
      { id: 'm7', name: 'Notifications', failed: 5, total: 6 },
    ]);
    expect(data.criticalSummary).toEqual({
      total: 9,
      passed: 3,
      failed: 4,
      pending: 2,
    });
    expect(data.criticalFailures).toEqual([
      {
        testKey: 'SAP-0454',
        priority: PRIORITIES.HIGH,
        failed: 1,
        moduleName: 'Scheduling',
        applicationName: 'Super Admin',
      },
      {
        testKey: 'PPO-0399',
        priority: PRIORITIES.HIGH,
        failed: 1,
        moduleName: 'Billing',
        applicationName: 'Practice Admin',
      },
    ]);
  });

  it('merges module groups that share a display name so failures are not dropped', async () => {
    // m1 and m2 are distinct modules (different apps) that share the name
    // "Order Management"; m9 has no matching module doc → "Unknown". The
    // authoritative failed count is 7 + 4 + 1 + 3 = 15.
    collections.testResults = {
      aggregate: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          {
            summary: [{ total: 23, passed: 8, failed: 15 }],
            byModule: [
              { _id: 'm1', total: 10, passed: 2, failed: 7 },
              { _id: 'm2', total: 6, passed: 1, failed: 4 },
              { _id: 'm3', total: 4, passed: 2, failed: 1 },
              { _id: 'm9', total: 3, passed: 0, failed: 3 },
            ],
            byTester: [],
            highPrioritySummary: [],
            byCriticalCase: [],
          },
        ]),
      })),
    };
    collections.applications = {
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    };
    collections.modules = {
      find: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          { _id: { toString: () => 'm1' }, name: 'Order Management' },
          { _id: { toString: () => 'm2' }, name: 'Order Management' },
          { _id: { toString: () => 'm3' }, name: 'Login' },
        ]),
      })),
    };

    const data = await getDashboardData(db, TEAM, RELEASE, ENV);
    const groups = data.moduleGroups;

    // Same-named modules merge: failures summed, not overwritten.
    expect(groups['Order Management']).toEqual({
      id: 'm1', // highest-total contributor's id is kept
      total: 16,
      passed: 3,
      failed: 11,
      pending: 2,
    });
    expect(groups.Login).toEqual({
      id: 'm3',
      total: 4,
      passed: 2,
      failed: 1,
      pending: 1,
    });
    expect(groups.Unknown).toEqual({
      id: 'm9',
      total: 3,
      passed: 0,
      failed: 3,
      pending: 0,
    });

    // The critical invariant: module failures reconcile to the summary total.
    const failedAcrossModules = Object.values(groups).reduce(
      (sum, g) => sum + g.failed,
      0,
    );
    expect(failedAcrossModules).toBe(data.summary.failed);
    expect(failedAcrossModules).toBe(15);
  });

  it('builds failByModule with application names, keeping same-named modules distinct and reconciling to summary', async () => {
    // m1 and m2 share the name "Orders" but live in different apps; m9 has no
    // resolvable module. Authoritative failed = 7 + 4 + 1 + 3 = 15.
    collections.testResults = {
      aggregate: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          {
            summary: [{ total: 23, passed: 8, failed: 15 }],
            byModule: [
              { _id: 'm1', total: 10, passed: 2, failed: 7 },
              { _id: 'm2', total: 6, passed: 1, failed: 4 },
              { _id: 'm3', total: 4, passed: 2, failed: 1 },
              { _id: 'm9', total: 3, passed: 0, failed: 3 },
            ],
            byTester: [],
            highPrioritySummary: [],
            byCriticalCase: [],
          },
        ]),
      })),
    };
    collections.applications = {
      find: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          { _id: { toString: () => 'a1' }, name: 'Practice Admin' },
          { _id: { toString: () => 'a2' }, name: 'Super Admin' },
        ]),
      })),
    };
    collections.modules = {
      find: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          {
            _id: { toString: () => 'm1' },
            name: 'Orders',
            applicationId: { toString: () => 'a1' },
          },
          {
            _id: { toString: () => 'm2' },
            name: 'Orders',
            applicationId: { toString: () => 'a2' },
          },
          {
            _id: { toString: () => 'm3' },
            name: 'Login',
            applicationId: { toString: () => 'a1' },
          },
        ]),
      })),
    };

    const data = await getDashboardData(db, TEAM, RELEASE, ENV);

    expect(data.failByModule).toEqual([
      {
        moduleId: 'm1',
        moduleName: 'Orders',
        appName: 'Practice Admin',
        failed: 7,
      },
      {
        moduleId: 'm2',
        moduleName: 'Orders',
        appName: 'Super Admin',
        failed: 4,
      },
      {
        moduleId: 'm3',
        moduleName: 'Login',
        appName: 'Practice Admin',
        failed: 1,
      },
      { moduleId: 'm9', moduleName: 'Unknown', appName: null, failed: 3 },
    ]);

    const failedSum = data.failByModule.reduce((s, m) => s + m.failed, 0);
    expect(failedSum).toBe(data.summary.failed);
    expect(failedSum).toBe(15);
  });
});

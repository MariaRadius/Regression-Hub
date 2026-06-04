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
            summary: [{ total: 20, passed: 8, failed: 7 }],
            byModule: [
              { _id: 'm1', total: 8, passed: 1, failed: 5 },
              { _id: 'm2', total: 6, passed: 2, failed: 3 },
              { _id: 'm3', total: 6, passed: 5, failed: 0 },
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
        ]),
      })),
    };

    const data = await getDashboardData(db, TEAM, RELEASE, ENV);

    expect(data.topFailingModules).toEqual([
      { id: 'm1', name: 'Billing', failed: 5, total: 8 },
      { id: 'm2', name: 'Assessment Engine', failed: 3, total: 6 },
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
});

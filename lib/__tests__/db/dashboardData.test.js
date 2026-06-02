import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
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
  });

  it('scopes the aggregation match to the given (teamId, releaseId, environment)', async () => {
    const aggregateSpy = vi.fn(() => ({
      toArray: vi
        .fn()
        .mockResolvedValue([{ summary: [], byModule: [], byTester: [] }]),
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
});

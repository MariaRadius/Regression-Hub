import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { getDashboardData } from '@/lib/db/dashboardData';

const TEAM = 'team-1';
const { db, collections, reset } = createMockDb();

beforeEach(() => reset());

describe('getDashboardData', () => {
  it('returns zero summary when aggregation is empty', async () => {
    collections.testCases = {
      aggregate: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          {
            summary: [],
            byModule: [],
            byApp: [],
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

    const data = await getDashboardData(db, TEAM);
    expect(data.summary).toEqual({
      total: 0,
      passed: 0,
      failed: 0,
      pending: 0,
      passPercent: 0,
      failPercent: 0,
    });
  });
});

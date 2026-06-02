import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { getDashboardData, getDashboardSettings } from '@/lib/db/dashboardData';

const TEAM = 'team-1';
const { db, collections, reset } = createMockDb();

beforeEach(() => reset());

describe('getDashboardData', () => {
  it('keeps small pass and fail rates above zero when counts are non-zero', async () => {
    collections.testCases = {
      aggregate: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          {
            summary: [{ total: 2105, passed: 3, failed: 1 }],
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

    const data = await getDashboardData(db, TEAM);

    expect(data.summary.passPercent).toBe(0.14);
    expect(data.summary.failPercent).toBe(0.05);
  });

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

describe('getDashboardSettings', () => {
  it('returns empty softwareVersion when no settings doc', async () => {
    collections.teamSettings = { findOne: vi.fn().mockResolvedValue(null) };
    const s = await getDashboardSettings(db, TEAM);
    expect(s).toEqual({ softwareVersion: '' });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getDb, collections, resetCollections } = vi.hoisted(() => {
  const collections = {};

  const getDb = vi.fn(async () => ({
    collection: vi.fn((name) => {
      if (!collections[name]) {
        collections[name] = {};
      }
      return collections[name];
    }),
  }));

  const resetCollections = () => {
    for (const key of Object.keys(collections)) {
      delete collections[key];
    }
    getDb.mockClear();
  };

  return { getDb, collections, resetCollections };
});

vi.mock('@/lib/mongodb', () => ({ getDb }));

import {
  getVersions,
  deleteVersion,
  completeVersion,
  restoreVersion,
  getVersionHistoryDetail,
} from '@/lib/versionsData';

const TEAM = 'team-1';

function stubTestCasesCollection(overrides = {}) {
  collections.testCases = {
    aggregate: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    bulkWrite: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    ...overrides,
  };
}

function stubTeamSettings(overrides = {}) {
  collections.teamSettings = {
    findOne: vi.fn().mockResolvedValue(null),
    updateOne: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function stubModules(overrides = {}) {
  collections.modules = {
    find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    ...overrides,
  };
}

beforeEach(() => {
  resetCollections();
});

describe('getVersions', () => {
  it('throws when teamId is falsy', async () => {
    await expect(getVersions({ teamId: '' })).rejects.toThrow('teamId required');
  });

  it('returns shaped version rows from aggregate results', async () => {
    const lastCurrent = new Date('2025-06-01');
    const lastHistory = new Date('2024-01-01');
    const currentToArray = vi.fn().mockResolvedValue([
      { _id: '2.0', total: 10, passed: 8, failed: 1, lastUpdated: lastCurrent },
    ]);
    const historyToArray = vi.fn().mockResolvedValue([
      { _id: '1.0', total: 5, passed: 5, failed: 0, lastUpdated: lastHistory },
    ]);
    stubTestCasesCollection({
      aggregate: vi
        .fn()
        .mockReturnValueOnce({ toArray: currentToArray })
        .mockReturnValueOnce({ toArray: historyToArray }),
    });
    stubTeamSettings({
      findOne: vi.fn().mockResolvedValue({ completedVersions: ['2.0'] }),
    });

    const versions = await getVersions({ teamId: TEAM });

    expect(versions).toHaveLength(2);
    expect(versions[0]).toMatchObject({
      version: '2.0',
      total: 10,
      passed: 8,
      failed: 1,
      pending: 1,
      passRate: 80,
      isCurrent: false,
    });
    expect(versions[1]).toMatchObject({
      version: '1.0',
      total: 5,
      passed: 5,
      failed: 0,
      pending: 0,
      passRate: 100,
      isCurrent: false,
    });
    expect(new Date(versions[0].lastUpdated)).toEqual(lastCurrent);
  });

  it('marks non-completed current versions as isCurrent', async () => {
    stubTestCasesCollection({
      aggregate: vi
        .fn()
        .mockReturnValueOnce({
          toArray: vi.fn().mockResolvedValue([
            { _id: '3.0', total: 2, passed: 1, failed: 0, lastUpdated: new Date() },
          ]),
        })
        .mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue([]) }),
    });
    stubTeamSettings({ findOne: vi.fn().mockResolvedValue({ completedVersions: [] }) });

    const [row] = await getVersions({ teamId: TEAM });
    expect(row.isCurrent).toBe(true);
  });

  it('propagates getDb failures', async () => {
    getDb.mockRejectedValueOnce(new Error('db unavailable'));
    await expect(getVersions({ teamId: TEAM })).rejects.toThrow('db unavailable');
  });
});

describe('deleteVersion', () => {
  it('throws when teamId or version is falsy', async () => {
    await expect(deleteVersion({ teamId: '', version: '1.0', isCurrent: true }))
      .rejects.toThrow('teamId required');
    await expect(deleteVersion({ teamId: TEAM, version: '', isCurrent: true }))
      .rejects.toThrow('version required');
  });

  it('uses deleteMany for current versions', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ deletedCount: 3 });
    stubTestCasesCollection({ deleteMany });

    const result = await deleteVersion({ teamId: TEAM, version: '2.0', isCurrent: true });

    expect(deleteMany).toHaveBeenCalledWith({ teamId: TEAM, softwareVersionTested: '2.0' });
    expect(result).toEqual({ deleted: 3 });
  });

  it('uses updateMany with $pull for history versions', async () => {
    const updateMany = vi.fn().mockResolvedValue({ modifiedCount: 2 });
    stubTestCasesCollection({ updateMany });

    const result = await deleteVersion({ teamId: TEAM, version: '1.0', isCurrent: false });

    expect(updateMany).toHaveBeenCalledWith(
      { teamId: TEAM, 'history.version': '1.0' },
      { $pull: { history: { version: '1.0' } } }
    );
    expect(result).toEqual({ deleted: 2 });
  });
});

describe('completeVersion', () => {
  it('throws when teamId or version is falsy', async () => {
    await expect(completeVersion({ teamId: '', version: '1.0' }))
      .rejects.toThrow('teamId required');
    await expect(completeVersion({ teamId: TEAM, version: '' }))
      .rejects.toThrow('version required');
  });

  it('snapshots zero test cases and still completes the version', async () => {
    const updateOne = vi.fn().mockResolvedValue({});
    stubTestCasesCollection({
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    });
    stubTeamSettings({ updateOne });

    const result = await completeVersion({ teamId: TEAM, version: '2.0' });

    expect(result).toEqual({ snapshotted: 0 });
    expect(updateOne).toHaveBeenCalledWith(
      { teamId: TEAM },
      { $addToSet: { completedVersions: '2.0' } },
      { upsert: true }
    );
  });

  it('bulk-writes history when test cases exist', async () => {
    const bulkWrite = vi.fn().mockResolvedValue({});
    stubTestCasesCollection({
      find: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          { _id: 'tc1', status: 'Pass', history: [] },
        ]),
      })),
      bulkWrite,
    });
    stubTeamSettings({ updateOne: vi.fn().mockResolvedValue({}) });

    const result = await completeVersion({ teamId: TEAM, version: '2.0' });

    expect(bulkWrite).toHaveBeenCalledOnce();
    expect(result).toEqual({ snapshotted: 1 });
  });
});

describe('restoreVersion', () => {
  it('throws when teamId or version is falsy', async () => {
    await expect(restoreVersion({ teamId: '', version: '1.0' }))
      .rejects.toThrow('teamId required');
    await expect(restoreVersion({ teamId: TEAM, version: '' }))
      .rejects.toThrow('version required');
  });

  it("throws 'No test cases found' when the team has no test cases", async () => {
    stubTestCasesCollection({
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    });

    await expect(restoreVersion({ teamId: TEAM, version: '1.0' }))
      .rejects.toThrow('No test cases found');
  });

  it('restores version and updates team settings when test cases exist', async () => {
    const bulkWrite = vi.fn().mockResolvedValue({ modifiedCount: 1 });
    const updateOne = vi.fn().mockResolvedValue({});
    stubTestCasesCollection({
      find: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          {
            _id: 'tc1',
            softwareVersionTested: '9.0',
            status: 'Pass',
            history: [{ version: '1.0', status: 'Fail' }],
          },
        ]),
      })),
      bulkWrite,
    });
    stubTeamSettings({ updateOne });

    const result = await restoreVersion({ teamId: TEAM, version: '1.0' });

    expect(result).toEqual({ restored: 1 });
    expect(updateOne).toHaveBeenCalled();
  });
});

describe('getVersionHistoryDetail', () => {
  it('throws when teamId or version is falsy', async () => {
    await expect(getVersionHistoryDetail({ teamId: '', version: '1.0' }))
      .rejects.toThrow('teamId required');
    await expect(getVersionHistoryDetail({ teamId: TEAM, version: '' }))
      .rejects.toThrow('version required');
  });

  it('returns summary, byModule, and byTester from aggregate results', async () => {
    const modId = { toString: () => 'mod-1' };
    stubModules({
      find: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([{ _id: modId, name: 'Billing' }]),
      })),
    });
    stubTestCasesCollection({
      aggregate: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          {
            summary: [{ total: 4, passed: 3, failed: 1 }],
            byModule: [{ _id: modId, total: 4, passed: 3, failed: 1 }],
            byTester: [{ _id: 'Alice', total: 4, passed: 3, failed: 1 }],
          },
        ]),
      })),
    });

    const detail = await getVersionHistoryDetail({ teamId: TEAM, version: '1.0' });

    expect(detail.version).toBe('1.0');
    expect(detail.summary).toEqual({
      total: 4,
      passed: 3,
      failed: 1,
      pending: 0,
      passRate: 75,
    });
    expect(detail.byModule[0]).toMatchObject({
      module: 'Billing',
      total: 4,
      passRate: 75,
    });
    expect(detail.byTester[0]).toMatchObject({
      tester: 'Alice',
      total: 4,
      pending: 0,
    });
  });
});

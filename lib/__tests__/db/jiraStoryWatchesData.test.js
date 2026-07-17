import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import {
  acknowledgeAllStoryWatches,
  acknowledgeStoryWatch,
  getStoryWatch,
  listDistinctStoryKeys,
  listStoryWatches,
  recordAnalyzedStorySnapshot,
  upsertStoryWatch,
} from '@/lib/db/jiraStoryWatchesData';

const TEAM = 'team-1';
const { db, collections, reset } = createMockDb();

beforeEach(() => reset());

// ---------------------------------------------------------------------------
// listDistinctStoryKeys
// ---------------------------------------------------------------------------
describe('listDistinctStoryKeys', () => {
  it('returns distinct jiraStory values for the team', async () => {
    collections.testCases = {
      distinct: vi.fn().mockResolvedValue(['SAP-1', 'SAP-2']),
    };

    const keys = await listDistinctStoryKeys(db, TEAM);

    expect(keys).toEqual(['SAP-1', 'SAP-2']);
    expect(collections.testCases.distinct).toHaveBeenCalledWith('jiraStory', {
      teamId: TEAM,
      jiraStory: { $nin: ['', null] },
    });
  });

  it('returns empty array when no stories exist', async () => {
    collections.testCases = {
      distinct: vi.fn().mockResolvedValue([]),
    };
    const keys = await listDistinctStoryKeys(db, TEAM);
    expect(keys).toEqual([]);
  });

  it('propagates DB errors', async () => {
    collections.testCases = {
      distinct: vi.fn().mockRejectedValue(new Error('DB error')),
    };
    await expect(listDistinctStoryKeys(db, TEAM)).rejects.toThrow('DB error');
  });
});

// ---------------------------------------------------------------------------
// listStoryWatches
// ---------------------------------------------------------------------------
describe('listStoryWatches', () => {
  it('returns all watch docs for the team', async () => {
    const docs = [
      {
        teamId: TEAM,
        storyKey: 'SAP-1',
        jiraUpdatedAt: new Date(),
        acknowledgedAt: null,
      },
    ];
    collections.jiraStoryWatches = {
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(docs) })),
    };

    const result = await listStoryWatches(db, TEAM);

    expect(result).toEqual(docs);
    expect(collections.jiraStoryWatches.find).toHaveBeenCalledWith({
      teamId: TEAM,
    });
  });

  it('returns empty array when no watches exist', async () => {
    collections.jiraStoryWatches = {
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    };
    const result = await listStoryWatches(db, TEAM);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// upsertStoryWatch
// ---------------------------------------------------------------------------
describe('upsertStoryWatch', () => {
  it('upserts with jira fields and does NOT touch acknowledgedAt', async () => {
    collections.jiraStoryWatches = {
      updateOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    };

    const jiraUpdatedAt = new Date('2026-06-01T00:00:00Z');
    await upsertStoryWatch(db, TEAM, {
      storyKey: 'SAP-1',
      jiraUpdatedAt,
      jiraSummary: 'Login flow',
    });

    const [filter, update, options] =
      collections.jiraStoryWatches.updateOne.mock.calls[0];
    expect(filter).toEqual({ teamId: TEAM, storyKey: 'SAP-1' });
    expect(update.$set).toMatchObject({
      jiraUpdatedAt,
      jiraSummary: 'Login flow',
    });
    expect(update.$set).toHaveProperty('jiraCheckedAt');
    expect(update.$set).not.toHaveProperty('acknowledgedAt');
    expect(options).toEqual({ upsert: true });
  });

  it('throws when teamId is falsy', async () => {
    await expect(
      upsertStoryWatch(db, '', {
        storyKey: 'SAP-1',
        jiraUpdatedAt: new Date(),
        jiraSummary: '',
      }),
    ).rejects.toThrow('teamId required');
  });
});

// ---------------------------------------------------------------------------
// acknowledgeStoryWatch
// ---------------------------------------------------------------------------
describe('acknowledgeStoryWatch', () => {
  it('sets acknowledgedAt on the matching doc', async () => {
    collections.jiraStoryWatches = {
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    await acknowledgeStoryWatch(db, TEAM, 'SAP-1');

    const [filter, [pipeline]] =
      collections.jiraStoryWatches.updateOne.mock.calls[0];
    expect(filter).toEqual({ teamId: TEAM, storyKey: 'SAP-1' });
    expect(pipeline.$set.acknowledgedAt).toBe('$$NOW');
    expect(pipeline.$set.acknowledgedSummary).toBe('$jiraSummary');
    expect(pipeline.$set.acknowledgedDescription).toBe('$jiraDescription');
    expect(pipeline.$set.acknowledgedAcceptanceCriteria).toBe(
      '$jiraAcceptanceCriteria',
    );
  });

  it('resolves without error when storyKey does not exist', async () => {
    collections.jiraStoryWatches = {
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 0 }),
    };
    await expect(
      acknowledgeStoryWatch(db, TEAM, 'UNKNOWN-99'),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// acknowledgeAllStoryWatches
// ---------------------------------------------------------------------------
describe('acknowledgeAllStoryWatches', () => {
  it('calls updateMany with teamId filter and sets acknowledgedAt', async () => {
    collections.jiraStoryWatches = {
      updateMany: vi.fn().mockResolvedValue({ modifiedCount: 3 }),
    };

    await acknowledgeAllStoryWatches(db, TEAM);

    const [filter, [pipeline]] =
      collections.jiraStoryWatches.updateMany.mock.calls[0];
    expect(filter).toEqual({ teamId: TEAM });
    expect(pipeline.$set.acknowledgedAt).toBe('$$NOW');
    expect(pipeline.$set.acknowledgedSummary).toBe('$jiraSummary');
    expect(pipeline.$set.acknowledgedDescription).toBe('$jiraDescription');
    expect(pipeline.$set.acknowledgedAcceptanceCriteria).toBe(
      '$jiraAcceptanceCriteria',
    );
  });
});

// ---------------------------------------------------------------------------
// recordAnalyzedStorySnapshot
// ---------------------------------------------------------------------------
describe('recordAnalyzedStorySnapshot', () => {
  it('sets jira snapshot fields including acceptance criteria', async () => {
    collections.jiraStoryWatches = {
      updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
    };

    await recordAnalyzedStorySnapshot(db, TEAM, 'SAP-1', {
      jiraSummary: 'S',
      jiraDescription: 'D',
      jiraAcceptanceCriteria: 'AC',
    });

    const [filter, update, options] =
      collections.jiraStoryWatches.updateOne.mock.calls[0];
    expect(filter).toEqual({ teamId: TEAM, storyKey: 'SAP-1' });
    expect(update.$set).toEqual({
      jiraSummary: 'S',
      jiraDescription: 'D',
      jiraAcceptanceCriteria: 'AC',
    });
    expect(options).toEqual({ upsert: true });
  });

  it('throws when teamId is falsy', async () => {
    await expect(
      recordAnalyzedStorySnapshot(db, '', 'SAP-1', {}),
    ).rejects.toThrow('teamId required');
  });

  it('throws when storyKey is falsy', async () => {
    await expect(recordAnalyzedStorySnapshot(db, TEAM, '', {})).rejects.toThrow(
      'storyKey required',
    );
  });
});

// ---------------------------------------------------------------------------
// getStoryWatch
// ---------------------------------------------------------------------------
describe('getStoryWatch', () => {
  it('returns the matching document', async () => {
    const doc = { teamId: TEAM, storyKey: 'SAP-1', jiraSummary: 'Login' };
    collections.jiraStoryWatches = {
      findOne: vi.fn().mockResolvedValue(doc),
    };
    const result = await getStoryWatch(db, TEAM, 'SAP-1');
    expect(result).toEqual(doc);
    expect(collections.jiraStoryWatches.findOne).toHaveBeenCalledWith({
      teamId: TEAM,
      storyKey: 'SAP-1',
    });
  });

  it('returns null when no document exists', async () => {
    collections.jiraStoryWatches = {
      findOne: vi.fn().mockResolvedValue(null),
    };
    expect(await getStoryWatch(db, TEAM, 'SAP-99')).toBeNull();
  });

  it('throws when teamId is falsy', async () => {
    await expect(getStoryWatch(db, '', 'SAP-1')).rejects.toThrow(
      'teamId required',
    );
  });

  it('throws when storyKey is falsy', async () => {
    await expect(getStoryWatch(db, TEAM, '')).rejects.toThrow(
      'storyKey required',
    );
  });
});

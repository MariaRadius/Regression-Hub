import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import { assignTestCases } from '@/lib/db/assignmentsData';

const TEAM = 'team-1';
const RELEASE_ID = new ObjectId().toString();
const { db, collections, reset } = createMockDb();

beforeEach(() => {
  reset();
  // Wire up collection mocks needed by assignTestCases.
  // find().toArray() returns all seeded docs (no filtering); tests seed only
  // matching docs so the union/dedup logic is still exercised.
  collections.testCases = {
    docs: [],
    find: vi.fn(() => ({
      toArray: vi.fn(async () => collections.testCases.docs ?? []),
    })),
  };
  collections.testResults = {
    updateMany: vi
      .fn()
      .mockResolvedValue({ matchedCount: 0, modifiedCount: 0 }),
  };
  collections.events = {
    insertMany: vi.fn().mockResolvedValue({}),
  };
});

function seedCases(cases) {
  collections.testCases.docs = cases;
}

describe('assignTestCases', () => {
  it('mirrors assignedTo onto testResults for explicit tcIds and returns the count', async () => {
    const res = await assignTestCases(
      db,
      TEAM,
      {
        releaseId: RELEASE_ID,
        assignedTo: 'alice',
        tcIds: ['c1', 'c2'],
        environments: ['QA'],
      },
      { assignedBy: 'admin' },
    );
    expect(res).toEqual({ ok: true, testCaseCount: 2 });
    expect(collections.testResults.updateMany).toHaveBeenCalledWith(
      {
        teamId: TEAM,
        releaseId: RELEASE_ID,
        tcId: { $in: ['c1', 'c2'] },
        environment: { $in: ['QA'] },
      },
      { $set: { assignedTo: 'alice' } },
    );
  });

  it('appends one ASSIGN event per (tcId, environment)', async () => {
    await assignTestCases(
      db,
      TEAM,
      {
        releaseId: RELEASE_ID,
        assignedTo: 'alice',
        tcIds: ['c1', 'c2'],
        environments: ['QA', 'Staging'],
      },
      { assignedBy: 'admin' },
    );
    const inserted = collections.events.insertMany.mock.calls[0][0];
    expect(inserted).toHaveLength(4); // 2 cases × 2 envs
    expect(inserted[0]).toMatchObject({
      teamId: TEAM,
      category: AUDIT_CATEGORY.ASSIGNMENT,
      action: AUDIT_ACTION.ASSIGN,
      assignedTo: 'alice',
      by: 'admin',
    });
  });

  it('resolves applicationIds and moduleIds to tcIds, unioned and deduped with tcIds', async () => {
    seedCases([
      {
        _id: new ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'),
        teamId: TEAM,
        releaseId: RELEASE_ID,
        applicationId: 'app1',
      },
      {
        _id: new ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'),
        teamId: TEAM,
        releaseId: RELEASE_ID,
        moduleId: 'mod1',
      },
    ]);
    const res = await assignTestCases(
      db,
      TEAM,
      {
        releaseId: RELEASE_ID,
        assignedTo: 'alice',
        tcIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'], // duplicate of the app1 case → deduped
        applicationIds: ['app1'],
        moduleIds: ['mod1'],
        environments: ['QA'],
      },
      { assignedBy: 'admin' },
    );
    expect(res.testCaseCount).toBe(2); // aaaa (dedup) + bbbb
  });

  it('throws 400 when environments is missing or empty', async () => {
    await expect(
      assignTestCases(
        db,
        TEAM,
        {
          releaseId: RELEASE_ID,
          assignedTo: 'a',
          tcIds: ['c1'],
          environments: [],
        },
        {},
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when no scope source is provided', async () => {
    await expect(
      assignTestCases(
        db,
        TEAM,
        { releaseId: RELEASE_ID, assignedTo: 'a', environments: ['QA'] },
        {},
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when the scope matches no cases', async () => {
    seedCases([]);
    await expect(
      assignTestCases(
        db,
        TEAM,
        {
          releaseId: RELEASE_ID,
          assignedTo: 'a',
          applicationIds: ['nope'],
          environments: ['QA'],
        },
        {},
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when teamId / releaseId / assignedTo missing', async () => {
    await expect(
      assignTestCases(
        db,
        '',
        {
          releaseId: RELEASE_ID,
          assignedTo: 'a',
          tcIds: ['c1'],
          environments: ['QA'],
        },
        {},
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      assignTestCases(
        db,
        TEAM,
        { assignedTo: 'a', tcIds: ['c1'], environments: ['QA'] },
        {},
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      assignTestCases(
        db,
        TEAM,
        { releaseId: RELEASE_ID, tcIds: ['c1'], environments: ['QA'] },
        {},
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

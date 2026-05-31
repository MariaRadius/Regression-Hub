import { describe, expect, it, vi } from 'vitest';
import { expectApiError } from '@/lib/__tests__/helpers/expectApiError';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { bulkUpdateTestCases } from '@/lib/db/testCasesBulkData';

/**
 * @see {@link ../../../lib/db/testCasesBulkData.js bulkUpdateTestCases}
 */

const TEAM = 'team-1';
const IDS = ['aaaaaaaaaaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbbbbbbbbbb'];

/**
 * Build a mock db whose `testCases` collection stubs:
 *  - `countDocuments` — first call returns `matchedBefore` (BR-19 pre-narrow count),
 *    subsequent calls return `missingCount` (R10 expectedResult check).
 *  - `updateMany` — resolves with `{ modifiedCount, matchedCount }`.
 *
 * @param {object} [opts]
 * @param {number} [opts.missingCount=0]   docs missing expectedResult (R10 check)
 * @param {number} [opts.matchedBefore=0]  total matched before same-status narrowing (BR-19)
 * @param {number} [opts.matchedCount]     docs matched by narrowed query (defaults to IDS.length)
 * @param {number} [opts.modifiedCount]    docs actually updated (defaults to IDS.length)
 */
function makeMockDb({
  missingCount = 0,
  matchedBefore = 0,
  matchedCount = IDS.length,
  modifiedCount = IDS.length,
} = {}) {
  const countDocuments = vi
    .fn()
    .mockResolvedValueOnce(matchedBefore)
    .mockResolvedValue(missingCount);
  const findCursor = { toArray: vi.fn().mockResolvedValue([]) };
  return {
    collection: vi.fn().mockReturnValue({
      countDocuments,
      find: vi.fn().mockReturnValue(findCursor),
      updateMany: vi.fn().mockResolvedValue({ modifiedCount, matchedCount }),
    }),
  };
}

/**
 * Build a mock db via createMockDb() with stubs for testCases.find,
 * testCases.countDocuments, testCases.updateMany, and events.insertMany.
 *
 * @param {object} [opts]
 * @param {object[]} [opts.affectedDocs]   docs returned by find().toArray()
 * @param {number}   [opts.matchedBefore]  BR-19 pre-narrow count
 * @param {number}   [opts.missingCount]   R10 missing expectedResult count
 * @param {number}   [opts.matchedCount]   docs matched by narrowed query
 * @param {number}   [opts.modifiedCount]  docs actually updated
 */
function makeAuditMockDb({
  affectedDocs = [],
  matchedBefore = affectedDocs.length,
  missingCount = 0,
  matchedCount = affectedDocs.length,
  modifiedCount = affectedDocs.length,
} = {}) {
  const { db, collections } = createMockDb();

  const countDocuments = vi
    .fn()
    .mockResolvedValueOnce(matchedBefore)
    .mockResolvedValue(missingCount);

  const findCursor = {
    toArray: vi.fn().mockResolvedValue(affectedDocs),
  };

  collections.testCases = {
    countDocuments,
    find: vi.fn().mockReturnValue(findCursor),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount, matchedCount }),
  };

  collections.events = {
    insertMany: vi.fn().mockResolvedValue({}),
  };

  return { db, collections };
}

describe('bulkUpdateTestCases', () => {
  describe('R14 — Pending reset requires notes', () => {
    it('throws 400 when fields.status=Pending and notes is absent', async () => {
      const db = makeMockDb();
      await expectApiError(
        bulkUpdateTestCases(db, TEAM, {
          ids: IDS,
          fields: { status: 'Pending' },
        }),
        {
          status: 400,
          message: 'A reason is required when resetting to Pending',
        },
      );
    });
  });

  describe('R11 — Fail requires notes', () => {
    it('throws 400 when fields.status=Fail and notes is absent', async () => {
      const db = makeMockDb();
      await expectApiError(
        bulkUpdateTestCases(db, TEAM, {
          ids: IDS,
          fields: { status: 'Fail', softwareVersionTested: 'v1' },
        }),
        {
          status: 400,
          message: 'Notes are required when status is Fail',
        },
      );
    });
  });

  describe('R12 — Pass/Fail requires softwareVersionTested when provided', () => {
    it('throws 400 when softwareVersionTested is explicitly provided as empty', async () => {
      const db = makeMockDb();
      await expectApiError(
        bulkUpdateTestCases(db, TEAM, {
          ids: IDS,
          fields: { status: 'Pass', softwareVersionTested: '' },
        }),
        {
          status: 400,
          message:
            'softwareVersionTested is required when marking Pass or Fail',
        },
      );
    });

    it('does not throw when softwareVersionTested is absent (existing value preserved)', async () => {
      const db = makeMockDb({
        missingCount: 0,
        matchedBefore: IDS.length,
        matchedCount: IDS.length,
      });
      await expect(
        bulkUpdateTestCases(db, TEAM, {
          ids: IDS,
          fields: { status: 'Pass' },
        }),
      ).resolves.toEqual({ ok: true, updated: IDS.length, skipped: 0 });
    });
  });

  describe('R10 — Pass/Fail requires expectedResult on all target docs', () => {
    it('throws 400 with count when matching docs have empty expectedResult', async () => {
      const db = makeMockDb({ missingCount: 2, matchedBefore: IDS.length });
      await expectApiError(
        bulkUpdateTestCases(db, TEAM, {
          ids: IDS,
          fields: { status: 'Pass', softwareVersionTested: 'v1' },
        }),
        {
          status: 400,
          message:
            '2 case(s) are missing an expected result — cannot mark Pass/Fail',
        },
      );
    });

    it('succeeds when all target docs have expectedResult', async () => {
      const db = makeMockDb({
        missingCount: 0,
        matchedBefore: IDS.length,
        matchedCount: IDS.length,
      });
      await expect(
        bulkUpdateTestCases(db, TEAM, {
          ids: IDS,
          fields: { status: 'Pass', softwareVersionTested: 'v1' },
        }),
      ).resolves.toEqual({ ok: true, updated: IDS.length, skipped: 0 });
    });
  });

  describe('BR-18 — execution-output fields require a status transition', () => {
    it('throws 400 when notes is supplied without status', async () => {
      const db = makeMockDb();
      await expectApiError(
        bulkUpdateTestCases(db, TEAM, {
          ids: IDS,
          fields: { notes: 'some output' },
        }),
        {
          status: 400,
          message:
            'Tested by, tested on, and notes can only be set via a Pass, Fail, or Pending action',
        },
      );
    });

    it('does NOT throw when softwareVersionTested is supplied without status', async () => {
      // softwareVersionTested is in ALLOWED_FIELDS but NOT in EXECUTION_OUTPUT_FIELDS,
      // so BR-18 must not reject it.
      const db = makeMockDb();
      await expect(
        bulkUpdateTestCases(db, TEAM, {
          ids: IDS,
          fields: { softwareVersionTested: 'v2.0' },
        }),
      ).resolves.toMatchObject({ ok: true });
    });
  });

  describe('BR-19 — bulk status update skips same-status docs', () => {
    it('counts already-Pass docs as skipped and only updates the rest', async () => {
      // 5 docs matched before narrowing; 2 are already Pass (skipped); 3 are updated.
      const totalMatched = 5;
      const alreadyPass = 2;
      const willUpdate = totalMatched - alreadyPass;
      const db = makeMockDb({
        missingCount: 0,
        matchedBefore: totalMatched,
        matchedCount: willUpdate,
        modifiedCount: willUpdate,
      });

      const result = await bulkUpdateTestCases(db, TEAM, {
        ids: IDS,
        fields: { status: 'Pass', softwareVersionTested: 'v1' },
      });

      expect(result).toEqual({
        ok: true,
        updated: willUpdate,
        skipped: alreadyPass,
      });

      // The collection mock's countDocuments should have been called at least once
      // for the pre-narrow matchedBefore count, confirming BR-19 narrowing ran.
      const col = db.collection.mock.results[0].value;
      expect(col.countDocuments).toHaveBeenCalledTimes(2); // matchedBefore + R10 check

      // The updateMany call must include status: { $ne: 'Pass' } in its query
      // to prove same-status docs are excluded.
      const updateManyCall = col.updateMany.mock.calls[0][0];
      expect(updateManyCall.status).toMatchObject({ $ne: 'Pass' });
    });
  });

  describe('Audit events — appendEvents after bulk status update', () => {
    it('fetches affected docs (find called) before updateMany when fields.status is set', async () => {
      const affectedDocs = [
        {
          _id: { toString: () => IDS[0] },
          testCaseId: 'TC-001',
          softwareVersionTested: 'v1',
        },
        {
          _id: { toString: () => IDS[1] },
          testCaseId: 'TC-002',
          softwareVersionTested: 'v1',
        },
      ];
      const { db, collections } = makeAuditMockDb({
        affectedDocs,
        matchedBefore: 2,
      });

      await bulkUpdateTestCases(db, TEAM, {
        ids: IDS,
        fields: { status: 'Pass', softwareVersionTested: 'v1' },
        actor: 'tester@example.com',
      });

      expect(collections.testCases.find).toHaveBeenCalledTimes(1);
      // find must be called before updateMany — check call order via mock.invocationCallOrder
      const findOrder = collections.testCases.find.mock.invocationCallOrder[0];
      const updateManyOrder =
        collections.testCases.updateMany.mock.invocationCallOrder[0];
      expect(findOrder).toBeLessThan(updateManyOrder);
    });

    it('inserts one result event per actually-changed doc', async () => {
      const affectedDocs = [
        {
          _id: { toString: () => IDS[0] },
          testCaseId: 'TC-001',
          softwareVersionTested: 'v1.0',
        },
        {
          _id: { toString: () => IDS[1] },
          testCaseId: 'TC-002',
          softwareVersionTested: null,
        },
      ];
      const { db, collections } = makeAuditMockDb({
        affectedDocs,
        matchedBefore: 2,
      });

      await bulkUpdateTestCases(db, TEAM, {
        ids: IDS,
        fields: { status: 'Pass', softwareVersionTested: 'v1.0' },
        actor: 'Alice',
      });

      expect(collections.events.insertMany).toHaveBeenCalledTimes(1);
      const [insertedDocs] = collections.events.insertMany.mock.calls[0];
      expect(insertedDocs).toHaveLength(2);

      const event0 = insertedDocs[0];
      expect(event0).toMatchObject({
        teamId: TEAM,
        category: 'result',
        action: 'pass',
        testCaseId: IDS[0],
        externalId: 'TC-001',
        status: 'Pass',
        softwareVersionTested: 'v1.0',
        notes: null,
        by: 'Alice',
      });
      expect(event0.at).toBeInstanceOf(Date);

      const event1 = insertedDocs[1];
      expect(event1).toMatchObject({
        testCaseId: IDS[1],
        externalId: 'TC-002',
        softwareVersionTested: null,
        by: 'Alice',
      });
    });

    it('inserts zero events when all matched docs are already the target status (skipped)', async () => {
      // BR-19 narrowing excluded all docs → find returns empty array → no-op in appendEvents
      const { db, collections } = makeAuditMockDb({
        affectedDocs: [],
        matchedBefore: 2,
        matchedCount: 0,
        modifiedCount: 0,
      });

      await bulkUpdateTestCases(db, TEAM, {
        ids: IDS,
        fields: { status: 'Pass', softwareVersionTested: 'v1' },
        actor: 'Alice',
      });

      expect(collections.events.insertMany).not.toHaveBeenCalled();
    });

    it('does not call find or insertMany on a non-status bulk edit', async () => {
      const { db, collections } = makeAuditMockDb({ affectedDocs: [] });

      await bulkUpdateTestCases(db, TEAM, {
        ids: IDS,
        fields: { softwareVersionTested: 'v9' },
        actor: 'Alice',
      });

      expect(collections.testCases.find).not.toHaveBeenCalled();
      expect(collections.events.insertMany).not.toHaveBeenCalled();
    });

    it('sets by to null when actor is absent', async () => {
      const affectedDocs = [
        {
          _id: { toString: () => IDS[0] },
          testCaseId: 'TC-001',
          softwareVersionTested: 'v1',
        },
      ];
      const { db, collections } = makeAuditMockDb({
        affectedDocs,
        matchedBefore: 1,
      });

      await bulkUpdateTestCases(db, TEAM, {
        ids: [IDS[0]],
        fields: {
          status: 'Fail',
          softwareVersionTested: 'v1',
          notes: 'bug found',
        },
      });

      const [insertedDocs] = collections.events.insertMany.mock.calls[0];
      expect(insertedDocs[0].by).toBeNull();
      expect(insertedDocs[0].action).toBe('fail');
    });

    it('sets notes on each event from fields.notes when resetting to Pending', async () => {
      const affectedDocs = [
        {
          _id: { toString: () => IDS[0] },
          testCaseId: 'TC-003',
          softwareVersionTested: null,
        },
      ];
      const { db, collections } = makeAuditMockDb({
        affectedDocs,
        matchedBefore: 1,
      });

      await bulkUpdateTestCases(db, TEAM, {
        ids: [IDS[0]],
        fields: { status: 'Pending', notes: 'regression re-run needed' },
        actor: 'Bob',
      });

      const [insertedDocs] = collections.events.insertMany.mock.calls[0];
      expect(insertedDocs[0]).toMatchObject({
        action: 'reset',
        notes: 'regression re-run needed',
        by: 'Bob',
      });
    });
  });
});

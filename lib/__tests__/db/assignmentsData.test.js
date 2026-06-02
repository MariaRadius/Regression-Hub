import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import {
  createAssignment,
  deleteAssignment,
  listAssignments,
} from '@/lib/db/assignmentsData';

const TEAM = 'team-1';
const RELEASE_ID = new ObjectId().toString();
const { db, collections, reset } = createMockDb();

beforeEach(() => reset());

describe('listAssignments', () => {
  const makeAggregateMock = (results) => ({
    aggregate: vi.fn(() => ({
      toArray: vi.fn().mockResolvedValue(results),
    })),
  });

  it('returns [] when no assignments exist', async () => {
    collections.assignments = makeAggregateMock([]);

    const result = await listAssignments(db, TEAM, { releaseId: RELEASE_ID });

    expect(result).toEqual([]);
  });

  it('returns mapped assignments for a release', async () => {
    const oid = new ObjectId();
    collections.assignments = makeAggregateMock([
      {
        _id: oid,
        teamId: TEAM,
        releaseId: RELEASE_ID,
        tcId: 'abc001',
        assignedTo: 'Alice',
        assignedBy: 'Bob',
        environment: 'QA',
        createdAt: new Date(),
      },
    ]);

    const result = await listAssignments(db, TEAM, { releaseId: RELEASE_ID });

    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe(oid.toString());
    expect(result[0].tcId).toBe('abc001');
  });

  it('filters by assignedTo when provided', async () => {
    collections.assignments = makeAggregateMock([]);

    await listAssignments(db, TEAM, {
      releaseId: RELEASE_ID,
      assignedTo: 'Alice',
    });

    const [[pipeline]] = collections.assignments.aggregate.mock.calls;
    const matchStage = pipeline.find((s) => s.$match);
    expect(matchStage.$match).toMatchObject({
      teamId: TEAM,
      releaseId: RELEASE_ID,
      assignedTo: 'Alice',
    });

    // The testCases join must match the assignment's tcId (a string) against
    // the test case _id (an ObjectId), never the eliminated caseId field.
    const lookupStage = pipeline.find((s) => s.$lookup);
    expect(lookupStage.$lookup.let).toMatchObject({ cid: '$tcId' });
    const joinJson = JSON.stringify(lookupStage.$lookup.pipeline);
    expect(joinJson).toContain('$toString');
    expect(joinJson).toContain('$_id');
    expect(joinJson).not.toContain('caseId');
  });

  it('throws 400 when teamId is missing', async () => {
    await expect(
      listAssignments(db, '', { releaseId: RELEASE_ID }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it('throws 400 when releaseId is missing', async () => {
    await expect(listAssignments(db, TEAM, {})).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('createAssignment', () => {
  const TC_ID = 'case-abc';

  const mockInsertMany = () =>
    vi.fn(async (docs) => ({
      insertedIds: Object.fromEntries(docs.map((_, i) => [i, new ObjectId()])),
    }));

  beforeEach(() => {
    collections.assignments = {
      insertMany: mockInsertMany(),
    };
    collections.events = {
      insertMany: vi.fn().mockResolvedValue({}),
    };
    collections.testResults = {
      updateMany: vi
        .fn()
        .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    };
  });

  it('inserts one doc per case and emits one ASSIGN event each', async () => {
    await createAssignment(
      db,
      TEAM,
      {
        tcIds: [TC_ID, 'case-def'],
        releaseId: RELEASE_ID,
        assignedTo: 'Alice',
        environment: 'QA',
      },
      { assignedBy: 'Bob' },
    );

    expect(collections.assignments.insertMany).toHaveBeenCalledOnce();
    const [docs] = collections.assignments.insertMany.mock.calls[0];
    expect(docs).toHaveLength(2);
    expect(docs[0].teamId).toBe(TEAM);
    expect(docs[0].tcId).toBe(TC_ID);
    expect(docs[1].tcId).toBe('case-def');
    expect(docs[0].releaseId).toBe(RELEASE_ID);
    expect(docs[0].assignedTo).toBe('Alice');
    expect(docs[0].assignedBy).toBe('Bob');
    expect(docs[0].environment).toBe('QA');

    expect(collections.events.insertMany).toHaveBeenCalledOnce();
    const [events] = collections.events.insertMany.mock.calls[0];
    expect(events).toHaveLength(2);
    expect(events[0].category).toBe(AUDIT_CATEGORY.ASSIGNMENT);
    expect(events[0].action).toBe(AUDIT_ACTION.ASSIGN);
    expect(events[0].tcId).toBe(TC_ID);
    expect(events[0].assignedTo).toBe('Alice');
    expect(events[0].by).toBe('Bob');
    // each event carries its own case's assignmentId
    expect(events[0].assignmentId).not.toBe(events[1].assignmentId);

    // Mirror: testResults.updateMany must be scoped to the concrete environment
    expect(collections.testResults.updateMany).toHaveBeenCalledOnce();
    const [filter, updateOp] = collections.testResults.updateMany.mock.calls[0];
    expect(filter.teamId).toBe(TEAM);
    expect(filter.releaseId).toBe(RELEASE_ID);
    expect(filter.tcId).toEqual({ $in: [TC_ID, 'case-def'] });
    expect(filter.environment).toBe('QA');
    expect(updateOp.$set.assignedTo).toBe('Alice');
  });

  it('stores the supplied environment verbatim', async () => {
    await createAssignment(
      db,
      TEAM,
      {
        tcIds: [TC_ID],
        releaseId: RELEASE_ID,
        assignedTo: 'Alice',
        environment: 'Staging',
      },
      { assignedBy: 'Bob' },
    );

    const [docs] = collections.assignments.insertMany.mock.calls[0];
    expect(docs[0].environment).toBe('Staging');
  });

  it('mirrors assignedTo only onto that environment testResults rows (env-scoped mirror)', async () => {
    await createAssignment(
      db,
      TEAM,
      {
        tcIds: [TC_ID],
        releaseId: RELEASE_ID,
        assignedTo: 'Alice',
        environment: 'QA',
      },
      { assignedBy: 'Bob' },
    );

    const [filter] = collections.testResults.updateMany.mock.calls[0];
    expect(filter.environment).toBe('QA');
    expect(filter.tcId).toEqual({ $in: [TC_ID] });
  });

  it('throws 400 when environment is missing', async () => {
    await expect(
      createAssignment(
        db,
        TEAM,
        { tcIds: [TC_ID], releaseId: RELEASE_ID, assignedTo: 'Alice' },
        { assignedBy: 'Bob' },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: 'environment is required',
    });
  });

  it('throws 400 when environment is empty string', async () => {
    await expect(
      createAssignment(
        db,
        TEAM,
        {
          tcIds: [TC_ID],
          releaseId: RELEASE_ID,
          assignedTo: 'Alice',
          environment: '',
        },
        { assignedBy: 'Bob' },
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: 'environment is required',
    });
  });

  it('returns { ok: true, id, testCaseCount }', async () => {
    const result = await createAssignment(
      db,
      TEAM,
      {
        tcIds: [TC_ID, 'case-def'],
        releaseId: RELEASE_ID,
        assignedTo: 'Alice',
        environment: 'QA',
      },
      { assignedBy: 'Bob' },
    );

    expect(result.ok).toBe(true);
    expect(typeof result.id).toBe('string');
    expect(result.testCaseCount).toBe(2);
  });

  it('throws 400 when tcIds is missing or empty', async () => {
    await expect(
      createAssignment(
        db,
        TEAM,
        { releaseId: RELEASE_ID, assignedTo: 'Alice', environment: 'QA' },
        { assignedBy: 'Bob' },
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createAssignment(
        db,
        TEAM,
        {
          tcIds: [],
          releaseId: RELEASE_ID,
          assignedTo: 'Alice',
          environment: 'QA',
        },
        { assignedBy: 'Bob' },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when releaseId is missing', async () => {
    await expect(
      createAssignment(
        db,
        TEAM,
        { tcIds: [TC_ID], assignedTo: 'Alice', environment: 'QA' },
        { assignedBy: 'Bob' },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when assignedTo is missing', async () => {
    await expect(
      createAssignment(
        db,
        TEAM,
        { tcIds: [TC_ID], releaseId: RELEASE_ID, environment: 'QA' },
        { assignedBy: 'Bob' },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('deleteAssignment', () => {
  const ASSIGNMENT_OID = new ObjectId();
  const ASSIGNMENT_ID = ASSIGNMENT_OID.toString();
  const TC_ID = 'case-xyz';

  beforeEach(() => {
    collections.assignments = {
      findOne: vi.fn().mockResolvedValue({
        _id: ASSIGNMENT_OID,
        teamId: TEAM,
        tcId: TC_ID,
        releaseId: RELEASE_ID,
        assignedTo: 'Alice',
        environment: 'QA',
      }),
      deleteOne: vi.fn().mockResolvedValue({}),
    };
    collections.events = {
      insertMany: vi.fn().mockResolvedValue({}),
    };
    collections.testResults = {
      updateMany: vi
        .fn()
        .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    };
  });

  it('deletes the assignment and emits one UNASSIGN event', async () => {
    await deleteAssignment(db, TEAM, ASSIGNMENT_ID, { actor: 'Bob' });

    expect(collections.assignments.deleteOne).toHaveBeenCalledOnce();

    expect(collections.events.insertMany).toHaveBeenCalledOnce();
    const [events] = collections.events.insertMany.mock.calls[0];
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe(AUDIT_CATEGORY.ASSIGNMENT);
    expect(events[0].action).toBe(AUDIT_ACTION.UNASSIGN);
    expect(events[0].tcId).toBe(TC_ID);
    expect(events[0].assignedTo).toBe('Alice');
    expect(events[0].by).toBe('Bob');
    expect(events[0].assignmentId).toBe(ASSIGNMENT_ID);
    expect(events[0].at).toBeInstanceOf(Date);
  });

  it('clears assignedTo to null on the assignment environment testResults rows', async () => {
    await deleteAssignment(db, TEAM, ASSIGNMENT_ID, { actor: 'Bob' });

    expect(collections.testResults.updateMany).toHaveBeenCalledOnce();
    const [filter, updateOp] = collections.testResults.updateMany.mock.calls[0];
    expect(filter.teamId).toBe(TEAM);
    expect(filter.releaseId).toBe(RELEASE_ID);
    expect(filter.tcId).toBe(TC_ID);
    expect(filter.environment).toBe('QA');
    expect(updateOp.$set.assignedTo).toBeNull();
  });

  it('returns { ok: true }', async () => {
    const result = await deleteAssignment(db, TEAM, ASSIGNMENT_ID, {
      actor: 'Bob',
    });
    expect(result).toEqual({ ok: true });
  });

  it('sets by=null when actor is not provided', async () => {
    await deleteAssignment(db, TEAM, ASSIGNMENT_ID, {});

    const [events] = collections.events.insertMany.mock.calls[0];
    expect(events[0].by).toBeNull();
  });

  it('throws 404 when assignment is not found', async () => {
    collections.assignments.findOne = vi.fn().mockResolvedValue(null);

    await expect(
      deleteAssignment(db, TEAM, ASSIGNMENT_ID, { actor: 'Bob' }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it('throws 400 when teamId is missing', async () => {
    await expect(
      deleteAssignment(db, '', ASSIGNMENT_ID, {}),
    ).rejects.toMatchObject({
      status: 400,
    });
  });
});

import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import {
  AUDIT_ACTION,
  AUDIT_CATEGORY,
  ENVIRONMENT_SENTINEL,
} from '@/lib/constants';
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
        caseId: 'case-1',
        assignedTo: 'Alice',
        assignedBy: 'Bob',
        environment: ENVIRONMENT_SENTINEL,
        createdAt: new Date(),
      },
    ]);

    const result = await listAssignments(db, TEAM, { releaseId: RELEASE_ID });

    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe(oid.toString());
    expect(result[0].caseId).toBe('case-1');
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
  const CASE_ID = 'case-abc';

  beforeEach(() => {
    collections.assignments = {
      insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
    };
    collections.events = {
      insertMany: vi.fn().mockResolvedValue({}),
    };
  });

  it('inserts a doc and emits one ASSIGN event', async () => {
    await createAssignment(
      db,
      TEAM,
      { caseId: CASE_ID, releaseId: RELEASE_ID, assignedTo: 'Alice' },
      { assignedBy: 'Bob' },
    );

    expect(collections.assignments.insertOne).toHaveBeenCalledOnce();
    const [doc] = collections.assignments.insertOne.mock.calls[0];
    expect(doc.teamId).toBe(TEAM);
    expect(doc.caseId).toBe(CASE_ID);
    expect(doc.releaseId).toBe(RELEASE_ID);
    expect(doc.assignedTo).toBe('Alice');
    expect(doc.assignedBy).toBe('Bob');

    expect(collections.events.insertMany).toHaveBeenCalledOnce();
    const [events] = collections.events.insertMany.mock.calls[0];
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe(AUDIT_CATEGORY.ASSIGNMENT);
    expect(events[0].action).toBe(AUDIT_ACTION.ASSIGN);
    expect(events[0].caseId).toBe(CASE_ID);
    expect(events[0].assignedTo).toBe('Alice');
    expect(events[0].by).toBe('Bob');
  });

  it('defaults environment to ENVIRONMENT_SENTINEL when not supplied', async () => {
    await createAssignment(
      db,
      TEAM,
      { caseId: CASE_ID, releaseId: RELEASE_ID, assignedTo: 'Alice' },
      { assignedBy: 'Bob' },
    );

    const [doc] = collections.assignments.insertOne.mock.calls[0];
    expect(doc.environment).toBe(ENVIRONMENT_SENTINEL);
  });

  it('stores a specific environment when supplied', async () => {
    await createAssignment(
      db,
      TEAM,
      {
        caseId: CASE_ID,
        releaseId: RELEASE_ID,
        assignedTo: 'Alice',
        environment: 'QA',
      },
      { assignedBy: 'Bob' },
    );

    const [doc] = collections.assignments.insertOne.mock.calls[0];
    expect(doc.environment).toBe('QA');
  });

  it('returns { ok: true, id: string }', async () => {
    const insertedOid = new ObjectId();
    collections.assignments.insertOne = vi
      .fn()
      .mockResolvedValue({ insertedId: insertedOid });

    const result = await createAssignment(
      db,
      TEAM,
      { caseId: CASE_ID, releaseId: RELEASE_ID, assignedTo: 'Alice' },
      { assignedBy: 'Bob' },
    );

    expect(result).toEqual({ ok: true, id: insertedOid.toString() });
  });

  it('throws 400 when caseId is missing', async () => {
    await expect(
      createAssignment(
        db,
        TEAM,
        { releaseId: RELEASE_ID, assignedTo: 'Alice' },
        { assignedBy: 'Bob' },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when releaseId is missing', async () => {
    await expect(
      createAssignment(
        db,
        TEAM,
        { caseId: CASE_ID, assignedTo: 'Alice' },
        { assignedBy: 'Bob' },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when assignedTo is missing', async () => {
    await expect(
      createAssignment(
        db,
        TEAM,
        { caseId: CASE_ID, releaseId: RELEASE_ID },
        { assignedBy: 'Bob' },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('deleteAssignment', () => {
  const ASSIGNMENT_OID = new ObjectId();
  const ASSIGNMENT_ID = ASSIGNMENT_OID.toString();
  const CASE_ID = 'case-xyz';

  beforeEach(() => {
    collections.assignments = {
      findOne: vi.fn().mockResolvedValue({
        _id: ASSIGNMENT_OID,
        teamId: TEAM,
        caseId: CASE_ID,
        releaseId: RELEASE_ID,
        assignedTo: 'Alice',
        environment: ENVIRONMENT_SENTINEL,
      }),
      deleteOne: vi.fn().mockResolvedValue({}),
    };
    collections.events = {
      insertMany: vi.fn().mockResolvedValue({}),
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
    expect(events[0].caseId).toBe(CASE_ID);
    expect(events[0].assignedTo).toBe('Alice');
    expect(events[0].by).toBe('Bob');
    expect(events[0].assignmentId).toBe(ASSIGNMENT_ID);
    expect(events[0].at).toBeInstanceOf(Date);
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

import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import {
  createAssignment,
  deleteAssignment,
  getAssignmentsPageData,
  listAssignments,
} from '@/lib/db/assignmentsData';

const TEAM = 'team-1';
const { db, collections, reset } = createMockDb();

beforeEach(() => reset());

describe('getAssignmentsPageData', () => {
  it('returns empty structures when no modules', async () => {
    collections.assignments = {
      find: vi.fn(() => ({
        sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      })),
    };
    collections.modules = {
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    };
    collections.applications = {
      find: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    };
    collections.users = {
      find: vi.fn(() => ({
        sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
      })),
    };

    const data = await getAssignmentsPageData(db, TEAM, {
      userName: 'Bob',
      view: 'mine',
    });
    expect(data.assignments).toEqual([]);
    expect(data.modules).toEqual([]);
    expect(data.qaUsers).toEqual([]);
  });
});

describe('listAssignments', () => {
  const makeAssignment = (overrides = {}) => ({
    _id: new ObjectId(),
    teamId: TEAM,
    title: 'Test Assignment',
    testCaseIds: [],
    assignedTo: 'Alice',
    assignedBy: 'Bob',
    ...overrides,
  });

  const makeFindMock = (results) => ({
    find: vi.fn(() => ({
      sort: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(results) })),
    })),
  });

  it('returns [] when no assignments exist', async () => {
    collections.assignments = makeFindMock([]);

    const result = await listAssignments(db, TEAM, {
      view: 'all',
      userName: 'Alice',
    });

    expect(result).toEqual([]);
    expect(collections.testCases).toBeUndefined();
  });

  it('returns enriched assignments with correct completedCount', async () => {
    const id1 = new ObjectId().toString();
    const id2 = new ObjectId().toString();
    const id3 = new ObjectId().toString();
    const assignment = makeAssignment({ testCaseIds: [id1, id2, id3] });

    collections.assignments = makeFindMock([assignment]);
    collections.testCases = {
      aggregate: vi.fn(() => ({
        toArray: vi
          .fn()
          .mockResolvedValue([
            { _id: new ObjectId(id1) },
            { _id: new ObjectId(id3) },
          ]),
      })),
    };

    const result = await listAssignments(db, TEAM, {
      view: 'all',
      userName: 'Alice',
    });

    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe(assignment._id.toString());
    expect(result[0].completedCount).toBe(2);
  });

  it('filters by view: mine using assignedTo', async () => {
    const assignment = makeAssignment({ assignedTo: 'Alice', testCaseIds: [] });
    collections.assignments = makeFindMock([assignment]);

    await listAssignments(db, TEAM, { view: 'mine', userName: 'Alice' });

    const findCall = collections.assignments.find.mock.calls[0][0];
    expect(findCall).toMatchObject({ teamId: TEAM, assignedTo: 'Alice' });
    expect(findCall).not.toHaveProperty('assignedBy');
  });

  it('filters by view: sent using assignedBy', async () => {
    const assignment = makeAssignment({ assignedBy: 'Bob', testCaseIds: [] });
    collections.assignments = makeFindMock([assignment]);

    await listAssignments(db, TEAM, { view: 'sent', userName: 'Bob' });

    const findCall = collections.assignments.find.mock.calls[0][0];
    expect(findCall).toMatchObject({ teamId: TEAM, assignedBy: 'Bob' });
    expect(findCall).not.toHaveProperty('assignedTo');
  });

  it('handles invalid ObjectIds in testCaseIds gracefully without crashing', async () => {
    const validId = new ObjectId().toString();
    const assignment = makeAssignment({
      testCaseIds: ['not-an-object-id', validId, '!!!'],
    });

    collections.assignments = makeFindMock([assignment]);
    collections.testCases = {
      aggregate: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([{ _id: new ObjectId(validId) }]),
      })),
    };

    const result = await listAssignments(db, TEAM, {
      view: 'all',
      userName: 'Alice',
    });

    expect(result).toHaveLength(1);
    // Only the valid id matched as completed; invalid ids are skipped
    expect(result[0].completedCount).toBe(1);
  });
});

describe('createAssignment — audit events', () => {
  const TC_ID_1 = new ObjectId().toString();
  const TC_ID_2 = new ObjectId().toString();

  const makeInsertedAssignment = () => ({
    insertedId: new ObjectId(),
  });

  beforeEach(() => {
    // stub testCases.find for module-type resolution
    collections.testCases = {
      find: vi.fn(() => ({
        toArray: vi
          .fn()
          .mockResolvedValue([
            { _id: new ObjectId(TC_ID_1) },
            { _id: new ObjectId(TC_ID_2) },
          ]),
      })),
      updateMany: vi.fn().mockResolvedValue({}),
    };
    collections.assignments = {
      insertOne: vi.fn().mockResolvedValue(makeInsertedAssignment()),
    };
    collections.events = {
      insertMany: vi.fn().mockResolvedValue({}),
    };
  });

  it('fans out one assign event per testCaseId after insert', async () => {
    await createAssignment(
      db,
      TEAM,
      {
        title: 'Test Assignment',
        type: 'selection',
        testCaseIds: [TC_ID_1, TC_ID_2],
        assignedTo: 'Alice',
        priority: 'medium',
        dueDate: null,
        notes: '',
      },
      { assignedBy: 'Bob' },
    );

    expect(collections.events.insertMany).toHaveBeenCalledOnce();
    const [docs] = collections.events.insertMany.mock.calls[0];

    expect(docs).toHaveLength(2);
    for (const doc of docs) {
      expect(doc.teamId).toBe(TEAM);
      expect(doc.category).toBe(AUDIT_CATEGORY.ASSIGNMENT);
      expect(doc.action).toBe(AUDIT_ACTION.ASSIGN);
      expect(doc.assignedTo).toBe('Alice');
      expect(doc.by).toBe('Bob');
      expect(doc.at).toBeInstanceOf(Date);
    }
    const docTestCaseIds = docs.map((d) => d.testCaseId);
    expect(docTestCaseIds).toContain(TC_ID_1);
    expect(docTestCaseIds).toContain(TC_ID_2);
  });

  it('includes the inserted assignmentId in every event', async () => {
    const insertedOid = new ObjectId();
    collections.assignments.insertOne = vi
      .fn()
      .mockResolvedValue({ insertedId: insertedOid });

    await createAssignment(
      db,
      TEAM,
      {
        type: 'selection',
        testCaseIds: [TC_ID_1],
        assignedTo: 'Alice',
      },
      { assignedBy: 'Bob' },
    );

    const [docs] = collections.events.insertMany.mock.calls[0];
    expect(docs[0].assignmentId).toBe(insertedOid.toString());
  });
});

describe('deleteAssignment — audit events', () => {
  const TC_ID_1 = new ObjectId().toString();
  const TC_ID_2 = new ObjectId().toString();
  const ASSIGNMENT_OID = new ObjectId();
  const ASSIGNMENT_ID = ASSIGNMENT_OID.toString();

  beforeEach(() => {
    collections.assignments = {
      findOne: vi.fn().mockResolvedValue({
        _id: ASSIGNMENT_OID,
        teamId: TEAM,
        testCaseIds: [TC_ID_1, TC_ID_2],
        assignedTo: 'Alice',
      }),
      deleteOne: vi.fn().mockResolvedValue({}),
    };
    collections.testCases = {
      updateMany: vi.fn().mockResolvedValue({}),
    };
    collections.events = {
      insertMany: vi.fn().mockResolvedValue({}),
    };
  });

  it('fans out one unassign event per testCaseId after delete', async () => {
    await deleteAssignment(db, TEAM, ASSIGNMENT_ID, { actor: 'Bob' });

    expect(collections.events.insertMany).toHaveBeenCalledOnce();
    const [docs] = collections.events.insertMany.mock.calls[0];

    expect(docs).toHaveLength(2);
    for (const doc of docs) {
      expect(doc.teamId).toBe(TEAM);
      expect(doc.category).toBe(AUDIT_CATEGORY.ASSIGNMENT);
      expect(doc.action).toBe(AUDIT_ACTION.UNASSIGN);
      expect(doc.assignedTo).toBe('Alice');
      expect(doc.by).toBe('Bob');
      expect(doc.assignmentId).toBe(ASSIGNMENT_ID);
      expect(doc.at).toBeInstanceOf(Date);
    }
    const docTestCaseIds = docs.map((d) => d.testCaseId);
    expect(docTestCaseIds).toContain(TC_ID_1);
    expect(docTestCaseIds).toContain(TC_ID_2);
  });

  it('sets by=null when actor is not provided', async () => {
    await deleteAssignment(db, TEAM, ASSIGNMENT_ID, {});

    const [docs] = collections.events.insertMany.mock.calls[0];
    expect(docs[0].by).toBeNull();
  });
});

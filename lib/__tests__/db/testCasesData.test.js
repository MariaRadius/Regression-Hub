import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { expectApiError } from '@/lib/__tests__/helpers/expectApiError';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import {
  listTestCases,
  resetTeamData,
  updateTestCase,
} from '@/lib/db/testCasesData';

const TEAM = 'team-1';
const VALID_ID = new ObjectId().toString();

/**
 * Build a mock db where `testCases.findOne` returns the given document and
 * `testCases.updateOne` resolves successfully.  Also stubs `events`
 * so that status-transition tests can call appendEvent without error.
 */
function makeMockDb(existingDoc = {}) {
  const testCasesCol = {
    findOne: vi.fn().mockResolvedValue(existingDoc),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
  const eventsCol = {
    insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
  };
  return {
    collection: vi.fn((name) => {
      if (name === 'events') return eventsCol;
      return testCasesCol;
    }),
  };
}

const DEFAULT_APP_ID = new ObjectId();
const DEFAULT_MOD_ID = new ObjectId();

const DEFAULT_TEST_CASE_DOCS = [
  {
    _id: new ObjectId(),
    teamId: TEAM,
    applicationId: DEFAULT_APP_ID.toString(),
    moduleId: DEFAULT_MOD_ID.toString(),
    status: 'Pass',
  },
];

const DEFAULT_APP_DOCS = [{ _id: DEFAULT_APP_ID, name: 'App A', teamId: TEAM }];

const DEFAULT_MOD_DOCS = [
  {
    _id: DEFAULT_MOD_ID,
    name: 'Mod B',
    applicationId: DEFAULT_APP_ID,
    teamId: TEAM,
  },
];

/**
 * Build a mock db suitable for listTestCases: supports find/countDocuments on
 * testCases, and find on applications/modules via fetchAppModMaps.
 *
 * Pass explicit arrays (including empty []) to override the defaults.
 */
function makeListMockDb({
  testCaseDocs = DEFAULT_TEST_CASE_DOCS,
  appDocs = DEFAULT_APP_DOCS,
  modDocs = DEFAULT_MOD_DOCS,
} = {}) {
  return {
    collection: vi.fn().mockImplementation((name) => {
      if (name === 'testCases') {
        return {
          find: vi.fn().mockReturnValue({
            sort: vi.fn().mockReturnThis(),
            skip: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            toArray: vi.fn().mockResolvedValue(testCaseDocs),
          }),
          countDocuments: vi.fn().mockResolvedValue(testCaseDocs.length),
        };
      }
      if (name === 'applications') {
        return {
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(appDocs),
          }),
        };
      }
      if (name === 'modules') {
        return {
          find: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(modDocs),
          }),
        };
      }
      return {};
    }),
  };
}

describe('listTestCases', () => {
  it('enriches rows with applicationName and moduleName when includeMeta is absent', async () => {
    const db = makeListMockDb();
    const result = await listTestCases(db, TEAM);
    expect(result.data[0].applicationName).toBe('App A');
    expect(result.data[0].moduleName).toBe('Mod B');
  });

  it('enriches rows with applicationName and moduleName when includeMeta is false', async () => {
    const db = makeListMockDb();
    const result = await listTestCases(db, TEAM, { includeMeta: false });
    expect(result.data[0].applicationName).toBe('App A');
    expect(result.data[0].moduleName).toBe('Mod B');
  });

  it('omits applications and modules keys when includeMeta is absent', async () => {
    const db = makeListMockDb();
    const result = await listTestCases(db, TEAM);
    expect(result).not.toHaveProperty('applications');
    expect(result).not.toHaveProperty('modules');
  });

  it('omits applications and modules keys when includeMeta is false', async () => {
    const db = makeListMockDb();
    const result = await listTestCases(db, TEAM, { includeMeta: false });
    expect(result).not.toHaveProperty('applications');
    expect(result).not.toHaveProperty('modules');
  });

  it('includes applications and modules arrays when includeMeta is true', async () => {
    const db = makeListMockDb();
    const result = await listTestCases(db, TEAM, { includeMeta: true });
    expect(result).toHaveProperty('applications');
    expect(result).toHaveProperty('modules');
    expect(Array.isArray(result.applications)).toBe(true);
    expect(Array.isArray(result.modules)).toBe(true);
    expect(result.applications[0]).toMatchObject({ name: 'App A' });
    expect(result.modules[0]).toMatchObject({ name: 'Mod B' });
  });

  it('still enriches rows when includeMeta is true', async () => {
    const db = makeListMockDb();
    const result = await listTestCases(db, TEAM, { includeMeta: true });
    expect(result.data[0].applicationName).toBe('App A');
    expect(result.data[0].moduleName).toBe('Mod B');
  });

  it('throws 400 when teamId is falsy', async () => {
    const db = makeListMockDb();
    await expectApiError(listTestCases(db, ''), {
      status: 400,
      message: 'teamId required',
    });
  });

  it('returns empty data array and empty applications/modules arrays when page has 0 rows and includeMeta is true', async () => {
    const db = makeListMockDb({
      testCaseDocs: [],
      appDocs: DEFAULT_APP_DOCS,
      modDocs: DEFAULT_MOD_DOCS,
    });
    const result = await listTestCases(db, TEAM, { includeMeta: true });
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(Array.isArray(result.applications)).toBe(true);
    expect(Array.isArray(result.modules)).toBe(true);
    expect(result.applications).toHaveLength(DEFAULT_APP_DOCS.length);
    expect(result.modules).toHaveLength(DEFAULT_MOD_DOCS.length);
  });

  it('returns empty applications and modules arrays (not missing) when no apps or modules exist and includeMeta is true', async () => {
    const db = makeListMockDb({ testCaseDocs: [], appDocs: [], modDocs: [] });
    const result = await listTestCases(db, TEAM, { includeMeta: true });
    expect(result).toHaveProperty('applications');
    expect(result).toHaveProperty('modules');
    expect(result.applications).toEqual([]);
    expect(result.modules).toEqual([]);
  });

  it('falls back to "Unknown" for applicationName and moduleName when ids have no matching map entry (orphaned reference)', async () => {
    const orphanAppId = new ObjectId().toString();
    const orphanModId = new ObjectId().toString();
    const orphanDoc = {
      _id: new ObjectId(),
      teamId: TEAM,
      applicationId: orphanAppId,
      moduleId: orphanModId,
      status: 'Pass',
    };
    // No apps or modules in DB — both map entries will be missing
    const db = makeListMockDb({
      testCaseDocs: [orphanDoc],
      appDocs: [],
      modDocs: [],
    });
    const result = await listTestCases(db, TEAM);
    expect(result.data[0].applicationName).toBe('Unknown');
    expect(result.data[0].moduleName).toBe('Unknown');
  });
});

describe('updateTestCase', () => {
  describe('R9 — blank field guards', () => {
    it('throws 400 when expectedResult is sent as empty string', async () => {
      const db = makeMockDb({
        expectedResult: 'existing',
        softwareVersionTested: 'v1',
        notes: 'some note',
      });
      await expectApiError(
        updateTestCase(db, TEAM, VALID_ID, { expectedResult: '' }),
        { status: 400, message: 'expectedResult cannot be blank' },
      );
    });
  });

  describe('R10 — expectedResult required for Pass/Fail', () => {
    it('succeeds when payload supplies both status=Pass and expectedResult in same PATCH', async () => {
      // DB doc has empty expectedResult — but payload provides it along with status
      const db = makeMockDb({
        expectedResult: '',
        softwareVersionTested: 'v1.0',
        notes: '',
      });
      await expect(
        updateTestCase(db, TEAM, VALID_ID, {
          status: 'Pass',
          expectedResult: 'result text',
        }),
      ).resolves.toEqual({ ok: true });
    });

    it('throws 400 when status=Pass is sent but DB has empty expectedResult and payload has none', async () => {
      const db = makeMockDb({
        expectedResult: '',
        softwareVersionTested: 'v1.0',
        notes: '',
      });
      await expectApiError(
        updateTestCase(db, TEAM, VALID_ID, {
          status: 'Pass',
        }),
        {
          status: 400,
          message:
            'Cannot mark Pass/Fail — expectedResult is required on this case',
        },
      );
    });
  });

  describe('R11 — notes required for Fail', () => {
    it('throws 400 when status=Fail and notes absent in payload and DB', async () => {
      const db = makeMockDb({
        expectedResult: 'expected text',
        softwareVersionTested: 'v1.0',
        notes: '',
      });
      await expectApiError(
        updateTestCase(db, TEAM, VALID_ID, {
          status: 'Fail',
        }),
        {
          status: 400,
          message: 'Notes are required when status is Fail',
        },
      );
    });

    it('succeeds on partial PATCH { status: Fail } when DB already has notes', async () => {
      const db = makeMockDb({
        expectedResult: 'expected text',
        softwareVersionTested: 'v1.0',
        notes: 'existing note about the failure',
      });
      await expect(
        updateTestCase(db, TEAM, VALID_ID, {
          status: 'Fail',
        }),
      ).resolves.toEqual({ ok: true });
    });

    it('succeeds when notes are provided in the Fail payload', async () => {
      const db = makeMockDb({
        expectedResult: 'expected text',
        softwareVersionTested: 'v1.0',
        notes: '',
      });
      await expect(
        updateTestCase(db, TEAM, VALID_ID, {
          status: 'Fail',
          notes: 'fresh failure note',
        }),
      ).resolves.toEqual({ ok: true });
    });
  });

  describe('R12 — softwareVersionTested validated against stored value only', () => {
    it('throws 400 when DB has no softwareVersionTested and status=Pass (incoming value is ignored)', async () => {
      const db = makeMockDb({
        expectedResult: 'expected text',
        softwareVersionTested: '',
        notes: '',
      });
      await expectApiError(
        updateTestCase(db, TEAM, VALID_ID, {
          status: 'Pass',
          expectedResult: 'expected text',
          softwareVersionTested: 'v1.0', // ignored — not in PATCH_ALLOWED_FIELDS
        }),
        {
          status: 400,
          message:
            'softwareVersionTested is required when marking Pass or Fail',
        },
      );
    });

    it('succeeds when DB already has softwareVersionTested (incoming value is irrelevant)', async () => {
      const db = makeMockDb({
        expectedResult: 'expected text',
        softwareVersionTested: 'v2.0',
        notes: '',
      });
      await expect(
        updateTestCase(db, TEAM, VALID_ID, {
          status: 'Pass',
          expectedResult: 'expected text',
        }),
      ).resolves.toEqual({ ok: true });
    });
  });

  describe('R14 — notes required when resetting to Pending', () => {
    it('throws 400 when status=Pending and no notes in payload (DB has existing notes)', async () => {
      const db = makeMockDb({
        expectedResult: 'expected text',
        softwareVersionTested: 'v1.0',
        status: 'Pass',
        notes: 'prior note',
      });
      await expectApiError(
        updateTestCase(db, TEAM, VALID_ID, {
          status: 'Pending',
        }),
        {
          status: 400,
          message: 'A reason is required when resetting to Pending',
        },
      );
    });

    it('throws 400 when status=Pending and notes in payload is empty string', async () => {
      const db = makeMockDb({
        expectedResult: 'expected text',
        softwareVersionTested: 'v1.0',
        status: 'Pass',
        notes: 'prior note',
      });
      await expectApiError(
        updateTestCase(db, TEAM, VALID_ID, {
          status: 'Pending',
          notes: '',
        }),
        {
          status: 400,
          message: 'A reason is required when resetting to Pending',
        },
      );
    });

    it('succeeds when status=Pending and incoming notes has content', async () => {
      const db = makeMockDb({
        expectedResult: 'expected text',
        softwareVersionTested: 'v1.0',
        status: 'Pass',
        notes: 'prior note',
      });
      await expect(
        updateTestCase(db, TEAM, VALID_ID, {
          status: 'Pending',
          notes: 'reset reason',
        }),
      ).resolves.toEqual({ ok: true });
    });

    it('does NOT fall back to existing notes for Pending — requires fresh reason in payload', async () => {
      // DB has notes, but payload does not include notes key at all
      const db = makeMockDb({
        expectedResult: 'expected text',
        softwareVersionTested: 'v1.0',
        status: 'Pass',
        notes: 'old reason already on record',
      });
      await expectApiError(
        updateTestCase(db, TEAM, VALID_ID, {
          status: 'Pending',
          // notes intentionally absent
        }),
        {
          status: 400,
          message: 'A reason is required when resetting to Pending',
        },
      );
    });
  });
});

describe('updateTestCase — result event auditing', () => {
  /**
   * Build a mock db that supports both testCases (findOne + updateOne) and
   * events (insertOne), using createMockDb so we can assert on the stubs.
   */
  function makeAuditMockDb(existingDoc = {}) {
    const { db, collections } = createMockDb();
    collections.testCases = {
      findOne: vi.fn().mockResolvedValue(existingDoc),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    collections.events = {
      insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
    };
    return { db, collections };
  }

  const EXISTING = {
    _id: new ObjectId(VALID_ID),
    teamId: TEAM,
    testCaseId: 'TC-001',
    status: 'Pending',
    expectedResult: 'should work',
    softwareVersionTested: 'v3.0',
    notes: 'prior note',
  };

  it('appends a result event with action=pass on status=Pass transition', async () => {
    const { db, collections } = makeAuditMockDb(EXISTING);
    await updateTestCase(
      db,
      TEAM,
      VALID_ID,
      { status: 'Pass' },
      { actor: 'Alice' },
    );
    expect(collections.events.insertOne).toHaveBeenCalledOnce();
    const [doc] = collections.events.insertOne.mock.calls[0];
    expect(doc).toMatchObject({
      teamId: TEAM,
      category: AUDIT_CATEGORY.RESULT,
      action: AUDIT_ACTION.PASS,
      testCaseId: VALID_ID,
      externalId: 'TC-001',
      status: 'Pass',
      softwareVersionTested: 'v3.0',
      by: 'Alice',
    });
  });

  it('appends a result event with action=fail on status=Fail transition', async () => {
    const existingFail = {
      ...EXISTING,
      notes: 'some bug',
    };
    const { db, collections } = makeAuditMockDb(existingFail);
    await updateTestCase(
      db,
      TEAM,
      VALID_ID,
      { status: 'Fail' },
      { actor: 'Bob' },
    );
    expect(collections.events.insertOne).toHaveBeenCalledOnce();
    const [doc] = collections.events.insertOne.mock.calls[0];
    expect(doc.action).toBe(AUDIT_ACTION.FAIL);
    expect(doc.status).toBe('Fail');
    expect(doc.by).toBe('Bob');
  });

  it('appends a result event with action=reset on status=Pending transition', async () => {
    const { db, collections } = makeAuditMockDb({
      ...EXISTING,
      status: 'Pass',
    });
    await updateTestCase(
      db,
      TEAM,
      VALID_ID,
      { status: 'Pending', notes: 'reset reason' },
      { actor: 'Carol' },
    );
    expect(collections.events.insertOne).toHaveBeenCalledOnce();
    const [doc] = collections.events.insertOne.mock.calls[0];
    expect(doc.action).toBe(AUDIT_ACTION.RESET);
    expect(doc.status).toBe('Pending');
  });

  it('sets by=null when actor is not provided', async () => {
    const { db, collections } = makeAuditMockDb(EXISTING);
    await updateTestCase(db, TEAM, VALID_ID, { status: 'Pass' });
    const [doc] = collections.events.insertOne.mock.calls[0];
    expect(doc.by).toBeNull();
  });

  it('uses body.notes as the notes value in the event', async () => {
    const { db, collections } = makeAuditMockDb(EXISTING);
    await updateTestCase(
      db,
      TEAM,
      VALID_ID,
      { status: 'Pass', notes: 'inline note' },
      { actor: 'Dave' },
    );
    const [doc] = collections.events.insertOne.mock.calls[0];
    expect(doc.notes).toBe('inline note');
  });

  it('falls back to existing.notes when body.notes is absent', async () => {
    const { db, collections } = makeAuditMockDb(EXISTING);
    await updateTestCase(
      db,
      TEAM,
      VALID_ID,
      { status: 'Pass' },
      { actor: 'Eve' },
    );
    const [doc] = collections.events.insertOne.mock.calls[0];
    expect(doc.notes).toBe('prior note');
  });

  it('sets notes=null when neither body.notes nor existing.notes is present', async () => {
    const existingNoNotes = { ...EXISTING, notes: undefined };
    const { db, collections } = makeAuditMockDb(existingNoNotes);
    await updateTestCase(
      db,
      TEAM,
      VALID_ID,
      { status: 'Pass' },
      { actor: 'Eve' },
    );
    const [doc] = collections.events.insertOne.mock.calls[0];
    expect(doc.notes).toBeNull();
  });

  it('appends nothing (no events.insertOne call) on a non-status field edit', async () => {
    const { db, collections } = makeAuditMockDb(EXISTING);
    await updateTestCase(
      db,
      TEAM,
      VALID_ID,
      { notes: 'new note text' },
      { actor: 'Frank' },
    );
    expect(collections.events.insertOne).not.toHaveBeenCalled();
  });

  it('sets externalId=null when existing.testCaseId is absent', async () => {
    const existingNoExternal = { ...EXISTING, testCaseId: undefined };
    const { db, collections } = makeAuditMockDb(existingNoExternal);
    await updateTestCase(
      db,
      TEAM,
      VALID_ID,
      { status: 'Pass' },
      { actor: 'Grace' },
    );
    const [doc] = collections.events.insertOne.mock.calls[0];
    expect(doc.externalId).toBeNull();
  });
});

describe('resetTeamData', () => {
  it('deletes events for the team and returns their count', async () => {
    const { db, collections } = createMockDb();
    const makeDeleteMany = (count) =>
      vi.fn().mockResolvedValue({ deletedCount: count });

    collections.testCases = { deleteMany: makeDeleteMany(5) };
    collections.testRuns = { deleteMany: makeDeleteMany(3) };
    collections.modules = { deleteMany: makeDeleteMany(2) };
    collections.applications = { deleteMany: makeDeleteMany(1) };
    collections.assignments = { deleteMany: makeDeleteMany(4) };
    collections.events = { deleteMany: makeDeleteMany(7) };

    const result = await resetTeamData(db, TEAM);

    expect(collections.events.deleteMany).toHaveBeenCalledWith({
      teamId: TEAM,
    });
    expect(result.events).toBe(7);
  });

  it('returns counts for all collections including events', async () => {
    const { db, collections } = createMockDb();
    const makeDeleteMany = (count) =>
      vi.fn().mockResolvedValue({ deletedCount: count });

    collections.testCases = { deleteMany: makeDeleteMany(1) };
    collections.testRuns = { deleteMany: makeDeleteMany(1) };
    collections.modules = { deleteMany: makeDeleteMany(1) };
    collections.applications = { deleteMany: makeDeleteMany(1) };
    collections.assignments = { deleteMany: makeDeleteMany(1) };
    collections.events = { deleteMany: makeDeleteMany(0) };

    const result = await resetTeamData(db, TEAM);

    expect(result).toMatchObject({
      testCases: 1,
      testRuns: 1,
      modules: 1,
      applications: 1,
      assignments: 1,
      events: 0,
    });
  });
});

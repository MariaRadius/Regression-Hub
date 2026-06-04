import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { expectApiError } from '@/lib/__tests__/helpers/expectApiError';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { AUDIT_ACTION, AUDIT_CATEGORY } from '@/lib/constants';
import {
  createTestCase,
  deleteTestCase,
  getTestCase,
  listTestCases,
  resetTeamData,
  updateTestCase,
} from '@/lib/db/testCasesData';

// getClient only supplies the transaction session; run the callback inline.
vi.mock('@/lib/mongodb', () => ({
  getClient: vi.fn(async () => ({
    startSession: () => ({
      withTransaction: async (fn) => fn(),
      endSession: vi.fn(),
    }),
  })),
}));

// generateDenseResults is called by createTestCase — stub it out so unit tests
// don't need a real releases collection.
vi.mock('@/lib/db/testResultsData', () => ({
  generateDenseResults: vi.fn().mockResolvedValue(undefined),
}));

const TEAM = 'team-1';
const VALID_ID = new ObjectId().toString();
const APP_ID = new ObjectId().toString();
const MOD_ID = new ObjectId().toString();

const DEFAULT_APP_ID = new ObjectId();
const DEFAULT_MOD_ID = new ObjectId();

const DEFAULT_TEST_CASE_DOCS = [
  {
    _id: new ObjectId(),
    teamId: TEAM,
    applicationId: DEFAULT_APP_ID.toString(),
    moduleId: DEFAULT_MOD_ID.toString(),
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
 * Build a mock db suitable for listTestCases: supports aggregate on testCases,
 * and find on applications/modules via fetchAppModMaps.
 *
 * The aggregate mock resolves with a facet result:
 *   [{ metadata: [{ total }], data: testCaseDocs }]
 */
function makeListMockDb({
  testCaseDocs = DEFAULT_TEST_CASE_DOCS,
  appDocs = DEFAULT_APP_DOCS,
  modDocs = DEFAULT_MOD_DOCS,
} = {}) {
  // listTestCases drives the aggregation from testResults when a (releaseId,
  // environment) scope is supplied, and from testCases otherwise. Stub aggregate
  // on both so either path resolves the same facet shape.
  const aggregateStub = {
    aggregate: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue([
        {
          metadata:
            testCaseDocs.length > 0 ? [{ total: testCaseDocs.length }] : [],
          data: testCaseDocs,
        },
      ]),
    }),
  };
  return {
    collection: vi.fn().mockImplementation((name) => {
      if (name === 'testCases' || name === 'testResults') {
        return aggregateStub;
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

/**
 * Build a mock db for createTestCase tests.
 * Supports: testCases.insertOne, applications.findOne (with projection),
 * sequences.findOneAndUpdate (upsert counter).
 *
 * @param {{ initial?: string, nextSerial?: number }} [opts]
 */
function makeCreateMockDb({ initial, nextSerial = 1 } = {}) {
  const insertedId = new ObjectId();
  const testCasesCol = {
    insertOne: vi.fn().mockResolvedValue({ insertedId }),
  };
  const applicationsCol = {
    findOne: vi
      .fn()
      .mockResolvedValue(
        initial != null ? { _id: new ObjectId(APP_ID), initial } : null,
      ),
  };
  const sequencesCol = {
    findOneAndUpdate: vi.fn().mockResolvedValue({ nextSerial }),
  };
  const db = {
    collection: vi.fn((name) => {
      if (name === 'testCases') return testCasesCol;
      if (name === 'applications') return applicationsCol;
      if (name === 'sequences') return sequencesCol;
      return {};
    }),
  };
  return { db, testCasesCol, applicationsCol, sequencesCol, insertedId };
}

describe('createTestCase', () => {
  it('mints a testKey when applicationId resolves an initial', async () => {
    const { db, testCasesCol, insertedId } = makeCreateMockDb({
      initial: 'TST',
      nextSerial: 1,
    });
    const result = await createTestCase(db, TEAM, {
      applicationId: APP_ID,
      moduleId: MOD_ID,
      testCase: 'My new case',
    });
    expect(result).toMatchObject({ ok: true, id: insertedId.toString() });
    const [doc] = testCasesCol.insertOne.mock.calls[0];
    expect(doc.testKey).toBe('TST-0001');
  });

  it('creates without testKey and skips the app lookup when applicationId is absent', async () => {
    const { db, testCasesCol, applicationsCol } = makeCreateMockDb();
    const result = await createTestCase(db, TEAM, {
      moduleId: MOD_ID,
      testCase: 'No app',
    });
    expect(result.ok).toBe(true);
    const [doc] = testCasesCol.insertOne.mock.calls[0];
    expect(doc.testKey).toBeFalsy();
    expect(applicationsCol.findOne).not.toHaveBeenCalled();
  });

  it('does not set status, testedBy, notes, or testedOn on the inserted doc', async () => {
    const { db, testCasesCol } = makeCreateMockDb({ initial: 'TST' });
    await createTestCase(db, TEAM, {
      applicationId: APP_ID,
      moduleId: MOD_ID,
      testCase: 'Definition only',
    });
    const [doc] = testCasesCol.insertOne.mock.calls[0];
    expect(doc).not.toHaveProperty('status');
    expect(doc).not.toHaveProperty('testedBy');
    expect(doc).not.toHaveProperty('notes');
    expect(doc).not.toHaveProperty('testedOn');
  });
});

describe('listTestCases', () => {
  it('enriches rows with applicationName and moduleName when includeMeta is absent', async () => {
    const db = makeListMockDb();
    const result = await listTestCases(db, TEAM, {
      releaseId: 'rel1',
      environment: 'QA',
    });
    expect(result.data[0].applicationName).toBe('App A');
    expect(result.data[0].moduleName).toBe('Mod B');
  });

  it('enriches rows with applicationName and moduleName when includeMeta is false', async () => {
    const db = makeListMockDb();
    const result = await listTestCases(db, TEAM, {
      releaseId: 'rel1',
      environment: 'QA',
      includeMeta: false,
    });
    expect(result.data[0].applicationName).toBe('App A');
    expect(result.data[0].moduleName).toBe('Mod B');
  });

  it('omits applications and modules keys when includeMeta is absent', async () => {
    const db = makeListMockDb();
    const result = await listTestCases(db, TEAM, {
      releaseId: 'rel1',
      environment: 'QA',
    });
    expect(result).not.toHaveProperty('applications');
    expect(result).not.toHaveProperty('modules');
  });

  it('omits applications and modules keys when includeMeta is false', async () => {
    const db = makeListMockDb();
    const result = await listTestCases(db, TEAM, {
      releaseId: 'rel1',
      environment: 'QA',
      includeMeta: false,
    });
    expect(result).not.toHaveProperty('applications');
    expect(result).not.toHaveProperty('modules');
  });

  it('includes applications and modules arrays when includeMeta is true', async () => {
    const db = makeListMockDb();
    const result = await listTestCases(db, TEAM, {
      releaseId: 'rel1',
      environment: 'QA',
      includeMeta: true,
    });
    expect(result).toHaveProperty('applications');
    expect(result).toHaveProperty('modules');
    expect(Array.isArray(result.applications)).toBe(true);
    expect(Array.isArray(result.modules)).toBe(true);
    expect(result.applications[0]).toMatchObject({ name: 'App A' });
    expect(result.modules[0]).toMatchObject({ name: 'Mod B' });
  });

  it('still enriches rows when includeMeta is true', async () => {
    const db = makeListMockDb();
    const result = await listTestCases(db, TEAM, {
      releaseId: 'rel1',
      environment: 'QA',
      includeMeta: true,
    });
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
    const result = await listTestCases(db, TEAM, {
      releaseId: 'rel1',
      environment: 'QA',
      includeMeta: true,
    });
    expect(result.data).toEqual([]);
    expect(result.total).toBe(0);
    expect(Array.isArray(result.applications)).toBe(true);
    expect(Array.isArray(result.modules)).toBe(true);
    expect(result.applications).toHaveLength(DEFAULT_APP_DOCS.length);
    expect(result.modules).toHaveLength(DEFAULT_MOD_DOCS.length);
  });

  it('returns empty applications and modules arrays (not missing) when no apps or modules exist and includeMeta is true', async () => {
    const db = makeListMockDb({ testCaseDocs: [], appDocs: [], modDocs: [] });
    const result = await listTestCases(db, TEAM, {
      releaseId: 'rel1',
      environment: 'QA',
      includeMeta: true,
    });
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
    };
    // No apps or modules in DB — both map entries will be missing
    const db = makeListMockDb({
      testCaseDocs: [orphanDoc],
      appDocs: [],
      modDocs: [],
    });
    const result = await listTestCases(db, TEAM, {
      releaseId: 'rel1',
      environment: 'QA',
    });
    expect(result.data[0].applicationName).toBe('Unknown');
    expect(result.data[0].moduleName).toBe('Unknown');
  });

  it('adds scoped search clauses for title, test case ID, application, module, and assignee', async () => {
    const db = makeListMockDb();
    await listTestCases(db, TEAM, {
      releaseId: 'rel1',
      environment: 'QA',
      q: 'app a',
    });

    const pipeline = db.collection('testResults').aggregate.mock.calls[0][0];
    expect(
      pipeline.some((stage) =>
        stage.$match?.$or?.some?.(
          (clause) =>
            '_tcDoc.testCase' in clause ||
            '_tcDoc.testKey' in clause ||
            '_tcDoc.applicationId' in clause ||
            '_tcDoc.moduleId' in clause ||
            'assignedTo' in clause,
        ),
      ),
    ).toBe(true);
  });

  it('sorts scoped listings by the requested field and direction', async () => {
    const db = makeListMockDb();
    await listTestCases(db, TEAM, {
      releaseId: 'rel1',
      environment: 'QA',
      sortBy: 'testCase',
      sortDir: 'desc',
    });

    const pipeline = db.collection('testResults').aggregate.mock.calls[0][0];
    expect(
      pipeline.some(
        (stage) =>
          stage.$addFields?._sortValue?.$toLower?.$ifNull?.[0] ===
          '$_tcDoc.testCase',
      ),
    ).toBe(true);
    expect(pipeline.some((stage) => stage.$sort?._sortValue === -1)).toBe(true);
  });

  it('applies an exact testKey filter when requested', async () => {
    const db = makeListMockDb();
    await listTestCases(db, TEAM, {
      releaseId: 'rel1',
      environment: 'QA',
      testKey: 'SAP-0454',
    });

    const pipeline = db.collection('testResults').aggregate.mock.calls[0][0];
    const lookupPipeline = pipeline.find((stage) => stage.$lookup)?.$lookup
      ?.pipeline;
    expect(lookupPipeline).toBeDefined();
    expect(
      lookupPipeline.some((stage) => stage.$match?.testKey === 'SAP-0454'),
    ).toBe(true);
  });
});

describe('getTestCase', () => {
  it('matches existing string _id documents when the id is ObjectId-shaped', async () => {
    const stringBackedId = VALID_ID;
    const testCaseDoc = {
      _id: stringBackedId,
      teamId: TEAM,
      applicationId: DEFAULT_APP_ID.toString(),
      moduleId: DEFAULT_MOD_ID.toString(),
    };
    const db = {
      collection: vi.fn().mockImplementation((name) => {
        if (name === 'testCases') {
          return {
            findOne: vi.fn(async (query) =>
              query._id?.$in?.includes(stringBackedId) ? testCaseDoc : null,
            ),
          };
        }
        if (name === 'testResults') {
          return {
            findOne: vi.fn().mockResolvedValue(null),
          };
        }
        if (name === 'applications') {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(DEFAULT_APP_DOCS),
            }),
          };
        }
        if (name === 'modules') {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(DEFAULT_MOD_DOCS),
            }),
          };
        }
        return {};
      }),
    };

    const result = await getTestCase(db, TEAM, stringBackedId, {
      releaseId: 'rel1',
      environment: 'QA',
    });

    expect(result).toMatchObject({
      _id: stringBackedId,
      applicationName: 'App A',
      moduleName: 'Mod B',
    });
  });

  it('overlays status from testResults row when present', async () => {
    const stringBackedId = VALID_ID;
    const testCaseDoc = {
      _id: stringBackedId,
      teamId: TEAM,
      applicationId: DEFAULT_APP_ID.toString(),
      moduleId: DEFAULT_MOD_ID.toString(),
    };
    const db = {
      collection: vi.fn().mockImplementation((name) => {
        if (name === 'testCases') {
          return {
            findOne: vi.fn().mockResolvedValue(testCaseDoc),
          };
        }
        if (name === 'testResults') {
          return {
            findOne: vi.fn().mockResolvedValue({
              status: 'Pass',
              testedBy: 'Alice',
              assignedTo: 'Bob',
            }),
          };
        }
        if (name === 'applications') {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(DEFAULT_APP_DOCS),
            }),
          };
        }
        if (name === 'modules') {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(DEFAULT_MOD_DOCS),
            }),
          };
        }
        return {};
      }),
    };

    const result = await getTestCase(db, TEAM, stringBackedId, {
      releaseId: 'rel1',
      environment: 'QA',
    });

    expect(result.status).toBe('Pass');
    expect(result.testedBy).toBe('Alice');
    expect(result.assignedTo).toBe('Bob');
  });

  it('defaults status to Pending and testedBy/assignedTo to null when no testResults row', async () => {
    const stringBackedId = VALID_ID;
    const testCaseDoc = {
      _id: stringBackedId,
      teamId: TEAM,
      applicationId: DEFAULT_APP_ID.toString(),
      moduleId: DEFAULT_MOD_ID.toString(),
    };
    const db = {
      collection: vi.fn().mockImplementation((name) => {
        if (name === 'testCases') {
          return { findOne: vi.fn().mockResolvedValue(testCaseDoc) };
        }
        if (name === 'testResults') {
          return { findOne: vi.fn().mockResolvedValue(null) };
        }
        if (name === 'applications') {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(DEFAULT_APP_DOCS),
            }),
          };
        }
        if (name === 'modules') {
          return {
            find: vi.fn().mockReturnValue({
              toArray: vi.fn().mockResolvedValue(DEFAULT_MOD_DOCS),
            }),
          };
        }
        return {};
      }),
    };

    const result = await getTestCase(db, TEAM, stringBackedId, {
      releaseId: 'rel1',
      environment: 'QA',
    });

    expect(result.status).toBe('Pending');
    expect(result.testedBy).toBeNull();
    expect(result.assignedTo).toBeNull();
  });
});

describe('updateTestCase', () => {
  describe('R9 — blank field guards', () => {
    it('throws 400 when expectedResult is sent as empty string', async () => {
      const testCasesCol = {
        updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
      };
      const db = {
        collection: vi.fn(() => testCasesCol),
      };
      await expectApiError(
        updateTestCase(db, TEAM, VALID_ID, { expectedResult: '' }),
        { status: 400, message: 'expectedResult cannot be blank' },
      );
    });

    it('throws 400 when testCase is sent as empty string', async () => {
      const testCasesCol = {
        updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
      };
      const db = {
        collection: vi.fn(() => testCasesCol),
      };
      await expectApiError(
        updateTestCase(db, TEAM, VALID_ID, { testCase: '' }),
        { status: 400, message: 'testCase cannot be blank' },
      );
    });

    it('succeeds when only definition content fields are updated', async () => {
      const testCasesCol = {
        updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
      };
      const db = { collection: vi.fn(() => testCasesCol) };
      const result = await updateTestCase(db, TEAM, VALID_ID, {
        testCase: 'Updated description',
        expectedResult: 'Updated expected result',
      });
      expect(result).toEqual({ ok: true });
    });

    it('does not pass status, testedBy, notes, or testedOn to updateOne', async () => {
      const testCasesCol = {
        updateOne: vi.fn().mockResolvedValue({ matchedCount: 1 }),
      };
      const db = { collection: vi.fn(() => testCasesCol) };
      await updateTestCase(db, TEAM, VALID_ID, {
        testCase: 'New description',
        // These should be stripped by PATCH_ALLOWED_FIELDS
        status: 'Pass',
        testedBy: 'Alice',
        notes: 'some note',
        testedOn: '2025-01-01',
      });
      const [, { $set }] = testCasesCol.updateOne.mock.calls[0];
      expect($set).not.toHaveProperty('status');
      expect($set).not.toHaveProperty('testedBy');
      expect($set).not.toHaveProperty('notes');
      expect($set).not.toHaveProperty('testedOn');
    });
  });
});

describe('resetTeamData', () => {
  it('deletes events for the team and returns their count', async () => {
    const { db, collections } = createMockDb();
    const makeDeleteMany = (count) =>
      vi.fn().mockResolvedValue({ deletedCount: count });

    collections.testCases = { deleteMany: makeDeleteMany(5) };
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

  it('returns counts for all collections', async () => {
    const { db, collections } = createMockDb();
    const makeDeleteMany = (count) =>
      vi.fn().mockResolvedValue({ deletedCount: count });

    collections.testCases = { deleteMany: makeDeleteMany(1) };
    collections.modules = { deleteMany: makeDeleteMany(1) };
    collections.applications = { deleteMany: makeDeleteMany(1) };
    collections.events = { deleteMany: makeDeleteMany(0) };

    const result = await resetTeamData(db, TEAM);

    expect(result).toMatchObject({
      testCases: 1,
      modules: 1,
      applications: 1,
      events: 0,
    });
  });
});

describe('deleteTestCase — cascade and audit event', () => {
  /**
   * Build a mock db for deleteTestCase tests.
   * Exposes testCases (findOne + deleteOne), testResults (deleteMany),
   * and events (deleteMany + insertOne).
   *
   * @param {{ tc?: object|null }} [opts]
   */
  function makeDeleteMockDb({ tc = null } = {}) {
    const testCasesCol = {
      findOne: vi.fn().mockResolvedValue(tc),
      deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    const testResultsCol = {
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    const eventsCol = {
      deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      insertOne: vi.fn().mockResolvedValue({ insertedId: new ObjectId() }),
    };
    const db = {
      collection: vi.fn((name) => {
        if (name === 'testCases') return testCasesCol;
        if (name === 'testResults') return testResultsCol;
        if (name === 'events') return eventsCol;
        return {};
      }),
    };
    return { db, testCasesCol, testResultsCol, eventsCol };
  }

  it('calls testResults.deleteMany with { teamId, tcId } filter', async () => {
    const tcOid = new ObjectId();
    const { db, testResultsCol } = makeDeleteMockDb({
      tc: { _id: tcOid, teamId: TEAM },
    });
    await deleteTestCase(db, TEAM, tcOid.toString(), { actor: 'Alice' });
    expect(testResultsCol.deleteMany).toHaveBeenCalledWith(
      { teamId: TEAM, tcId: tcOid.toString() },
      expect.objectContaining({ session: expect.anything() }),
    );
  });

  it('calls events.deleteMany with { teamId, tcId } filter', async () => {
    const tcOid = new ObjectId();
    const { db, eventsCol } = makeDeleteMockDb({
      tc: { _id: tcOid, teamId: TEAM },
    });
    await deleteTestCase(db, TEAM, tcOid.toString(), { actor: 'Bob' });
    expect(eventsCol.deleteMany).toHaveBeenCalledWith(
      { teamId: TEAM, tcId: tcOid.toString() },
      expect.objectContaining({ session: expect.anything() }),
    );
  });

  it('appends a TEST_CASE DELETE event with tcId after the transaction', async () => {
    const tcOid = new ObjectId();
    const { db, eventsCol } = makeDeleteMockDb({
      tc: { _id: tcOid, teamId: TEAM },
    });
    await deleteTestCase(db, TEAM, tcOid.toString(), { actor: 'Carol' });
    expect(eventsCol.insertOne).toHaveBeenCalledOnce();
    const [doc] = eventsCol.insertOne.mock.calls[0];
    expect(doc).toMatchObject({
      teamId: TEAM,
      category: AUDIT_CATEGORY.TEST_CASE,
      action: AUDIT_ACTION.DELETE,
      tcId: tcOid.toString(),
    });
  });

  it('throws 404 and skips cascade deletes when the test case is not found', async () => {
    const missingId = new ObjectId().toString();
    const { db, testResultsCol, eventsCol } = makeDeleteMockDb({
      tc: null,
    });
    await expectApiError(deleteTestCase(db, TEAM, missingId), {
      status: 404,
      message: 'Test case not found',
    });
    expect(testResultsCol.deleteMany).not.toHaveBeenCalled();
    expect(eventsCol.deleteMany).not.toHaveBeenCalled();
  });
});

describe('createTestCase — edge cases', () => {
  it('creates without testKey when app has no initial', async () => {
    // makeCreateMockDb with initial=null: app resolves but has no initial field
    const { db, testCasesCol, sequencesCol } = makeCreateMockDb({
      initial: null,
    });
    const result = await createTestCase(db, TEAM, {
      applicationId: APP_ID,
      moduleId: MOD_ID,
      testCase: 'No initial app',
    });
    expect(result.ok).toBe(true);
    const [doc] = testCasesCol.insertOne.mock.calls[0];
    expect(doc.testKey).toBeFalsy();
    expect(sequencesCol.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('throws 400 when moduleId is absent', async () => {
    const { db } = makeCreateMockDb();
    await expectApiError(createTestCase(db, TEAM, { applicationId: APP_ID }), {
      status: 400,
      message: 'moduleId required',
    });
  });
});

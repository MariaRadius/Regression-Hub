import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Behavioural characterisation tests for {@link commitImport}.
 *
 * These pin the import *semantics* — minted identity, fingerprint lineage
 * reuse, release-scoped insert vs update, dense Pending generation, audit
 * events, and validation errors. They assert observable outcomes only (final
 * collection state + return value), never call order or round-trip counts, so
 * the behaviour-preserving bulkification keeps them green (CLAUDE.md:48).
 */

// getClient only supplies the transaction session; run the callback inline.
vi.mock('@/lib/mongodb', () => ({
  getClient: async () => ({
    startSession: () => ({
      withTransaction: async (fn) => fn(),
      endSession: async () => {},
    }),
  }),
}));

import { commitImport } from '@/lib/db/importExcelData';

// ---------------------------------------------------------------------------
// In-memory mock DB — supports every op commitImport uses, old and new.
// ---------------------------------------------------------------------------

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([k, cond]) => {
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('$in' in cond) return cond.$in.includes(doc[k]);
      if ('$ne' in cond) return doc[k] !== cond.$ne;
    }
    return doc[k] === cond;
  });
}

function createDb(seed = {}) {
  const store = {};
  for (const [name, docs] of Object.entries(seed)) {
    store[name] = docs.map((d) => ({ ...d }));
  }

  const rows = (name) => {
    if (!store[name]) store[name] = [];
    return store[name];
  };

  const collection = (name) => ({
    findOne: async (filter = {}) =>
      rows(name).find((d) => matches(d, filter)) ?? null,

    find: (filter = {}) => {
      let res = rows(name).filter((d) => matches(d, filter));
      const cursor = {
        sort: (spec) => {
          const [f, dir] = Object.entries(spec)[0];
          res = [...res].sort((a, b) => {
            if (a[f] === b[f]) return 0;
            return (a[f] > b[f] ? 1 : -1) * dir;
          });
          return cursor;
        },
        limit: (n) => {
          res = res.slice(0, n);
          return cursor;
        },
        project: () => cursor,
        toArray: async () => res,
      };
      return cursor;
    },

    insertOne: async (doc) => {
      rows(name).push({ ...doc });
      return { insertedId: doc._id };
    },

    insertMany: async (docs) => {
      // Emulate the unique (teamId, releaseId, caseId, environment) index on
      // testResults: ordered:false inserts skip rows that already exist.
      let inserted = 0;
      for (const doc of docs) {
        if (name === 'testResults') {
          const dup = rows(name).some(
            (d) =>
              d.teamId === doc.teamId &&
              d.releaseId === doc.releaseId &&
              d.caseId === doc.caseId &&
              d.environment === doc.environment,
          );
          if (dup) continue;
        }
        rows(name).push({ ...doc });
        inserted++;
      }
      return { insertedCount: inserted };
    },

    updateOne: async (filter, update) => {
      const d = rows(name).find((x) => matches(x, filter));
      if (d) {
        if (update.$set) Object.assign(d, update.$set);
        return { matchedCount: 1, modifiedCount: 1 };
      }
      return { matchedCount: 0, modifiedCount: 0 };
    },

    findOneAndUpdate: async (filter, update, opts = {}) => {
      let d = rows(name).find((x) => matches(x, filter));
      if (!d && opts.upsert) {
        d = filter._id !== undefined ? { _id: filter._id } : {};
        if (update.$setOnInsert) Object.assign(d, update.$setOnInsert);
        if (update.$inc) {
          for (const [f, delta] of Object.entries(update.$inc)) d[f] = delta;
        }
        if (update.$set) Object.assign(d, update.$set);
        rows(name).push(d);
        return opts.returnDocument === 'after' ? d : null;
      }
      if (d) {
        if (update.$inc) {
          for (const [f, delta] of Object.entries(update.$inc))
            d[f] = (d[f] ?? 0) + delta;
        }
        if (update.$set) Object.assign(d, update.$set);
        return opts.returnDocument === 'after' ? { ...d } : { ...d };
      }
      return null;
    },

    bulkWrite: async (ops = []) => {
      let inserted = 0;
      let modified = 0;
      for (const op of ops) {
        if (op.insertOne) {
          rows(name).push({ ...op.insertOne.document });
          inserted++;
        } else if (op.updateOne) {
          const { filter, update, upsert } = op.updateOne;
          let d = rows(name).find((x) => matches(x, filter));
          if (!d && upsert) {
            d = { ...filter };
            if (update.$setOnInsert) Object.assign(d, update.$setOnInsert);
            rows(name).push(d);
          }
          if (d) {
            if (update.$set) Object.assign(d, update.$set);
            if (update.$inc) {
              for (const [f, delta] of Object.entries(update.$inc))
                d[f] = (d[f] ?? 0) + delta;
            }
            modified++;
          }
        }
      }
      return { insertedCount: inserted, modifiedCount: modified, ok: 1 };
    },
  });

  return { collection, store };
}

const TEAM = 't1';
const REL = 'rel-target';
const REL_OLD = 'rel-old';
const ENV = 'QA';
const OPTS = {
  rows: [],
  releaseId: REL,
  environment: ENV,
};

function releaseSeed(extra = {}) {
  return {
    releases: [
      {
        _id: REL,
        teamId: TEAM,
        environments: [ENV],
        archived: false,
        ...extra,
      },
    ],
  };
}

function row(overrides = {}) {
  return {
    applicationName: 'Login App',
    moduleName: 'Auth',
    testKey: '',
    testCase: 'Login with valid credentials',
    fingerprint: 'login-with-valid-credentials',
    preconditions: '',
    steps: '',
    expectedResult: 'User reaches dashboard',
    notes: '',
    status: '',
    testedBy: '',
    testedOn: '',
    type: '',
    traceability: '',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('commitImport', () => {
  it('valid input → mints caseId + sequential testKeys for new cases and returns counts', async () => {
    const { collection, store } = createDb(releaseSeed());

    const result = await commitImport({ collection }, TEAM, {
      ...OPTS,
      rows: [
        row({ testCase: 'First case', fingerprint: 'first-case' }),
        row({ testCase: 'Second case', fingerprint: 'second-case' }),
      ],
    });

    expect(result).toEqual({ imported: 2, updated: 0, releaseId: REL });

    const inserted = store.testCases;
    expect(inserted).toHaveLength(2);
    for (const tc of inserted) {
      expect(tc.teamId).toBe(TEAM);
      expect(tc.releaseId).toBe(REL);
      expect(tc.caseId).toBeTruthy();
      expect(tc.testKey).toMatch(/^[A-Z0-9]{3}-\d{4}$/);
      expect(tc.fingerprint).toBeTruthy();
    }
    // Distinct lineage + sequential serials within the one application.
    expect(new Set(inserted.map((t) => t.caseId)).size).toBe(2);
    const serials = inserted.map((t) => t.testKey.slice(-4)).sort();
    expect(serials).toEqual(['0001', '0002']);

    // Dense Pending result per (case, env) + one IMPORT/CREATE event per case.
    expect(store.testResults).toHaveLength(2);
    expect(store.testResults.every((r) => r.status === 'Pending')).toBe(true);
    expect(store.events.filter((e) => e.action === 'create')).toHaveLength(2);
  });

  it('fingerprint match in another release → reuses caseId + inherits testKey', async () => {
    const existing = {
      _id: 'existing-doc',
      teamId: TEAM,
      releaseId: REL_OLD,
      caseId: 'case-1',
      testKey: 'LGA-0007',
      applicationId: 'app-1',
      moduleId: 'mod-1',
      fingerprint: 'login-with-valid-credentials',
      createdAt: new Date('2026-01-01'),
    };
    const { collection, store } = createDb({
      ...releaseSeed(),
      applications: [
        { _id: 'app-1', teamId: TEAM, name: 'Login App', initial: 'LGA' },
      ],
      modules: [
        { _id: 'mod-1', teamId: TEAM, applicationId: 'app-1', name: 'Auth' },
      ],
      testCases: [existing],
    });

    const result = await commitImport({ collection }, TEAM, {
      ...OPTS,
      rows: [row()],
    });

    expect(result).toEqual({ imported: 1, updated: 0, releaseId: REL });
    const created = store.testCases.find((t) => t.releaseId === REL);
    expect(created.caseId).toBe('case-1');
    expect(created.testKey).toBe('LGA-0007');
  });

  it('existing case already in the target release → updates definition, no new insert', async () => {
    const existing = {
      _id: 'existing-doc',
      teamId: TEAM,
      releaseId: REL,
      caseId: 'case-1',
      testKey: 'LGA-0007',
      applicationId: 'app-1',
      moduleId: 'mod-1',
      fingerprint: 'login-with-valid-credentials',
      expectedResult: 'OLD expectation',
      createdAt: new Date('2026-01-01'),
    };
    const { collection, store } = createDb({
      ...releaseSeed(),
      applications: [
        { _id: 'app-1', teamId: TEAM, name: 'Login App', initial: 'LGA' },
      ],
      modules: [
        { _id: 'mod-1', teamId: TEAM, applicationId: 'app-1', name: 'Auth' },
      ],
      testCases: [existing],
    });

    const result = await commitImport({ collection }, TEAM, {
      ...OPTS,
      rows: [row()],
    });

    expect(result).toEqual({ imported: 0, updated: 1, releaseId: REL });
    expect(store.testCases).toHaveLength(1);
    expect(store.testCases[0].expectedResult).toBe('User reaches dashboard');
  });

  it('testKey match belonging to another team → row is rejected (team isolation)', async () => {
    const { collection, store } = createDb({
      ...releaseSeed(),
      testCases: [
        {
          _id: 'foreign',
          teamId: 'other-team',
          releaseId: 'r',
          caseId: 'foreign-case',
          testKey: 'OTHER-0001',
          fingerprint: 'x',
          createdAt: new Date('2026-01-01'),
        },
      ],
    });

    const result = await commitImport({ collection }, TEAM, {
      ...OPTS,
      rows: [row({ testKey: 'OTHER-0001' })],
    });

    // testKey belongs to another team → reject (shared resolver enforces in
    // both analyse and commit per spec cases 13/14). No case created for TEAM.
    expect(result.imported).toBe(0);
    expect(result.updated).toBe(0);
    const mine = store.testCases?.find((t) => t.teamId === TEAM);
    expect(mine).toBeUndefined();
  });

  it('legacy application without an initial → backfills a unique initial; testKey is never undefined-NNNN', async () => {
    const { collection, store } = createDb({
      ...releaseSeed(),
      // Application row created before initials existed — no `initial` field.
      applications: [{ _id: 'app-legacy', teamId: TEAM, name: 'Login App' }],
    });

    const result = await commitImport({ collection }, TEAM, {
      ...OPTS,
      rows: [row()],
    });

    expect(result).toEqual({ imported: 1, updated: 0, releaseId: REL });

    // The legacy application row is healed in place with a unique initial.
    const app = store.applications.find((a) => a._id === 'app-legacy');
    expect(app.initial).toMatch(/^[A-Z0-9]{3}$/);

    // The minted key uses the backfilled initial — never `undefined-NNNN`.
    const created = store.testCases.find((t) => t.releaseId === REL);
    expect(created.testKey).toMatch(/^[A-Z0-9]{3}-\d{4}$/);
    expect(created.testKey).not.toContain('undefined');
  });

  it('environment not declared by the release → 400', async () => {
    const { collection } = createDb(releaseSeed({ environments: ['PROD'] }));

    await expect(
      commitImport({ collection }, TEAM, { ...OPTS, rows: [row()] }),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it('missing release → 404', async () => {
    const { collection } = createDb({ releases: [] });

    await expect(
      commitImport({ collection }, TEAM, { ...OPTS, rows: [row()] }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it('archived release → 409', async () => {
    const { collection } = createDb(releaseSeed({ archived: true }));

    await expect(
      commitImport({ collection }, TEAM, { ...OPTS, rows: [row()] }),
    ).rejects.toMatchObject({
      status: 409,
    });
  });
});

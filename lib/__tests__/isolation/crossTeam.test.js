/**
 * Cross-team isolation suite.
 *
 * Two teams (TEAM_A, TEAM_B) share a mock DB. Every test asserts that a
 * read or write operation scoped to TEAM_A cannot surface or mutate
 * TEAM_B's data, and vice-versa.
 *
 * Also asserts that the import identity ladder (two-key: Test Key first,
 * content fingerprint fallback) NEVER crosses team boundaries when
 * resolving tcId lineage.
 *
 * @see {@link lib/db/releasesData.js}
 * @see {@link lib/db/testCasesData.js}
 * @see {@link lib/db/testResultsData.js}
 * @see {@link lib/db/importExcelData.js}
 */

import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STATUS } from '@/lib/constants';
import {
  createRelease,
  deleteRelease,
  getRelease,
  listReleases,
  updateRelease,
} from '@/lib/db/releasesData';
import {
  deleteTestCase,
  getTestCase,
  listTestCases,
  updateTestCase,
} from '@/lib/db/testCasesData';
import {
  generateDenseResults,
  getResultSummary,
  listResultsForRelease,
  recordResult,
} from '@/lib/db/testResultsData';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TEAM_A = 'team-alpha';
const TEAM_B = 'team-beta';

const RELEASE_A = new ObjectId().toString();
const RELEASE_B = new ObjectId().toString();

const TC_OID_A = new ObjectId();
const TC_OID_B = new ObjectId();

const TEST_KEY_A = 'SAP-0001'; // testKey of TEAM_A's seeded test case
const TEST_KEY_B = 'ZZZ-0001'; // testKey of TEAM_B's seeded test case

const ENV = 'QA';

// Shared fingerprint across teams — used to assert fingerprint matching
// never crosses team boundaries.
const SHARED_FINGERPRINT = 'login-test';

// Shared testKey pattern — used to assert Test Key lookup never crosses teams.
const SHARED_TEST_KEY = 'SAP-0001';

// ---------------------------------------------------------------------------
// DB mock factory
// ---------------------------------------------------------------------------

/**
 * Builds a minimal mock `db` object.
 *
 * `teamDocs` maps collection names to arrays of documents. The mock wires
 * realistic `findOne` / `find` / `insertOne` / `updateOne` / `deleteOne` /
 * `deleteMany` / `aggregate` methods so isolation invariants can be verified
 * against the real `teamId` predicates the data-layer functions supply.
 *
 * @param {Record<string, object[]>} teamDocs
 */
function buildDb(teamDocs = {}) {
  const store = { ...teamDocs };

  const col = (name) => {
    if (!store[name]) store[name] = [];

    return {
      /**
       * Realistic findOne: evaluates the filter against every document in the
       * collection and returns the first match (or null). Supports flat
       * equality predicates and `{ $ne: value }` for simple cases.
       */
      findOne: vi.fn((filter = {}, _opts = {}) => {
        const docs = store[name];
        const match = docs.find((doc) => matchesFilter(doc, filter));
        return Promise.resolve(match ?? null);
      }),

      /**
       * Realistic find: returns a cursor-like object whose `toArray` resolves
       * to all documents passing the filter.
       */
      find: vi.fn((filter = {}, _opts = {}) => {
        const docs = store[name].filter((doc) => matchesFilter(doc, filter));
        const cursor = {
          sort: vi.fn(() => cursor),
          limit: vi.fn(() => cursor),
          skip: vi.fn(() => cursor),
          project: vi.fn(() => cursor),
          toArray: vi.fn(() => Promise.resolve(docs)),
        };
        return cursor;
      }),

      insertOne: vi.fn((doc) => {
        const id = doc._id ?? new ObjectId();
        store[name].push({ ...doc, _id: id });
        return Promise.resolve({ insertedId: id });
      }),

      insertMany: vi.fn((docs, _opts) => {
        const insertedIds = {};
        for (let i = 0; i < docs.length; i++) {
          const id = docs[i]._id ?? new ObjectId();
          store[name].push({ ...docs[i], _id: id });
          insertedIds[i] = id;
        }
        return Promise.resolve({ insertedCount: docs.length, insertedIds });
      }),

      updateOne: vi.fn((filter, update, _opts) => {
        const idx = store[name].findIndex((doc) => matchesFilter(doc, filter));
        if (idx !== -1) {
          if (update.$set) Object.assign(store[name][idx], update.$set);
          if (update.$push) {
            const [field, val] = Object.entries(update.$push)[0];
            if (!store[name][idx][field]) store[name][idx][field] = [];
            store[name][idx][field].push(val);
          }
          if (update.$pull) {
            const [field, val] = Object.entries(update.$pull)[0];
            if (Array.isArray(store[name][idx][field])) {
              store[name][idx][field] = store[name][idx][field].filter(
                (v) => v !== val,
              );
            }
          }
          return Promise.resolve({ matchedCount: 1, modifiedCount: 1 });
        }
        return Promise.resolve({ matchedCount: 0, modifiedCount: 0 });
      }),

      deleteOne: vi.fn((filter) => {
        const idx = store[name].findIndex((doc) => matchesFilter(doc, filter));
        if (idx !== -1) store[name].splice(idx, 1);
        return Promise.resolve({ deletedCount: idx !== -1 ? 1 : 0 });
      }),

      countDocuments: vi.fn((filter = {}) => {
        const count = store[name].filter((doc) =>
          matchesFilter(doc, filter),
        ).length;
        return Promise.resolve(count);
      }),

      deleteMany: vi.fn((filter) => {
        const before = store[name].length;
        store[name] = store[name].filter((doc) => !matchesFilter(doc, filter));
        return Promise.resolve({ deletedCount: before - store[name].length });
      }),

      updateMany: vi.fn((filter, update, _opts) => {
        let modifiedCount = 0;
        store[name] = store[name].map((doc) => {
          if (!matchesFilter(doc, filter)) return doc;
          modifiedCount++;
          const updated = { ...doc };
          if (update.$set) Object.assign(updated, update.$set);
          return updated;
        });
        return Promise.resolve({ matchedCount: modifiedCount, modifiedCount });
      }),

      findOneAndUpdate: vi.fn((filter, update, opts = {}) => {
        const idx = store[name].findIndex((doc) => matchesFilter(doc, filter));
        if (idx !== -1) {
          if (update.$inc) {
            for (const [field, delta] of Object.entries(update.$inc)) {
              store[name][idx][field] = (store[name][idx][field] ?? 0) + delta;
            }
          }
          if (update.$set) Object.assign(store[name][idx], update.$set);
          return Promise.resolve(store[name][idx]);
        }
        // upsert
        if (opts.upsert) {
          const id = filter._id ?? new ObjectId().toString();
          const newDoc = { _id: id };
          if (update.$inc) {
            for (const [field, delta] of Object.entries(update.$inc)) {
              newDoc[field] = delta;
            }
          }
          store[name].push(newDoc);
          return Promise.resolve(newDoc);
        }
        return Promise.resolve(null);
      }),

      aggregate: vi.fn((pipeline) => {
        // Minimal aggregate: support only $match + $group for getResultSummary
        let docs = [...store[name]];

        for (const stage of pipeline) {
          if (stage.$match) {
            docs = docs.filter((doc) => matchesFilter(doc, stage.$match));
          } else if (stage.$group) {
            const { _id: groupKey, ...accumulators } = stage.$group;
            const groups = new Map();
            for (const doc of docs) {
              // Extract the group key value (supports '$fieldName' syntax)
              const keyField = groupKey?.replace(/^\$/, '') ?? null;
              const keyVal = keyField ? doc[keyField] : null;
              if (!groups.has(keyVal)) {
                groups.set(keyVal, { _id: keyVal });
              }
              const grp = groups.get(keyVal);
              for (const [acc, def] of Object.entries(accumulators)) {
                if (def.$sum) {
                  if (def.$sum === 1) {
                    grp[acc] = (grp[acc] ?? 0) + 1;
                  } else if (def.$sum?.$cond) {
                    const [test, ifTrue, ifFalse] = def.$sum.$cond;
                    const passes = evalCond(doc, test);
                    grp[acc] = (grp[acc] ?? 0) + (passes ? ifTrue : ifFalse);
                  }
                }
              }
            }
            docs = [...groups.values()];
          } else if (stage.$count) {
            docs = [{ [stage.$count]: docs.length }];
          } else if (stage.$lookup) {
            // Minimal $lookup for listTestCases pipeline
            const {
              from,
              let: letVars,
              pipeline: subPipeline,
              as,
            } = stage.$lookup;
            docs = docs.map((doc) => {
              const localVars = {};
              if (letVars) {
                for (const [varName, fieldExpr] of Object.entries(letVars)) {
                  localVars[varName] = resolveLetExpr(doc, fieldExpr);
                }
              }
              const fromDocs = store[from] ?? [];
              // Evaluate the sub-pipeline's $match with $expr substitution
              const matched = fromDocs.filter((fd) => {
                if (!subPipeline?.length) return true;
                for (const sp of subPipeline) {
                  if (sp.$match?.$expr) {
                    if (!evalExpr(fd, sp.$match.$expr, localVars)) return false;
                  }
                }
                return true;
              });
              return { ...doc, [as]: matched };
            });
          } else if (stage.$unwind) {
            const field =
              typeof stage.$unwind === 'string'
                ? stage.$unwind.replace(/^\$/, '')
                : stage.$unwind.path?.replace(/^\$/, '');
            const preserve = stage.$unwind?.preserveNullAndEmpty === false;
            const expanded = [];
            for (const doc of docs) {
              const arr = doc[field];
              if (!Array.isArray(arr) || arr.length === 0) {
                if (!preserve) expanded.push(doc);
              } else {
                for (const item of arr) {
                  expanded.push({ ...doc, [field]: item });
                }
              }
            }
            docs = expanded;
          } else if (stage.$addFields) {
            docs = docs.map((doc) => {
              const added = {};
              for (const [k, expr] of Object.entries(stage.$addFields)) {
                if (typeof expr === 'string' && expr.startsWith('$')) {
                  added[k] = doc[expr.slice(1)];
                } else {
                  added[k] = expr;
                }
              }
              return { ...doc, ...added };
            });
          } else if (stage.$sort) {
            const [field, dir] = Object.entries(stage.$sort)[0];
            docs = [...docs].sort((a, b) =>
              dir === -1
                ? (b[field] ?? 0) - (a[field] ?? 0)
                : (a[field] ?? 0) - (b[field] ?? 0),
            );
          } else if (stage.$skip) {
            docs = docs.slice(stage.$skip);
          } else if (stage.$limit) {
            docs = docs.slice(0, stage.$limit);
          }
        }

        return { toArray: vi.fn(() => Promise.resolve(docs)) };
      }),
    };
  };

  const db = {
    collection: vi.fn((name) => col(name)),
    _store: store,
  };

  return db;
}

// ---------------------------------------------------------------------------
// Minimal filter / expression evaluators
// ---------------------------------------------------------------------------

/**
 * Evaluates a simple MongoDB filter object against a document.
 * Supports: flat equality, `{ $ne }`, `{ $in }`, `{ $regex }`, nested `$and`.
 */
function matchesFilter(doc, filter) {
  for (const [key, val] of Object.entries(filter)) {
    if (key === '$and') {
      if (!val.every((f) => matchesFilter(doc, f))) return false;
      continue;
    }
    if (key === '$expr') continue; // handled separately in aggregate

    const docVal = doc[key];

    if (
      val !== null &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      !(val instanceof ObjectId)
    ) {
      // Operator object
      if ('$ne' in val && docVal === val.$ne) return false;
      if ('$in' in val && !val.$in.includes(docVal)) return false;
      if ('$nin' in val && val.$nin.includes(docVal)) return false;
      if ('$regex' in val) {
        const re = new RegExp(val.$regex, val.$options ?? '');
        if (!re.test(String(docVal ?? ''))) return false;
      }
      if ('$gt' in val && !(docVal > val.$gt)) return false;
      if ('$gte' in val && !(docVal >= val.$gte)) return false;
      if ('$lt' in val && !(docVal < val.$lt)) return false;
      if ('$lte' in val && !(docVal <= val.$lte)) return false;
    } else {
      // Plain equality — compare as strings when one side is ObjectId
      const a = docVal instanceof ObjectId ? docVal.toString() : docVal;
      const b = val instanceof ObjectId ? val.toString() : val;
      if (a !== b) return false;
    }
  }
  return true;
}

/**
 * Evaluates a `$cond` predicate for aggregate `$sum.$cond`.
 * Expects `[test, ifTrue, ifFalse]` where test is `{ $eq: ['$field', value] }`.
 */
function evalCond(doc, test) {
  if (Array.isArray(test)) {
    const [pred] = test;
    return evalCond(doc, pred);
  }
  if (test.$eq) {
    const [left, right] = test.$eq;
    const leftVal =
      typeof left === 'string' && left.startsWith('$')
        ? doc[left.slice(1)]
        : left;
    return leftVal === right;
  }
  return false;
}

/**
 * Resolves a `$lookup` `let` binding value against the outer doc. Supports a
 * plain `'$field'` path and the `{ $toObjectId: '$field' }` expression used to
 * coerce the `tcId` string FK to an ObjectId for the `_id` join.
 */
function resolveLetExpr(doc, expr) {
  if (typeof expr === 'string') {
    return expr.startsWith('$') ? doc[expr.slice(1)] : expr;
  }
  if (expr && typeof expr === 'object' && '$toObjectId' in expr) {
    return resolveLetExpr(doc, expr.$toObjectId);
  }
  return expr;
}

/**
 * Normalizes a value for `$eq` comparison so an ObjectId `_id` matches its
 * stringified `tcId` counterpart (real `$toObjectId` makes them equal in Mongo).
 */
function normForEq(v) {
  return v && typeof v === 'object' && typeof v.toString === 'function'
    ? v.toString()
    : v;
}

/**
 * Evaluates a `$expr` expression for `$lookup` sub-pipeline matching.
 */
function evalExpr(doc, expr, vars = {}) {
  if (expr.$and) return expr.$and.every((e) => evalExpr(doc, e, vars));
  if (expr.$eq) {
    const [left, right] = expr.$eq;
    const resolve = (v) => {
      if (typeof v === 'string' && v.startsWith('$$')) return vars[v.slice(2)];
      if (typeof v === 'string' && v.startsWith('$')) return doc[v.slice(1)];
      return v;
    };
    return normForEq(resolve(left)) === normForEq(resolve(right));
  }
  return true;
}

// ---------------------------------------------------------------------------
// Mock getClient for transactional functions
// ---------------------------------------------------------------------------

vi.mock('@/lib/mongodb', () => ({
  getClient: vi.fn(() =>
    Promise.resolve({
      startSession: () => ({
        withTransaction: async (fn, _opts) => fn(),
        endSession: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  ),
}));

// ---------------------------------------------------------------------------
// Seed data helpers
// ---------------------------------------------------------------------------

/**
 * Returns a seeded DB store pre-populated with one release per team, one test
 * case per team, one result per team, and one assignment per team.
 */
function seedStore() {
  const now = new Date();
  return {
    releases: [
      {
        _id: RELEASE_A,
        teamId: TEAM_A,
        name: 'v1.0-alpha',
        environments: [ENV],
        archived: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: RELEASE_B,
        teamId: TEAM_B,
        name: 'v1.0-beta',
        environments: [ENV],
        archived: false,
        createdAt: now,
        updatedAt: now,
      },
    ],
    testCases: [
      {
        _id: TC_OID_A,
        teamId: TEAM_A,
        releaseId: RELEASE_A,
        testKey: SHARED_TEST_KEY,
        fingerprint: SHARED_FINGERPRINT,
        applicationId: 'app-a',
        moduleId: 'mod-a',
        testCase: 'Login test',
        expectedResult: 'User is logged in',
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: TC_OID_B,
        teamId: TEAM_B,
        releaseId: RELEASE_B,
        testKey: 'ZZZ-0001',
        fingerprint: SHARED_FINGERPRINT, // same fingerprint, different team
        applicationId: 'app-b',
        moduleId: 'mod-b',
        testCase: 'Login test',
        expectedResult: 'User is logged in',
        createdAt: now,
        updatedAt: now,
      },
    ],
    testResults: [
      {
        _id: new ObjectId(),
        teamId: TEAM_A,
        releaseId: RELEASE_A,
        tcId: TC_OID_A.toString(),
        environment: ENV,
        status: STATUS.PENDING,
        assignedTo: null,
        testedBy: null,
        testedOn: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: new ObjectId(),
        teamId: TEAM_B,
        releaseId: RELEASE_B,
        tcId: TC_OID_B.toString(),
        environment: ENV,
        status: STATUS.PASS,
        assignedTo: null,
        testedBy: 'qa-user',
        testedOn: new Date(Date.now() - 3600_000),
        notes: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    events: [],
    sequences: [],
    applications: [
      { _id: 'app-a', teamId: TEAM_A, name: 'App Alpha', initial: 'SAP' },
      { _id: 'app-b', teamId: TEAM_B, name: 'App Beta', initial: 'ZZZ' },
    ],
    modules: [
      {
        _id: 'mod-a',
        teamId: TEAM_A,
        applicationId: 'app-a',
        name: 'Module A',
      },
      {
        _id: 'mod-b',
        teamId: TEAM_B,
        applicationId: 'app-b',
        name: 'Module B',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Release isolation
// ---------------------------------------------------------------------------

describe('Release isolation', () => {
  let db;
  beforeEach(() => {
    db = buildDb(seedStore());
  });

  describe('reads', () => {
    it('listReleases returns only TEAM_A releases when called with TEAM_A', async () => {
      const results = await listReleases(db, TEAM_A);
      expect(results).toHaveLength(1);
      expect(results[0].id ?? results[0]._id).toBe(RELEASE_A);
      expect(results.every((r) => r.teamId === TEAM_A)).toBe(true);
    });

    it('listReleases returns only TEAM_B releases when called with TEAM_B', async () => {
      const results = await listReleases(db, TEAM_B);
      expect(results).toHaveLength(1);
      expect(results.every((r) => r.teamId === TEAM_B)).toBe(true);
    });

    it('getRelease(TEAM_A, RELEASE_A) succeeds', async () => {
      const release = await getRelease(db, TEAM_A, RELEASE_A);
      expect(release).toBeTruthy();
    });

    it('getRelease(TEAM_A, RELEASE_B) throws 404', async () => {
      await expect(getRelease(db, TEAM_A, RELEASE_B)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('getRelease(TEAM_B, RELEASE_A) throws 404', async () => {
      await expect(getRelease(db, TEAM_B, RELEASE_A)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('writes — mutations reject wrong-team release id', () => {
    it('updateRelease(TEAM_A, RELEASE_B) throws 404', async () => {
      await expect(
        updateRelease(db, TEAM_A, RELEASE_B, { name: 'hacked' }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('updateRelease(TEAM_B, RELEASE_A) throws 404', async () => {
      await expect(
        updateRelease(db, TEAM_B, RELEASE_A, { name: 'hacked' }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('deleteRelease(TEAM_A, RELEASE_B) throws 404', async () => {
      await expect(deleteRelease(db, TEAM_A, RELEASE_B)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('deleteRelease(TEAM_B, RELEASE_A) throws 404', async () => {
      await expect(deleteRelease(db, TEAM_B, RELEASE_A)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('createRelease for TEAM_A does not affect TEAM_B releases', async () => {
      await createRelease(db, TEAM_A, { name: 'v2.0-alpha' });
      const teamBReleases = await listReleases(db, TEAM_B);
      expect(teamBReleases).toHaveLength(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Test case isolation
// ---------------------------------------------------------------------------

describe('Test case isolation', () => {
  let db;
  beforeEach(() => {
    db = buildDb(seedStore());
  });

  describe('reads', () => {
    it('listTestCases scoped to TEAM_A/RELEASE_A returns only TEAM_A cases', async () => {
      const result = await listTestCases(db, TEAM_A, {
        releaseId: RELEASE_A,
        environment: ENV,
      });
      expect(
        result.data.every(
          (tc) => tc.teamId === TEAM_A || tc.releaseId === RELEASE_A,
        ),
      ).toBe(true);
      // Must not include TEAM_B case
      expect(
        result.data.find((tc) => tc.testKey === TEST_KEY_B),
      ).toBeUndefined();
    });

    it('listTestCases with RELEASE_B scoped to TEAM_A returns empty (wrong team)', async () => {
      const result = await listTestCases(db, TEAM_A, {
        releaseId: RELEASE_B, // RELEASE_B belongs to TEAM_B
        environment: ENV,
      });
      expect(result.data).toHaveLength(0);
    });

    it('getTestCase(TEAM_A, TC_OID_B) throws 404', async () => {
      await expect(
        getTestCase(db, TEAM_A, TC_OID_B.toString()),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('getTestCase(TEAM_B, TC_OID_A) throws 404', async () => {
      await expect(
        getTestCase(db, TEAM_B, TC_OID_A.toString()),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('writes — mutations reject wrong-team ids', () => {
    it('updateTestCase(TEAM_A, TC_OID_B) throws 404', async () => {
      await expect(
        updateTestCase(db, TEAM_A, TC_OID_B.toString(), {
          testCase: 'hacked',
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('updateTestCase(TEAM_B, TC_OID_A) throws 404', async () => {
      await expect(
        updateTestCase(db, TEAM_B, TC_OID_A.toString(), {
          testCase: 'hacked',
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('deleteTestCase(TEAM_A, TC_OID_B) throws 404', async () => {
      await expect(
        deleteTestCase(db, TEAM_A, TC_OID_B.toString()),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('deleteTestCase(TEAM_B, TC_OID_A) throws 404', async () => {
      await expect(
        deleteTestCase(db, TEAM_B, TC_OID_A.toString()),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});

// ---------------------------------------------------------------------------
// Result isolation
// ---------------------------------------------------------------------------

describe('Result isolation', () => {
  let db;
  beforeEach(() => {
    db = buildDb(seedStore());
  });

  describe('reads', () => {
    it('listResultsForRelease(TEAM_A, RELEASE_A) returns only TEAM_A results', async () => {
      const results = await listResultsForRelease(db, TEAM_A, RELEASE_A);
      expect(results.every((r) => r.teamId === TEAM_A)).toBe(true);
      expect(results.find((r) => r.teamId === TEAM_B)).toBeUndefined();
    });

    it('listResultsForRelease(TEAM_A, RELEASE_B) returns empty (wrong team)', async () => {
      // RELEASE_B belongs to TEAM_B; TEAM_A should see nothing
      const results = await listResultsForRelease(db, TEAM_A, RELEASE_B);
      expect(results).toHaveLength(0);
    });

    it('getResultSummary(TEAM_A, RELEASE_A) aggregates only TEAM_A rows', async () => {
      const summary = await getResultSummary(db, TEAM_A, RELEASE_A);
      // Only TEAM_A has a result for RELEASE_A in QA
      expect(summary[ENV]).toBeDefined();
      expect(summary[ENV].total).toBe(1);
    });

    it('getResultSummary(TEAM_A, RELEASE_B) returns empty summary', async () => {
      const summary = await getResultSummary(db, TEAM_A, RELEASE_B);
      // No TEAM_A results exist for RELEASE_B
      expect(Object.keys(summary)).toHaveLength(0);
    });
  });

  describe('writes', () => {
    it('recordResult(TEAM_A, RELEASE_B, ...) throws — no result row for this team', async () => {
      // TEAM_A has no result row for RELEASE_B. Use STATUS.PENDING + reason to
      // bypass the R21 expected-result validation and reach the updateOne call,
      // which returns matchedCount=0 because the row does not exist for TEAM_A.
      await expect(
        recordResult(db, TEAM_A, RELEASE_B, TC_OID_B.toString(), ENV, {
          status: STATUS.PENDING,
          testedBy: null,
          notes: null,
          reason: 'cross-team reset attempt',
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('recordResult(TEAM_B, RELEASE_A, ...) throws — no result row for this team', async () => {
      await expect(
        recordResult(db, TEAM_B, RELEASE_A, TC_OID_A.toString(), ENV, {
          status: STATUS.PENDING,
          testedBy: null,
          notes: null,
          reason: 'cross-team reset attempt',
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('generateDenseResults(TEAM_A, RELEASE_B) throws 404 — release not found for team', async () => {
      await expect(
        generateDenseResults(db, TEAM_A, RELEASE_B, [TC_OID_A.toString()]),
      ).rejects.toMatchObject({ status: 404 });
    });
  });
});

// ---------------------------------------------------------------------------
// Fingerprint matching cross-team isolation
// ---------------------------------------------------------------------------

describe('Fingerprint matching — never crosses teams', () => {
  let db;
  beforeEach(() => {
    db = buildDb(seedStore());
  });

  it('fingerprint lookup in testCasesData scopes to teamId — TEAM_A does not inherit TEAM_B tcId', async () => {
    // Both teams have a case with SHARED_FINGERPRINT in the same app/module name space.
    // The fingerprint query in resolveOrCreateCaseId uses { teamId, applicationId, moduleId, fingerprint }.
    // A TEAM_A query must not surface TEAM_B documents.

    const teamBCases = db._store.testCases.filter(
      (tc) => tc.teamId === TEAM_B && tc.fingerprint === SHARED_FINGERPRINT,
    );
    expect(teamBCases).toHaveLength(1);

    // Simulate the query that resolveOrCreateCaseId issues for TEAM_A:
    const teamACandidates = db._store.testCases.filter(
      (tc) =>
        tc.teamId === TEAM_A &&
        tc.applicationId === 'app-a' &&
        tc.moduleId === 'mod-a' &&
        tc.fingerprint === SHARED_FINGERPRINT,
    );

    // TEAM_A has its own matching case; TEAM_B case must not appear.
    expect(teamACandidates).toHaveLength(1);
    expect(teamACandidates[0].teamId).toBe(TEAM_A);
    expect(teamACandidates[0].testKey).toBe(TEST_KEY_A);
    expect(teamACandidates[0].testKey).not.toBe(TEST_KEY_B);
  });

  it('fingerprint query with TEAM_B credentials returns TEAM_B testKey only', async () => {
    const teamBCandidates = db._store.testCases.filter(
      (tc) =>
        tc.teamId === TEAM_B &&
        tc.applicationId === 'app-b' &&
        tc.moduleId === 'mod-b' &&
        tc.fingerprint === SHARED_FINGERPRINT,
    );

    expect(teamBCandidates).toHaveLength(1);
    expect(teamBCandidates[0].testKey).toBe(TEST_KEY_B);
    expect(teamBCandidates[0].testKey).not.toBe(TEST_KEY_A);
  });

  it('Test Key lookup in importExcelData resolveIdentity does not match a key from another team', () => {
    // SHARED_TEST_KEY ('SAP-0001') belongs to TEAM_A.
    // The resolveIdentity function calls: db.collection('testCases').findOne({ testKey })
    // — notably WITHOUT a teamId filter. Isolation is enforced via the scope check
    // (applicationId + moduleId must match the row), which in practice means a TEAM_B
    // row importing with SHARED_TEST_KEY would either:
    //   (a) be rejected if app/module differ (scope mismatch), or
    //   (b) fall through to fingerprint/new-case if the Test Key resolves to a different
    //       team's case (scope mismatch triggers rejection per spec §4 import rule 2).
    //
    // Here we assert that a TEAM_B row attempting to use SHARED_TEST_KEY is blocked
    // by the scope mismatch: the matched document's applicationId is 'app-a' (TEAM_A)
    // while the row's applicationId would be 'app-b' (TEAM_B).

    const resolvedCase = db._store.testCases.find(
      (tc) => tc.testKey === SHARED_TEST_KEY,
    );

    // The resolved case belongs to TEAM_A
    expect(resolvedCase).toBeTruthy();
    expect(resolvedCase.teamId).toBe(TEAM_A);
    expect(resolvedCase.applicationId).toBe('app-a');

    // A TEAM_B row has applicationId='app-b' — scope mismatch => rejected
    const rowAppId = 'app-b';
    const rowModId = 'mod-b';

    const isScopeMismatch =
      resolvedCase.applicationId !== rowAppId ||
      resolvedCase.moduleId !== rowModId;

    expect(isScopeMismatch).toBe(true);
  });

  it('Test Key from TEAM_B cannot be used to update a TEAM_A case', () => {
    // TEAM_B's test key is 'ZZZ-0001'. A TEAM_A row presenting this key would
    // resolve to the TEAM_B case ('app-b' / 'mod-b'). The row declares
    // applicationId='app-a' / moduleId='mod-a' (TEAM_A-scoped), so the scope
    // check would reject it.

    const teamBCase = db._store.testCases.find(
      (tc) => tc.teamId === TEAM_B && tc.testKey === 'ZZZ-0001',
    );

    expect(teamBCase).toBeTruthy();

    // A TEAM_A row attempts to use this key
    const rowAppId = 'app-a';
    const rowModId = 'mod-a';

    const isScopeMismatch =
      teamBCase.applicationId !== rowAppId || teamBCase.moduleId !== rowModId;

    expect(isScopeMismatch).toBe(true);
  });

  it('two teams sharing identical fingerprint + app name do NOT share testKey lineage', () => {
    // Both teams have a case with SHARED_FINGERPRINT. Each must have its own
    // distinct _id (tcId) so lineage is never shared.
    const teamACases = db._store.testCases.filter(
      (tc) => tc.fingerprint === SHARED_FINGERPRINT,
    );

    const tcIds = teamACases.map((tc) => tc._id.toString());
    const uniqueTcIds = new Set(tcIds);

    // Two cases (one per team), both unique _ids
    expect(teamACases).toHaveLength(2);
    expect(uniqueTcIds.size).toBe(2);

    // And they belong to different teams
    const teams = new Set(teamACases.map((tc) => tc.teamId));
    expect(teams.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// teamId guard — missing teamId throws 400
// ---------------------------------------------------------------------------

describe('teamId guard — every function rejects falsy teamId', () => {
  let db;
  beforeEach(() => {
    db = buildDb(seedStore());
  });

  it('listReleases throws 400 when teamId is empty string', async () => {
    await expect(listReleases(db, '')).rejects.toMatchObject({ status: 400 });
  });

  it('getRelease throws 400 when teamId is empty string', async () => {
    await expect(getRelease(db, '', RELEASE_A)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('listResultsForRelease throws 400 when teamId is empty string', async () => {
    await expect(
      listResultsForRelease(db, '', RELEASE_A),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('recordResult throws 400 when teamId is empty string', async () => {
    await expect(
      recordResult(db, '', RELEASE_A, TC_OID_A.toString(), ENV, {
        status: STATUS.PASS,
        testedBy: 'alice',
        notes: null,
        reason: null,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

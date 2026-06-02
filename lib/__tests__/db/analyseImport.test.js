import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Behavioural characterisation tests for {@link analyseImport}.
 *
 * Pins the dry-run identity-resolution semantics — test-key match, fingerprint
 * fallback, in-file duplicate detection, and the preview mapping contract.
 * Tests assert observable outcomes only (return value shape), never query order
 * or round-trip counts, so the bulk-refactor in Phase 1 keeps them green.
 *
 * @see lib/db/importExcelData.js
 */

import { analyseImport } from '@/lib/db/importExcelData';

// ---------------------------------------------------------------------------
// In-memory mock DB — supports every op analyseImport uses.
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
  });

  return { collection, store };
}

const TEAM = 't1';
const REL = 'rel-target';
const OPTS = {
  rows: [],
  releaseId: REL,
};

function releaseSeed(extra = {}) {
  return {
    releases: [
      {
        _id: REL,
        teamId: TEAM,
        environments: ['QA'],
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

describe('analyseImport', () => {
  // -------------------------------------------------------------------------
  // Semantic 1: testKey found, same team, app+module match → update
  // -------------------------------------------------------------------------
  it('testKey found, same team, app+module match → action update', async () => {
    const { collection } = createDb({
      ...releaseSeed(),
      applications: [
        { _id: 'app-1', teamId: TEAM, name: 'Login App', initial: 'LGA' },
      ],
      modules: [
        { _id: 'mod-1', teamId: TEAM, applicationId: 'app-1', name: 'Auth' },
      ],
      testCases: [
        {
          _id: 'tc-1',
          teamId: TEAM,
          releaseId: 'rel-old',
          testKey: 'LGA-0007',
          applicationId: 'app-1',
          moduleId: 'mod-1',
          testCase: 'Login with valid credentials',
          fingerprint: 'login-with-valid-credentials',
          createdAt: new Date('2026-01-01'),
        },
      ],
    });

    const result = await analyseImport({ collection }, TEAM, {
      ...OPTS,
      rows: [row({ testKey: 'LGA-0007' })],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.createCount).toBe(0);
    expect(result.updateCount).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].action).toBe('update');
    expect(result.rows[0].testKey).toBe('LGA-0007');
  });

  // -------------------------------------------------------------------------
  // Semantic 2: testKey found, different team → reject
  // -------------------------------------------------------------------------
  it('testKey belongs to a different team → reject with error message', async () => {
    const { collection } = createDb({
      ...releaseSeed(),
      testCases: [
        {
          _id: 'tc-foreign',
          teamId: 'other-team',
          releaseId: 'r-other',
          testKey: 'OTHER-0001',
          applicationId: 'app-other',
          moduleId: 'mod-other',
          fingerprint: 'x',
          createdAt: new Date('2026-01-01'),
        },
      ],
    });

    const result = await analyseImport({ collection }, TEAM, {
      ...OPTS,
      rows: [row({ testKey: 'OTHER-0001' })],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/belongs to a different team/);
    expect(result.rows).toHaveLength(0);
    expect(result.createCount).toBe(0);
    expect(result.updateCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Semantic 3: testKey found, app/module name mismatch → reject
  // -------------------------------------------------------------------------
  it('testKey found but application or module name mismatch → reject', async () => {
    const { collection } = createDb({
      ...releaseSeed(),
      applications: [
        { _id: 'app-1', teamId: TEAM, name: 'Login App', initial: 'LGA' },
        { _id: 'app-2', teamId: TEAM, name: 'Other App', initial: 'OAP' },
      ],
      modules: [
        { _id: 'mod-1', teamId: TEAM, applicationId: 'app-1', name: 'Auth' },
      ],
      testCases: [
        {
          _id: 'tc-1',
          teamId: TEAM,
          releaseId: 'rel-old',
          testKey: 'LGA-0007',
          applicationId: 'app-1',
          moduleId: 'mod-1',
          testCase: 'Login with valid credentials',
          fingerprint: 'login-with-valid-credentials',
          createdAt: new Date('2026-01-01'),
        },
      ],
    });

    const result = await analyseImport({ collection }, TEAM, {
      ...OPTS,
      rows: [row({ testKey: 'LGA-0007', applicationName: 'Other App' })],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(
      /belongs to a different application or module/,
    );
    expect(result.rows).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Semantic 4: testKey not in DB → fingerprint fallback + warning
  // -------------------------------------------------------------------------
  it('testKey not found in DB → fingerprint fallback with warning', async () => {
    const { collection } = createDb({
      ...releaseSeed(),
      // No testCases in DB matching LGA-9999 — will fall through to fingerprint
      // (also no fingerprint match) → create with a warning
    });

    const result = await analyseImport({ collection }, TEAM, {
      ...OPTS,
      rows: [row({ testKey: 'LGA-9999' })],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(
      /Test Key LGA-9999 was not found — treated as new \(fingerprint fallback\)/,
    );
    // No DB fingerprint match → create
    expect(result.createCount).toBe(1);
    expect(result.updateCount).toBe(0);
    expect(result.rows[0].action).toBe('create');
  });

  it('testKey not found in DB but fingerprint matches (same app+module) → fingerprint fallback gives update with warning', async () => {
    const { collection } = createDb({
      ...releaseSeed(),
      applications: [
        { _id: 'app-1', teamId: TEAM, name: 'Login App', initial: 'LGA' },
      ],
      modules: [
        { _id: 'mod-1', teamId: TEAM, applicationId: 'app-1', name: 'Auth' },
      ],
      testCases: [
        {
          _id: 'tc-1',
          teamId: TEAM,
          releaseId: 'rel-old',
          testKey: 'LGA-0001',
          applicationId: 'app-1',
          moduleId: 'mod-1',
          fingerprint: 'login-with-valid-credentials',
          createdAt: new Date('2026-01-01'),
        },
      ],
    });

    const result = await analyseImport({ collection }, TEAM, {
      ...OPTS,
      rows: [row({ testKey: 'LGA-9999' })],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/LGA-9999 was not found/);
    expect(result.updateCount).toBe(1);
    expect(result.rows[0].action).toBe('update');
  });

  // -------------------------------------------------------------------------
  // Semantic 5: no testKey, fingerprint matches app+module-scoped (newest-wins)
  //   → update.
  // NOTE: Phase 2 intentional change — resolution is now app+module-scoped
  //   (matching commit's authoritative behavior). A fingerprint match in a
  //   different app or module does NOT resolve to update.
  // -------------------------------------------------------------------------
  it('no testKey, fingerprint matches same app+module (newest-wins) → update', async () => {
    const { collection } = createDb({
      ...releaseSeed(),
      applications: [
        { _id: 'app-1', teamId: TEAM, name: 'Login App', initial: 'LGA' },
      ],
      modules: [
        { _id: 'mod-1', teamId: TEAM, applicationId: 'app-1', name: 'Auth' },
      ],
      testCases: [
        {
          _id: 'tc-old',
          teamId: TEAM,
          releaseId: 'rel-old',
          testKey: 'LGA-0001',
          applicationId: 'app-1',
          moduleId: 'mod-1',
          fingerprint: 'login-with-valid-credentials',
          createdAt: new Date('2025-01-01'),
        },
        {
          _id: 'tc-newer',
          teamId: TEAM,
          releaseId: 'rel-old2',
          testKey: 'LGA-0002',
          applicationId: 'app-1',
          moduleId: 'mod-1',
          fingerprint: 'login-with-valid-credentials',
          createdAt: new Date('2026-01-01'),
        },
      ],
    });

    const result = await analyseImport({ collection }, TEAM, {
      ...OPTS,
      rows: [row()],
    });

    expect(result.valid).toBe(true);
    expect(result.createCount).toBe(0);
    expect(result.updateCount).toBe(1);
    expect(result.rows[0].action).toBe('update');
    // Should resolve to the newest match within the same app+module (LGA-0002)
    expect(result.rows[0].testKey).toBe('LGA-0002');
  });

  it('no testKey, fingerprint matches a different app/module → create (app+module-scoped, not team-wide)', async () => {
    // The fingerprint exists in DB but under a different app — must NOT match.
    const { collection } = createDb({
      ...releaseSeed(),
      applications: [
        { _id: 'app-1', teamId: TEAM, name: 'Login App', initial: 'LGA' },
        { _id: 'app-2', teamId: TEAM, name: 'Other App', initial: 'OAP' },
      ],
      modules: [
        { _id: 'mod-1', teamId: TEAM, applicationId: 'app-1', name: 'Auth' },
        { _id: 'mod-2', teamId: TEAM, applicationId: 'app-2', name: 'Auth' },
      ],
      testCases: [
        {
          _id: 'tc-other',
          teamId: TEAM,
          releaseId: 'rel-old',
          testKey: 'OAP-0001',
          applicationId: 'app-2',
          moduleId: 'mod-2',
          fingerprint: 'login-with-valid-credentials',
          createdAt: new Date('2026-01-01'),
        },
      ],
    });

    // Row is for 'Login App'/'Auth' — different from 'Other App'/'Auth' above.
    const result = await analyseImport({ collection }, TEAM, {
      ...OPTS,
      rows: [row()],
    });

    expect(result.valid).toBe(true);
    expect(result.createCount).toBe(1);
    expect(result.updateCount).toBe(0);
    expect(result.rows[0].action).toBe('create');
  });

  // -------------------------------------------------------------------------
  // Semantic 6: no testKey, no fingerprint match → create
  // -------------------------------------------------------------------------
  it('no testKey, no fingerprint match → create', async () => {
    const { collection } = createDb({
      ...releaseSeed(),
      // No matching testCases
    });

    const result = await analyseImport({ collection }, TEAM, {
      ...OPTS,
      rows: [row()],
    });

    expect(result.valid).toBe(true);
    expect(result.createCount).toBe(1);
    expect(result.updateCount).toBe(0);
    expect(result.rows[0].action).toBe('create');
  });

  // -------------------------------------------------------------------------
  // Semantic 7: in-file duplicate → both rows reject
  // -------------------------------------------------------------------------
  it('in-file duplicate by testKey → both rows are rejected', async () => {
    const { collection } = createDb(releaseSeed());

    const result = await analyseImport({ collection }, TEAM, {
      ...OPTS,
      rows: [
        row({ testKey: 'LGA-0001', testCase: 'Case A', fingerprint: 'case-a' }),
        row({ testKey: 'LGA-0001', testCase: 'Case B', fingerprint: 'case-b' }),
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.rows).toHaveLength(0);
    expect(result.createCount).toBe(0);
    expect(result.updateCount).toBe(0);
  });

  it('in-file duplicate by fingerprint within same app+module → both rows are rejected', async () => {
    // Same fingerprint, no testKey
    const { collection } = createDb(releaseSeed());

    const result = await analyseImport({ collection }, TEAM, {
      ...OPTS,
      rows: [
        row({
          testCase: 'Duplicate test case',
          fingerprint: 'duplicate-test-case',
        }),
        row({
          testCase: 'Duplicate test case',
          fingerprint: 'duplicate-test-case',
        }),
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(result.rows).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Semantic 8: preview mapping contract
  // -------------------------------------------------------------------------
  it('preview mapping: reject rows excluded from rows[], surfaced in errors[]; valid===errors.length===0; createCount/updateCount; proposedInitials; warnings[]', async () => {
    const { collection } = createDb({
      ...releaseSeed(),
      testCases: [
        {
          _id: 'tc-foreign',
          teamId: 'other-team',
          releaseId: 'r',
          testKey: 'FOREIGN-001',
          fingerprint: 'foreign-case',
          createdAt: new Date('2026-01-01'),
        },
      ],
    });

    const result = await analyseImport({ collection }, TEAM, {
      ...OPTS,
      rows: [
        // Row 1 — will create (new app + no DB match)
        row({
          testCase: 'Brand new case',
          applicationName: 'New App',
          fingerprint: 'brand-new-case',
        }),
        // Row 2 — will reject (different team test key)
        row({
          testKey: 'FOREIGN-001',
          testCase: 'Foreign case',
          fingerprint: 'foreign-case',
        }),
      ],
    });

    // valid === errors.length === 0 is false here (there is 1 error)
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/belongs to a different team/);

    // Only non-reject rows appear in rows[]
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].action).toBe('create');

    // Counts reflect non-reject resolutions only
    expect(result.createCount).toBe(1);
    expect(result.updateCount).toBe(0);

    // New app gets a proposedInitial
    expect(result.rows[0].proposedInitial).toBeTruthy();
    expect(result.rows[0].proposedInitial).toMatch(/^[A-Z0-9]{3}$/);

    // warnings[] is present (empty in this test)
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('valid === true only when errors is empty', async () => {
    const { collection } = createDb(releaseSeed());

    const result = await analyseImport({ collection }, TEAM, {
      ...OPTS,
      rows: [row()],
    });

    expect(result.errors).toHaveLength(0);
    expect(result.valid).toBe(true);
  });

  it('new application gets a proposed initial derived from the app name', async () => {
    const { collection } = createDb(releaseSeed());

    const result = await analyseImport({ collection }, TEAM, {
      ...OPTS,
      rows: [
        row({
          applicationName: 'Super Admin Portal',
          fingerprint: 'login-with-valid-credentials',
        }),
      ],
    });

    // 'Super Admin Portal' → 'SAP'
    expect(result.rows[0].proposedInitial).toBe('SAP');
  });

  it('existing application does not appear in proposedInitials', async () => {
    const { collection } = createDb({
      ...releaseSeed(),
      applications: [
        { _id: 'app-1', teamId: TEAM, name: 'Login App', initial: 'LGA' },
      ],
    });

    const result = await analyseImport({ collection }, TEAM, {
      ...OPTS,
      rows: [row()],
    });

    // Login App is known — no proposedInitial on the row
    expect(result.rows[0].proposedInitial).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Validation guards
  // -------------------------------------------------------------------------
  it('missing release → 404', async () => {
    const { collection } = createDb({ releases: [] });

    await expect(
      analyseImport({ collection }, TEAM, { ...OPTS, rows: [row()] }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('archived release → 409', async () => {
    const { collection } = createDb(releaseSeed({ archived: true }));

    await expect(
      analyseImport({ collection }, TEAM, { ...OPTS, rows: [row()] }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

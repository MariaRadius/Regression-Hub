/**
 * Tests for utils/importValidation.js — validatePreParse and validateParsedRows.
 * One focused test per gate, as specified in the Phase 2 test plan.
 *
 * @see utils/importValidation.js
 */
import { describe, expect, it } from 'vitest';
import { validateParsedRows, validatePreParse } from '../importValidation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid pre-parse args object; override per test. */
function preParsArgs(overrides = {}) {
  return {
    file: {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      name: 'test.xlsx',
      size: 1000,
    },
    teamId: 'team-1',
    releaseId: 'release-1',
    environment: 'QA',
    isArchived: false,
    environments: ['QA', 'Sandbox'],
    overrides: {},
    ...overrides,
  };
}

/** Build a minimal valid row. Override fields as needed. */
function makeRow(overrides = {}) {
  return {
    applicationName: 'My App',
    moduleName: 'Login',
    type: '',
    traceability: '',
    testKey: '',
    testCase: 'User can log in',
    preconditions: '',
    steps: 'Open app',
    expectedResult: 'Dashboard shown',
    notes: '',
    status: '',
    testedBy: '',
    testedOn: '',
    fingerprint: 'user-can-log-in',
    ...overrides,
  };
}

/** Minimal roster for tests that need one. */
const ROSTER = [
  { name: 'Alice', username: 'alice', active: true },
  { name: 'Bob', username: 'bob', active: true },
  { name: 'Inactive User', username: 'inactive', active: false },
];

const KNOWN_APPS = [{ name: 'My App', initial: 'MYA' }];

// ---------------------------------------------------------------------------
// validatePreParse tests
// ---------------------------------------------------------------------------

describe('validatePreParse', () => {
  it('returns ok:true for valid args', () => {
    const result = validatePreParse(preParsArgs());
    expect(result).toEqual({ ok: true, error: null });
  });

  describe('file guard', () => {
    it('rejects missing file', () => {
      const result = validatePreParse(preParsArgs({ file: null }));
      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('rejects wrong extension', () => {
      const result = validatePreParse(
        preParsArgs({
          file: {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            name: 'test.csv',
            size: 100,
          },
        }),
      );
      expect(result.ok).toBe(false);
    });

    it('rejects file exceeding byte-size cap', () => {
      const result = validatePreParse(
        preParsArgs({
          file: {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            name: 'test.xlsx',
            size: 51 * 1024 * 1024, // 51 MB
          },
        }),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/50 MB/);
    });
  });

  describe('required context fields', () => {
    it('rejects missing teamId', () => {
      const result = validatePreParse(preParsArgs({ teamId: '' }));
      expect(result.ok).toBe(false);
    });

    it('rejects missing releaseId', () => {
      const result = validatePreParse(preParsArgs({ releaseId: '' }));
      expect(result.ok).toBe(false);
    });

    it('rejects missing environment', () => {
      const result = validatePreParse(preParsArgs({ environment: '' }));
      expect(result.ok).toBe(false);
    });
  });

  describe('release/environment guard', () => {
    it('rejects archived release', () => {
      const result = validatePreParse(preParsArgs({ isArchived: true }));
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/archived/i);
    });

    it('rejects environment not in release environments', () => {
      const result = validatePreParse(
        preParsArgs({ environment: 'Production', environments: ['QA'] }),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/Production/);
    });
  });

  describe('override regex + duplicate values', () => {
    it('rejects override value not matching ^[A-Z0-9]{3}$', () => {
      const result = validatePreParse(
        preParsArgs({ overrides: { 'My App': 'abc' } }), // lowercase
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/abc/);
    });

    it('rejects override value of wrong length', () => {
      const result = validatePreParse(
        preParsArgs({ overrides: { 'My App': 'AB' } }),
      );
      expect(result.ok).toBe(false);
    });

    it('rejects duplicate override values', () => {
      const result = validatePreParse(
        preParsArgs({ overrides: { 'App One': 'ABC', 'App Two': 'ABC' } }),
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/ABC/);
    });

    it('accepts distinct valid override values', () => {
      const result = validatePreParse(
        preParsArgs({ overrides: { 'App One': 'ABC', 'App Two': 'DEF' } }),
      );
      expect(result.ok).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// validateParsedRows tests
// ---------------------------------------------------------------------------

describe('validateParsedRows', () => {
  function run(rowOverrides = [], extraParams = {}) {
    const rows = rowOverrides.map((o) => makeRow(o));
    return validateParsedRows({
      rows,
      roster: ROSTER,
      knownApps: KNOWN_APPS,
      overrides: {},
      ...extraParams,
    });
  }

  it('happy path — valid rows produce valid:true and correct apps[]', () => {
    const result = run([
      {
        applicationName: 'My App',
        testCase: 'TC1',
        expectedResult: 'ER1',
        fingerprint: 'tc1',
      },
      {
        applicationName: 'New App',
        testCase: 'TC2',
        expectedResult: 'ER2',
        fingerprint: 'tc2',
      },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    // My App is known; New App is new
    const myApp = result.apps.find((a) => a.name === 'My App');
    const newApp = result.apps.find((a) => a.name === 'New App');
    expect(myApp).toBeDefined();
    expect(myApp.isNew).toBe(false);
    expect(newApp).toBeDefined();
    expect(newApp.isNew).toBe(true);
    expect(newApp.proposedInitial).toMatch(/^[A-Z0-9]{3}$/);
  });

  describe('gate (a) — degenerate app name', () => {
    it('rejects app name with no alphanumeric characters', () => {
      const result = run([{ applicationName: '—' }]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Application "—" has no alphanumeric characters',
      );
    });

    it('reports each unique degenerate app name once', () => {
      const result = run([{ applicationName: '—' }, { applicationName: '—' }]);
      const matches = result.errors.filter((e) =>
        e.includes('Application "—" has no alphanumeric characters'),
      );
      expect(matches).toHaveLength(1);
    });
  });

  describe('gate (b) — testedBy membership', () => {
    it('rejects testedBy when name is not in roster at all', () => {
      const result = run([{ testedBy: 'jdoe' }]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tested By "jdoe" is not a team member');
    });

    it('passes when testedBy is an active roster member', () => {
      const result = run([{ testedBy: 'Alice' }]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes when testedBy is an inactive roster member — recorded as-is', () => {
      // Inactive User is in ROSTER with active: false
      const result = run([{ testedBy: 'Inactive User' }]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('gate (c) — testedOn valid + not-future', () => {
    it('rejects unparseable testedOn date', () => {
      const result = run([{ testedOn: '2026-13-40' }]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Row 1: Tested On "2026-13-40" is not a valid date',
      );
    });

    it('rejects future testedOn date', () => {
      const result = run([{ testedOn: '2099-01-01' }]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Row 1: Tested On cannot be in the future',
      );
    });

    it('accepts a past testedOn date', () => {
      const result = run([{ testedOn: '2020-01-15' }]);
      expect(result.valid).toBe(true);
    });

    it('accepts empty testedOn', () => {
      const result = run([{ testedOn: '' }]);
      expect(result.valid).toBe(true);
    });
  });

  describe('gate (d) — required fields non-blank', () => {
    it('rejects blank testCase', () => {
      const result = run([{ testCase: '' }]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Row 1: Test Case is required');
    });

    it('rejects whitespace-only testCase', () => {
      const result = run([{ testCase: '   ' }]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Row 1: Test Case is required');
    });

    it('rejects blank expectedResult', () => {
      const result = run([{ expectedResult: '' }]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Row 1: Expected Result is required');
    });
  });

  describe('gate (e) — module name constraints', () => {
    it('rejects module name with no alphanumeric characters', () => {
      const result = run([{ moduleName: '—' }]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Module "—" has no alphanumeric characters',
      );
    });

    it('rejects module name exceeding 100 characters', () => {
      const longName = 'A'.repeat(101);
      const result = run([{ moduleName: longName }]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Module name exceeds 100 characters');
    });

    it('accepts module name of exactly 100 characters', () => {
      const exactName = 'A'.repeat(100);
      const result = run([{ moduleName: exactName }]);
      expect(result.valid).toBe(true);
    });
  });

  describe('gate (e) — application name length cap', () => {
    it('rejects application name exceeding 100 characters', () => {
      const longName = 'A'.repeat(101);
      const result = run([{ applicationName: longName }]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Application name exceeds 100 characters',
      );
    });

    it('accepts application name of exactly 100 characters', () => {
      const exactName = 'A'.repeat(100);
      const result = run([{ applicationName: exactName }]);
      expect(result.valid).toBe(true);
    });
  });

  describe('status whitelist', () => {
    it('rejects status not in COMPLETED_STATUSES', () => {
      const result = run([{ status: 'In Progress' }]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('"In Progress"'))).toBe(true);
    });

    it('rejects "Pending" (not in COMPLETED_STATUSES)', () => {
      const result = run([{ status: 'Pending' }]);
      expect(result.valid).toBe(false);
    });

    it('accepts empty status', () => {
      const result = run([{ status: '' }]);
      expect(result.valid).toBe(true);
    });

    it('accepts Pass status', () => {
      const result = run([{ status: 'Pass' }]);
      expect(result.valid).toBe(true);
    });

    it('accepts Fail status', () => {
      const result = run([{ status: 'Fail' }]);
      expect(result.valid).toBe(true);
    });
  });

  describe('override key not in rows', () => {
    it('rejects override key for app not present in rows', () => {
      const result = validateParsedRows({
        rows: [makeRow({ applicationName: 'My App' })],
        roster: ROSTER,
        knownApps: KNOWN_APPS,
        overrides: { 'Ghost App': 'XYZ' },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('"Ghost App"'))).toBe(true);
    });

    it('accepts override key that matches an app in rows', () => {
      const result = validateParsedRows({
        rows: [makeRow({ applicationName: 'New App' })],
        roster: ROSTER,
        knownApps: [],
        overrides: { 'New App': 'NAP' },
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('in-file duplicates', () => {
    it('rejects both rows when Test Key is duplicated', () => {
      const result = run([
        { testKey: 'TC-001', fingerprint: 'fp1' },
        { testKey: 'TC-001', fingerprint: 'fp2' },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.filter((e) => e.includes('TC-001'))).toHaveLength(2);
    });

    it('rejects both rows when app::module::fingerprint is duplicated', () => {
      const result = run([
        {
          applicationName: 'My App',
          moduleName: 'Login',
          testKey: '',
          fingerprint: 'same-fp',
        },
        {
          applicationName: 'My App',
          moduleName: 'Login',
          testKey: '',
          fingerprint: 'same-fp',
        },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.filter((e) => e.includes('duplicate'))).toHaveLength(
        2,
      );
    });

    it('does not flag rows with distinct fingerprints as duplicates', () => {
      const result = run([
        { testKey: '', fingerprint: 'fp-a', testCase: 'TC A' },
        { testKey: '', fingerprint: 'fp-b', testCase: 'TC B' },
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe('row-count cap', () => {
    it('rejects rows exceeding the cap', () => {
      const rows = Array.from({ length: 3 }, (_, i) =>
        makeRow({ testCase: `TC ${i}`, fingerprint: `fp-${i}` }),
      );
      const result = validateParsedRows({
        rows,
        roster: ROSTER,
        knownApps: KNOWN_APPS,
        overrides: {},
        caps: { maxRows: 2 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/row count/i);
    });

    it('accepts rows at exactly the cap', () => {
      const rows = Array.from({ length: 2 }, (_, i) =>
        makeRow({ testCase: `TC ${i}`, fingerprint: `fp-${i}` }),
      );
      const result = validateParsedRows({
        rows,
        roster: ROSTER,
        knownApps: KNOWN_APPS,
        overrides: {},
        caps: { maxRows: 2 },
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('field-length cap', () => {
    it('rejects a row with a field exceeding maxFieldChars', () => {
      const result = validateParsedRows({
        rows: [makeRow({ testCase: 'A'.repeat(101) })],
        roster: ROSTER,
        knownApps: KNOWN_APPS,
        overrides: {},
        caps: { maxFieldChars: 100 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/100-character limit/);
    });
  });

  describe('aggregation', () => {
    it('collects errors from multiple gates in a single pass', () => {
      const result = run([
        {
          applicationName: '—',
          moduleName: '—',
          testCase: '',
          expectedResult: '',
          testedOn: '2099-01-01',
          testedBy: 'nobody',
          status: 'Unknown',
        },
      ]);
      expect(result.valid).toBe(false);
      // Should have errors from gates (a), (e), (d)×2, (c), (b), status
      expect(result.errors.length).toBeGreaterThanOrEqual(5);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { resultSchema, resultsListSchema } from '@/lib/schemas/results';

/**
 * Regression: the write path (lib/db/testResultsData.js) stores Pending and
 * reset rows with explicit nulls for testedBy/testedOn/notes/reason. The
 * client list schema must accept those nulls — `.optional()` alone (which
 * permits only `undefined`) rejected them and broke the Reports overview.
 *
 * @see {@link lib/schemas/results.js}
 * @see {@link lib/db/testResultsData.js}
 */
describe('resultSchema', () => {
  it('accepts a Pending row with null testedBy/testedOn/notes/reason', () => {
    const pendingRow = {
      _id: '6642f000000000000000001a',
      caseId: 'case-1',
      releaseId: '6642f000000000000000002b',
      environment: 'QA',
      status: 'Pending',
      testedBy: null,
      testedOn: null,
      notes: null,
      reason: null,
      teamId: 't1',
    };
    const parsed = resultSchema.safeParse(pendingRow);
    expect(parsed.success).toBe(true);
  });

  it('accepts a completed row with string fields', () => {
    const passRow = {
      _id: '6642f000000000000000001a',
      caseId: 'case-1',
      releaseId: '6642f000000000000000002b',
      environment: 'QA',
      status: 'Pass',
      testedBy: 'Alice',
      testedOn: '2026-06-01T00:00:00.000Z',
    };
    expect(resultSchema.safeParse(passRow).success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const badRow = {
      _id: 'x',
      caseId: 'c',
      releaseId: 'r',
      environment: 'QA',
      status: 'Blocked',
    };
    expect(resultSchema.safeParse(badRow).success).toBe(false);
  });

  it('resultsListSchema accepts a mixed list of completed and null-Pending rows', () => {
    const list = [
      {
        _id: '1',
        caseId: 'c1',
        releaseId: 'r',
        environment: 'QA',
        status: 'Pass',
        testedBy: 'Alice',
        testedOn: '2026-06-01T00:00:00.000Z',
      },
      {
        _id: '2',
        caseId: 'c2',
        releaseId: 'r',
        environment: 'QA',
        status: 'Pending',
        testedBy: null,
        testedOn: null,
        notes: null,
        reason: null,
      },
    ];
    expect(resultsListSchema.safeParse(list).success).toBe(true);
  });
});

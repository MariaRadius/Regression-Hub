import { describe, expect, it } from 'vitest';
import { groupCasesByApplication, summarizeCases } from '../testCaseStats';

/** @see utils/testCaseStats.js */

describe('summarizeCases', () => {
  it('returns correct counts for mixed statuses', () => {
    const cases = [
      { status: 'Pass' },
      { status: 'Pass' },
      { status: 'Fail' },
      { status: '' },
    ];
    const result = summarizeCases(cases);
    expect(result.total).toBe(4);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.pending).toBe(1);
    expect(result.passPercent).toBe(50);
    expect(result.failedCases).toHaveLength(1);
  });

  it('returns zeros for empty array', () => {
    const result = summarizeCases([]);
    expect(result.total).toBe(0);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.pending).toBe(0);
    expect(result.passPercent).toBe(0);
    expect(result.failedCases).toHaveLength(0);
  });

  it('treats all non-pass/fail as pending', () => {
    const cases = [{ status: 'N/A' }, { status: undefined }];
    const result = summarizeCases(cases);
    expect(result.pending).toBe(2);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
  });
});

describe('groupCasesByApplication', () => {
  it('groups by applicationName, sorts alphabetically, defaults to Unknown', () => {
    const cases = [
      { applicationName: 'Beta', id: 1 },
      { applicationName: 'Alpha', id: 2 },
      { applicationName: 'Beta', id: 3 },
      { id: 4 },
    ];
    const result = groupCasesByApplication(cases);
    expect(result.map(([name]) => name)).toEqual(['Alpha', 'Beta', 'Unknown']);
    expect(result[1][1]).toHaveLength(2);
    expect(result[2][1][0].id).toBe(4);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { getReleaseKnownIssues } from '@/lib/db/knownIssuesData';

const TEAM = 'team-1';
const RELEASE = 'r1';
const { db, collections, reset } = createMockDb();

beforeEach(() => reset());

function mockAggregate(rows) {
  collections.testResults = {
    aggregate: vi.fn(() => ({
      toArray: vi.fn().mockResolvedValue(rows),
    })),
  };
}

function mockRelease(doc) {
  collections.releases = {
    findOne: vi.fn().mockResolvedValue(doc),
  };
}

describe('getReleaseKnownIssues', () => {
  it('returns every environment of the release with zero-count cells when there are no known issues', async () => {
    mockAggregate([]);
    mockRelease({ _id: RELEASE, name: '2.12', environments: ['QA', 'Prod'] });

    const result = await getReleaseKnownIssues(db, TEAM, RELEASE);

    expect(result).toEqual({
      releaseId: RELEASE,
      releaseName: '2.12',
      environments: ['Prod', 'QA'],
      total: 0,
      cells: {
        QA: { count: 0, cases: [] },
        Prod: { count: 0, cases: [] },
      },
    });
  });

  it('fills counts and case lists per environment for the release', async () => {
    mockAggregate([
      {
        _id: 'QA',
        count: 2,
        cases: [
          {
            tcId: 't1',
            testKey: 'SAP-1',
            testCaseName: 'Login',
            jiraKeys: ['RXR-1'],
          },
          {
            tcId: 't2',
            testKey: 'SAP-2',
            testCaseName: 'Logout',
            jiraKeys: [],
          },
        ],
      },
    ]);
    mockRelease({ _id: RELEASE, name: '2.12', environments: ['QA', 'Prod'] });

    const result = await getReleaseKnownIssues(db, TEAM, RELEASE);

    expect(result.total).toBe(2);
    expect(result.cells.QA.count).toBe(2);
    expect(result.cells.QA.cases).toEqual([
      {
        tcId: 't1',
        testKey: 'SAP-1',
        testCaseName: 'Login',
        jiraKeys: ['RXR-1'],
      },
      { tcId: 't2', testKey: 'SAP-2', testCaseName: 'Logout', jiraKeys: [] },
    ]);
    expect(result.cells.Prod).toEqual({ count: 0, cases: [] });
  });

  it('surfaces a known issue for an environment the release no longer defines (never silently dropped)', async () => {
    mockAggregate([
      {
        _id: 'Legacy',
        count: 1,
        cases: [
          {
            tcId: 't9',
            testKey: 'OLD-1',
            testCaseName: 'Deprecated',
            jiraKeys: [],
          },
        ],
      },
    ]);
    mockRelease({ _id: RELEASE, name: '2.12', environments: ['QA'] });

    const result = await getReleaseKnownIssues(db, TEAM, RELEASE);

    expect(result.total).toBe(1);
    expect(result.environments).toContain('Legacy');
    expect(result.cells.Legacy.count).toBe(1);
    expect(result.cells.QA).toEqual({ count: 0, cases: [] });
  });

  it('returns an empty shape when the release does not exist', async () => {
    mockAggregate([]);
    mockRelease(null);

    const result = await getReleaseKnownIssues(db, TEAM, 'missing');

    expect(result).toEqual({
      releaseId: 'missing',
      releaseName: null,
      environments: [],
      total: 0,
      cells: {},
    });
  });
});

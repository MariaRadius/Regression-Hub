import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDb } from '@/lib/__tests__/helpers/mockDb';
import { STATUS } from '@/lib/constants';
import { getExportData } from '@/lib/db/exportData';

const TEAM = 'team-1';
const RELEASE = 'release-1';
const ENV = 'QA';
const { db, collections, reset } = createMockDb();

beforeEach(() => reset());

describe('getExportData', () => {
  it('includes cases that belong to the release even when the selected environment result row is missing', async () => {
    collections.testResults = {
      find: vi
        .fn()
        .mockImplementationOnce(() => ({
          toArray: vi
            .fn()
            .mockResolvedValue([{ tcId: 'tc-1' }, { tcId: 'tc-2' }]),
        }))
        .mockImplementationOnce(() => ({
          toArray: vi.fn().mockResolvedValue([
            {
              _id: 'r-1',
              tcId: 'tc-1',
              releaseId: RELEASE,
              environment: ENV,
              status: STATUS.FAIL,
              testedBy: 'Maria',
              testedOn: new Date('2026-06-01T00:00:00.000Z'),
              notes: 'Actual Result: Screen froze',
            },
          ]),
        })),
    };
    collections.testCases = {
      find: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          {
            _id: 'tc-1',
            testKey: 'RXR-1',
            testCase: 'Login works',
            applicationId: 'app-1',
            moduleId: 'mod-1',
            steps: 'Step 1',
            expectedResult: 'Dashboard',
          },
          {
            _id: 'tc-2',
            testKey: 'RXR-2',
            testCase: 'Reset works',
            applicationId: 'app-2',
            moduleId: 'mod-2',
            steps: 'Step 2',
            expectedResult: 'Password reset',
          },
        ]),
      })),
    };
    collections.applications = {
      find: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          { _id: { toString: () => 'app-1' }, name: 'Practice Admin' },
          { _id: { toString: () => 'app-2' }, name: 'Super Admin' },
        ]),
      })),
    };
    collections.modules = {
      find: vi.fn(() => ({
        toArray: vi.fn().mockResolvedValue([
          { _id: { toString: () => 'mod-1' }, name: 'Authentication' },
          { _id: { toString: () => 'mod-2' }, name: 'Users' },
        ]),
      })),
    };

    const rows = await getExportData(db, TEAM, {
      releaseId: RELEASE,
      environment: ENV,
    });

    expect(rows).toHaveLength(2);
    expect(rows).toEqual([
      expect.objectContaining({
        _id: 'r-1',
        tcId: 'tc-1',
        environment: ENV,
        status: STATUS.FAIL,
        applicationName: 'Practice Admin',
        moduleName: 'Authentication',
      }),
      expect.objectContaining({
        _id: 'tc-2',
        environment: ENV,
        status: STATUS.PENDING,
        testedBy: null,
        testedOn: null,
        notes: null,
        applicationName: 'Super Admin',
        moduleName: 'Users',
      }),
    ]);

    expect(collections.testResults.find).toHaveBeenNthCalledWith(1, {
      teamId: TEAM,
      releaseId: RELEASE,
    });
    expect(collections.testResults.find).toHaveBeenNthCalledWith(2, {
      teamId: TEAM,
      releaseId: RELEASE,
      environment: ENV,
    });
  });
});

import { describe, expect, it } from 'vitest';
import { buildExcelExportData, splitExportNotes } from '../exportWorkbook';

describe('splitExportNotes', () => {
  it('splits labeled notes into actual result, defects, and notes fields', () => {
    expect(
      splitExportNotes(
        'Actual Result: Screen froze\n\nDefects/Improvements: BUG-123\n\nNotes: Needs retry',
      ),
    ).toEqual({
      actualResult: 'Screen froze',
      defectsImprovements: 'BUG-123',
      notes: 'Needs retry',
    });
  });

  it('falls back to plain notes when no labeled sections exist', () => {
    expect(splitExportNotes('Free-form note')).toEqual({
      actualResult: '',
      defectsImprovements: '',
      notes: 'Free-form note',
    });
  });
});

describe('buildExcelExportData', () => {
  it('builds summary, all-cases, and per-application sheets with import-facing columns', () => {
    const workbook = buildExcelExportData(
      [
        {
          testKey: 'RXR-1',
          applicationName: 'Practice Admin',
          moduleName: 'Authentication',
          name: 'Login works',
          preconditions: 'User exists',
          steps: 'Step 1',
          expectedResult: 'Dashboard',
          priority: 'High',
          jiraStory: 'RXR-100',
          status: 'Fail',
          notes:
            'Actual Result: Screen froze\n\nDefects/Improvements: BUG-123\n\nNotes: Needs retry',
          testedBy: 'Maria',
          testedOn: '2026-06-01T00:00:00.000Z',
          environment: 'QA',
        },
        {
          testKey: 'RXR-2',
          applicationName: 'Super Admin',
          moduleName: 'Users',
          testCase: 'Reset works',
          preconditions: '',
          steps: 'Step 2',
          expectedResult: 'Password reset',
          priority: 'Medium',
          jiraStory: '',
          status: 'Pending',
          notes: '',
          testedBy: null,
          testedOn: null,
          environment: 'QA',
        },
      ],
      { releaseName: '2.10.1', environment: 'QA' },
    );

    expect(workbook.summaryRows[0]).toEqual(['Test Atlas Export']);
    expect(workbook.summaryRows).toContainEqual(['Applications Covered', 2]);
    expect(workbook.summaryRows).toContainEqual(['Release', '2.10.1']);
    expect(workbook.summaryRows).toContainEqual(['Total Test Cases', 2]);
    expect(workbook.summaryRows).toContainEqual(['Practice Admin', 1]);
    expect(workbook.summaryRows).toContainEqual(['Super Admin', 1]);
    expect(workbook.dataRows).toEqual([
      expect.objectContaining({
        'Test Key': 'RXR-1',
        'Platform/Application': 'Practice Admin',
        Module: 'Authentication',
        'Test Case': 'Login works',
        Steps: 'Step 1',
        'Expected Result': 'Dashboard',
        'Actual Result': 'Screen froze',
        'Defects/Improvements': 'BUG-123',
        Notes: 'Needs retry',
        'Software Version Tested': '2.10.1',
      }),
      expect.objectContaining({
        'Test Key': 'RXR-2',
        'Platform/Application': 'Super Admin',
        Module: 'Users',
        'Test Case': 'Reset works',
        'Actual Result': '',
        'Defects/Improvements': '',
        Notes: '',
        'Software Version Tested': '2.10.1',
      }),
    ]);
    expect(workbook.applicationSheets).toEqual([
      {
        name: 'Practice Admin',
        rows: [expect.objectContaining({ 'Test Key': 'RXR-1' })],
      },
      {
        name: 'Super Admin',
        rows: [expect.objectContaining({ 'Test Key': 'RXR-2' })],
      },
    ]);
  });
});

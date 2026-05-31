import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { mergeImportNotes, parseWorkbookBuffer } from '../excelImport';

function makeBuffer(sheetData) {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheetData)) {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const VALID_ROW = {
  Module: 'Auth',
  'Test Case ID': 'TC-001',
  'Test Case': 'Login with valid credentials',
  'Expected Result': 'User is redirected to dashboard',
  Status: 'Pass',
};

describe('mergeImportNotes', () => {
  it('returns empty string when all inputs are empty', () => {
    expect(
      mergeImportNotes({
        actualResult: '',
        defectsImprovements: '',
        notes: '',
      }),
    ).toBe('');
  });

  it('returns labeled section for actualResult only', () => {
    expect(
      mergeImportNotes({
        actualResult: 'it crashed',
        defectsImprovements: '',
        notes: '',
      }),
    ).toBe('Actual Result: it crashed');
  });

  it('returns labeled section for defectsImprovements only', () => {
    expect(
      mergeImportNotes({
        actualResult: '',
        defectsImprovements: 'bug-123',
        notes: '',
      }),
    ).toBe('Defects/Improvements: bug-123');
  });

  it('returns labeled section for notes only', () => {
    expect(
      mergeImportNotes({
        actualResult: '',
        defectsImprovements: '',
        notes: 'looks good',
      }),
    ).toBe('Notes: looks good');
  });

  it('concatenates all three non-empty sections in order, joined by blank lines', () => {
    expect(
      mergeImportNotes({
        actualResult: 'failed login',
        defectsImprovements: 'DEF-42',
        notes: 'retested ok',
      }),
    ).toBe(
      'Actual Result: failed login\n\nDefects/Improvements: DEF-42\n\nNotes: retested ok',
    );
  });

  it('omits empty sections when only two are non-empty', () => {
    expect(
      mergeImportNotes({
        actualResult: 'crash',
        defectsImprovements: '',
        notes: 'see log',
      }),
    ).toBe('Actual Result: crash\n\nNotes: see log');
  });
});

describe('parseWorkbookBuffer', () => {
  it('parses a valid sheet and returns imported rows', () => {
    const buffer = makeBuffer({ Sheet1: [VALID_ROW] });
    const rows = parseWorkbookBuffer(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      moduleName: 'Auth',
      testCaseId: 'TC-001',
      testCase: 'Login with valid credentials',
      expectedResult: 'User is redirected to dashboard',
      status: 'Pass',
    });
    expect(rows[0]).not.toHaveProperty('actualResult');
    expect(rows[0]).not.toHaveProperty('defectsImprovements');
    expect(rows[0]).toHaveProperty('notes');
  });

  it('merges legacy Actual Result + Defects/Improvements + Notes columns into notes', () => {
    const buffer = makeBuffer({
      Sheet1: [
        {
          ...VALID_ROW,
          'Actual Result': 'screen went blank',
          'Defects/Improvements': 'DEF-99',
          Notes: 'works after reboot',
        },
      ],
    });
    const rows = parseWorkbookBuffer(buffer);
    expect(rows[0].notes).toBe(
      'Actual Result: screen went blank\n\nDefects/Improvements: DEF-99\n\nNotes: works after reboot',
    );
    expect(rows[0]).not.toHaveProperty('actualResult');
    expect(rows[0]).not.toHaveProperty('defectsImprovements');
  });

  it('reads standalone Notes column with no legacy columns', () => {
    const buffer = makeBuffer({
      Sheet1: [{ ...VALID_ROW, Notes: 'all good' }],
    });
    const rows = parseWorkbookBuffer(buffer);
    expect(rows[0].notes).toBe('Notes: all good');
  });

  it('infers applicationName from sheet name', () => {
    const buffer = makeBuffer({ 'iOS App': [VALID_ROW] });
    const rows = parseWorkbookBuffer(buffer);
    expect(rows[0].applicationName).toBe('iOS App');
    expect(rows[0].sourceSheetName).toBe('iOS App');
  });

  it('throws when required columns are missing', () => {
    const buffer = makeBuffer({
      Sheet1: [{ Module: 'Auth', 'Test Case ID': 'TC-001' }],
    });
    expect(() => parseWorkbookBuffer(buffer)).toThrow(
      'Required columns missing',
    );
  });

  it('skips sheets with missing required columns but imports from valid sheets', () => {
    const buffer = makeBuffer({
      Bad: [{ Notes: 'irrelevant' }],
      Good: [VALID_ROW],
    });
    const rows = parseWorkbookBuffer(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0].moduleName).toBe('Auth');
  });

  it('skips empty rows', () => {
    const buffer = makeBuffer({
      Sheet1: [
        VALID_ROW,
        {
          Module: '',
          'Test Case ID': '',
          'Test Case': '',
          'Expected Result': '',
        },
      ],
    });
    const rows = parseWorkbookBuffer(buffer);
    expect(rows).toHaveLength(1);
  });

  it('skips rows where Module or Test Case ID is blank', () => {
    const missingModule = { ...VALID_ROW, Module: '' };
    const buffer = makeBuffer({ Sheet1: [missingModule] });
    const rows = parseWorkbookBuffer(buffer);
    expect(rows).toHaveLength(0);
  });

  it('normalises invalid status values to empty string', () => {
    const buffer = makeBuffer({ Sheet1: [{ ...VALID_ROW, Status: 'N/A' }] });
    const rows = parseWorkbookBuffer(buffer);
    expect(rows[0].status).toBe('');
  });

  it('keeps Pass and Fail status values intact', () => {
    const passBuffer = makeBuffer({
      Sheet1: [{ ...VALID_ROW, Status: 'Pass' }],
    });
    expect(parseWorkbookBuffer(passBuffer)[0].status).toBe('Pass');

    const failBuffer = makeBuffer({
      Sheet1: [{ ...VALID_ROW, Status: 'Fail' }],
    });
    expect(parseWorkbookBuffer(failBuffer)[0].status).toBe('Fail');
  });

  it('filters testedBy when qaUsers list is provided and name is not in the list', () => {
    const buffer = makeBuffer({
      Sheet1: [{ ...VALID_ROW, 'Tested By': 'Unknown Person' }],
    });
    const rows = parseWorkbookBuffer(buffer, ['Alice', 'Bob']);
    expect(rows[0].testedBy).toBe('');
  });

  it('keeps testedBy when name is in the qaUsers list', () => {
    const buffer = makeBuffer({
      Sheet1: [{ ...VALID_ROW, 'Tested By': 'Alice' }],
    });
    const rows = parseWorkbookBuffer(buffer, ['Alice', 'Bob']);
    expect(rows[0].testedBy).toBe('Alice');
  });

  it('keeps testedBy unrestricted when qaUsers is empty', () => {
    const buffer = makeBuffer({
      Sheet1: [{ ...VALID_ROW, 'Tested By': 'Anyone' }],
    });
    const rows = parseWorkbookBuffer(buffer, []);
    expect(rows[0].testedBy).toBe('Anyone');
  });

  it('handles alias column headers via canonicalColumn', () => {
    const aliasRow = {
      Module: 'Search',
      'TC ID': 'TC-002',
      'Test Case Name': 'Search returns results',
      Expected: 'Results are displayed',
    };
    const buffer = makeBuffer({ Sheet1: [aliasRow] });
    const rows = parseWorkbookBuffer(buffer);
    expect(rows[0]).toMatchObject({
      testCaseId: 'TC-002',
      testCase: 'Search returns results',
      expectedResult: 'Results are displayed',
    });
  });

  it('skips empty sheets', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), 'Empty');
    const validWs = XLSX.utils.json_to_sheet([VALID_ROW]);
    XLSX.utils.book_append_sheet(wb, validWs, 'Valid');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const rows = parseWorkbookBuffer(buffer);
    expect(rows).toHaveLength(1);
  });
});

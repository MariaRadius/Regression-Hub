import * as XLSX from 'xlsx';
import { COMPLETED_STATUSES } from '@/lib/constants';
import { canonicalColumn } from './canonicalColumn';

const REQUIRED_COLUMNS = [
  'Module',
  'Test Case ID',
  'Test Case',
  'Expected Result',
];

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function inferApplication(_row, sheetName) {
  return normalizeText(sheetName) || 'Default Application';
}

function looksLikeDataRow(row) {
  return Object.values(row).some((v) => normalizeText(v));
}

/**
 * Concatenate non-empty Excel source columns into a single labeled notes string.
 * Sections are joined by a blank line. All-empty returns ''.
 * @see {@link __tests__/excelImport.test.js}
 * @param {{ actualResult: string, defectsImprovements: string, notes: string }} parts
 * @returns {string}
 */
export function mergeImportNotes({ actualResult, defectsImprovements, notes }) {
  const sections = [
    actualResult && `Actual Result: ${actualResult}`,
    defectsImprovements && `Defects/Improvements: ${defectsImprovements}`,
    notes && `Notes: ${notes}`,
  ].filter(Boolean);
  return sections.join('\n\n');
}

/** @see {@link __tests__/excelImport.test.js} */
export function parseWorkbookBuffer(buffer, qaUsers = []) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const importedRows = [];
  const missingBySheet = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    if (!rows.length) continue;

    const headers = Object.keys(rows[0]);
    const canonicalHeaders = new Map(
      headers.map((h) => [h, canonicalColumn(h)]),
    );
    const presentCanonical = new Set([...canonicalHeaders.values()]);
    const missing = REQUIRED_COLUMNS.filter((c) => !presentCanonical.has(c));

    if (missing.length) {
      missingBySheet.push(`${sheetName}: ${missing.join(', ')}`);
      continue;
    }

    rows.filter(looksLikeDataRow).forEach((rawRow) => {
      const row = {};
      Object.entries(rawRow).forEach(([h, v]) => {
        row[canonicalHeaders.get(h)] = normalizeText(v);
      });

      if (!row.Module || !row['Test Case ID'] || !row['Test Case']) return;

      importedRows.push({
        sourceSheetName: sheetName,
        applicationName: inferApplication(row, sheetName),
        moduleName: row.Module,
        type: row.Type || '',
        traceability: row.Traceability || '',
        testCaseId: row['Test Case ID'],
        testCase: row['Test Case'],
        preconditions: row.Preconditions || '',
        steps: row.Steps || '',
        expectedResult: row['Expected Result'] || '',
        notes: mergeImportNotes({
          actualResult: row['Actual Result'] || '',
          defectsImprovements: row['Defects/Improvements'] || '',
          notes: row.Notes || '',
        }),
        status: COMPLETED_STATUSES.includes(row.Status) ? row.Status : '',
        testedBy:
          !qaUsers.length || qaUsers.includes(row['Tested By'])
            ? row['Tested By']
            : '',
        testedOn: row['Tested On'] || '',
        softwareVersionTested: row['Software Version Tested'] || '',
      });
    });
  }

  if (!importedRows.length && missingBySheet.length) {
    throw new Error(`Required columns missing. ${missingBySheet.join(' | ')}`);
  }

  return importedRows;
}

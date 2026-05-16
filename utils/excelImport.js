import * as XLSX from 'xlsx';
import { canonicalColumn, normalizeHeader } from './canonicalColumn';

const REQUIRED_COLUMNS = ['Module', 'Test Case ID', 'Test Case', 'Expected Result'];
const QA_USERS = ['Ammad', 'Maria', 'Sohail'];

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function inferApplication(row, sheetName) {
  const explicit = normalizeText(row['Application']);
  if (explicit) return explicit;
  const type = normalizeText(row['Type']);
  if (type && !/^(smoke|regression|sanity|functional|e2e|integration)$/i.test(type)) return type;
  return normalizeText(sheetName) || 'Default Application';
}

function looksLikeDataRow(row) {
  return Object.values(row).some((v) => normalizeText(v));
}

export function parseWorkbookBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const importedRows = [];
  const missingBySheet = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    if (!rows.length) continue;

    const headers = Object.keys(rows[0]);
    const canonicalHeaders = new Map(headers.map((h) => [h, canonicalColumn(h)]));
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

      if (!row['Module'] || !row['Test Case ID'] || !row['Test Case']) return;

      importedRows.push({
        sourceSheetName: sheetName,
        applicationName: inferApplication(row, sheetName),
        moduleName: row['Module'],
        type: row['Type'] || '',
        traceability: row['Traceability'] || '',
        testCaseId: row['Test Case ID'],
        testCase: row['Test Case'],
        preconditions: row['Preconditions'] || '',
        steps: row['Steps'] || '',
        expectedResult: row['Expected Result'] || '',
        actualResult: row['Actual Result'] || '',
        status: ['Pass', 'Fail'].includes(row['Status']) ? row['Status'] : '',
        defectsImprovements: row['Defects/Improvements'] || '',
        testedBy: QA_USERS.includes(row['Tested By']) ? row['Tested By'] : '',
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

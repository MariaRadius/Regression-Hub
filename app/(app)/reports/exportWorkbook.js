import { STATUS } from '@/lib/constants';
import { normalizedStatus } from '@/utils/formatters';

const SUMMARY_COLS = [{ wch: 24 }, { wch: 30 }, { wch: 18 }];
const DATA_COLS = [
  14, 22, 18, 28, 22, 24, 24, 22, 22, 18, 10, 14, 12, 18, 16, 22, 14,
].map((wch) => ({ wch }));

export function splitExportNotes(notes = '') {
  const text = String(notes || '').trim();
  if (!text) {
    return {
      actualResult: '',
      defectsImprovements: '',
      notes: '',
    };
  }

  const sectionRegex =
    /(Actual Result|Defects\/Improvements|Notes):\s*([\s\S]*?)(?=\n\n(?:Actual Result|Defects\/Improvements|Notes):|$)/g;

  const extracted = {
    actualResult: '',
    defectsImprovements: '',
    notes: '',
  };

  let matched = false;
  for (const match of text.matchAll(sectionRegex)) {
    matched = true;
    const [, label, body] = match;
    const value = body.trim();
    if (label === 'Actual Result') extracted.actualResult = value;
    if (label === 'Defects/Improvements') extracted.defectsImprovements = value;
    if (label === 'Notes') extracted.notes = value;
  }

  if (!matched) {
    extracted.notes = text;
  }

  return extracted;
}

function buildExportRow(tc, releaseName) {
  const noteParts = splitExportNotes(tc.notes);
  return {
    'Test Key': tc.testKey,
    'Platform/Application': tc.applicationName,
    Module: tc.moduleName,
    'Test Case': tc.testCase || tc.name || tc.title || tc.description || '',
    Preconditions: tc.preconditions,
    Steps: tc.steps,
    'Expected Result': tc.expectedResult,
    'Actual Result': noteParts.actualResult,
    'Defects/Improvements': noteParts.defectsImprovements,
    Notes: noteParts.notes,
    Priority: tc.priority,
    'Jira Story': tc.jiraStory,
    Status: normalizedStatus(tc.status),
    'Tested By': tc.testedBy,
    'Tested On': tc.testedOn,
    'Software Version Tested': releaseName ?? '',
    Environment: tc.environment,
  };
}

function countByApplication(cases) {
  const applicationCounts = new Map();

  for (const tc of cases) {
    const appName = tc.applicationName || 'Unknown';
    applicationCounts.set(appName, (applicationCounts.get(appName) ?? 0) + 1);
  }

  return [...applicationCounts.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
}

function buildSummaryRows(cases, releaseName, environment) {
  const applicationCounts = countByApplication(cases);

  return [
    ['Regression Hub Export'],
    ['Editable workbook for release review'],
    [],
    ['Overview'],
    ['Release', releaseName ?? ''],
    ['Environment', environment],
    ['Applications Covered', applicationCounts.length],
    ['Total Test Cases', cases.length],
    [],
    ['Execution Summary'],
    [
      'Passed',
      cases.filter((t) => normalizedStatus(t.status) === STATUS.PASS).length,
    ],
    [
      'Failed',
      cases.filter((t) => normalizedStatus(t.status) === STATUS.FAIL).length,
    ],
    [
      'Pending',
      cases.filter((t) => normalizedStatus(t.status) === STATUS.PENDING).length,
    ],
    [
      'Known Issue',
      cases.filter((t) => normalizedStatus(t.status) === STATUS.KNOWN_ISSUE)
        .length,
    ],
    ['Generated', new Date().toLocaleString()],
    [],
    ['Applications'],
    ['Application', 'Test Cases'],
    ...applicationCounts.map(([application, total]) => [application, total]),
  ];
}

export function buildExcelExportData(cases, { releaseName, environment }) {
  const dataRows = cases.map((tc) => buildExportRow(tc, releaseName));
  const applicationMap = new Map();

  for (const row of dataRows) {
    const appName = row['Platform/Application'] || 'Unknown';
    if (!applicationMap.has(appName)) applicationMap.set(appName, []);
    applicationMap.get(appName).push(row);
  }

  return {
    summaryRows: buildSummaryRows(cases, releaseName, environment),
    summaryCols: SUMMARY_COLS,
    summaryMerges: [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
    ],
    dataRows,
    dataCols: DATA_COLS,
    applicationSheets: [...applicationMap.entries()].map(([name, rows]) => ({
      name,
      rows,
    })),
  };
}

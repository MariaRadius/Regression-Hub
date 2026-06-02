import { PDF_COLORS } from '../pdfHelpers';

/**
 * @see utils/pdf/generateSignoffReport.js
 */
export function buildModuleSummaryTable({ rows, includeApplication }) {
  const columns = [{ header: 'Module' }];
  if (includeApplication) columns.push({ header: 'Application' });
  for (const header of ['Total', 'Pass', 'Fail', 'Pending', 'Pass Rate']) {
    columns.push({ header, halign: 'center', headerHalign: 'center' });
  }

  const head = [columns.map((c) => c.header)];
  const body = rows.map((m) => {
    const pct = m.total ? Math.round((m.pass / m.total) * 100) : 0;
    return includeApplication
      ? [m.module, m.app, m.total, m.pass, m.fail, m.pending, `${pct}%`]
      : [m.module, m.total, m.pass, m.fail, m.pending, `${pct}%`];
  });

  return { head, body, columns, headFillColor: PDF_COLORS.headSlate };
}

export const FAILED_CASES_COLUMNS = [
  { header: '#', halign: 'center', headerHalign: 'center', width: 4 },
  { header: 'Application', width: 14 },
  { header: 'Module', width: 17 },
  { header: 'Test Case', width: 30 },
  { header: 'Notes', width: 23 },
  { header: 'Tested By', width: 12 },
];

export const failedCasesRow = (t, i) => [
  i + 1,
  t.applicationName || '—',
  t.moduleName || '—',
  t.externalCaseId
    ? `${t.externalCaseId} — ${t.testCase || ''}`
    : t.testCase || '—',
  t.notes || '—',
  t.testedBy || '—',
];

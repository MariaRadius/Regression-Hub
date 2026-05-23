import { PDF_COLORS } from '../pdfHelpers';

/**
 * @see utils/pdf/generateTestRunReport.js
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

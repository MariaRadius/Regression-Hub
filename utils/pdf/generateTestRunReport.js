import { buildModuleMap } from '../buildModuleMap';
import {
  createPdfDocument,
  drawCoverPage,
  drawSectionBanner,
  PDF_COLORS,
  PDF_LAYOUT,
  renderTable,
  writeText,
} from '../pdfHelpers';
import { summarizeCases } from '../testCaseStats';
import { buildModuleSummaryTable } from './reportTables';

const FAILED_CASES_COLUMNS = [
  { header: '#', halign: 'center', headerHalign: 'center', width: 4 },
  { header: 'Application', width: 14 },
  { header: 'Module', width: 17 },
  { header: 'Test Case', width: 40 },
  { header: 'Defects / Improvements', width: 13 },
  { header: 'Tested By', width: 12 },
];

const failedCasesRow = (t, i) => [
  i + 1,
  t.applicationName || '—',
  t.moduleName || '—',
  t.testCaseId ? `${t.testCaseId} — ${t.testCase || ''}` : t.testCase || '—',
  t.defectsImprovements || '—',
  t.testedBy || '—',
];

/**
 * @see utils/pdf/__tests__/generateTestRunReport.test.js
 */
export async function generateTestRunReport({ run, cases }) {
  const { doc, autoTable, W, ML, MR } = await createPdfDocument();
  const { total, passed, failed, pending, failedCases } = summarizeCases(cases);

  drawCoverPage(doc, {
    W,
    ML,
    title: 'Regression Testing Report',
    subtitle: `File: ${run.uploadedFileName}  ·  ${
      run.testEnvironment || 'QA'
    }  ·  v${run.softwareVersion || 'N/A'}`,
  });

  let y = 120;
  writeText(doc, 'Test Run Summary', ML, y, 'h2');
  y += 16;
  writeText(
    doc,
    `Total: ${total}   Passed: ${passed}   Failed: ${failed}   Pending: ${pending}   Pass Rate: ${
      total ? Math.round((passed / total) * 100) : 0
    }%`,
    ML,
    y,
    'body',
  );
  y += 14;
  writeText(
    doc,
    `Imported: ${new Date(run.createdAt).toLocaleString()}`,
    ML,
    y,
    'body',
  );

  const moduleRows = buildModuleMap(cases);
  y += 24;
  writeText(doc, 'Module Summary', ML, y, 'h2');

  renderTable(doc, autoTable, {
    ...buildModuleSummaryTable({ rows: moduleRows, includeApplication: true }),
    startY: y + 8,
    ML,
    MR,
  });

  if (failedCases.length) {
    doc.addPage();
    drawSectionBanner(doc, {
      W,
      ML,
      MR,
      title: 'Failed Test Cases',
      variant: 'error',
    });
    renderTable(doc, autoTable, {
      head: [FAILED_CASES_COLUMNS.map((c) => c.header)],
      body: failedCases.map(failedCasesRow),
      columns: FAILED_CASES_COLUMNS,
      headFillColor: PDF_COLORS.bugHead,
      startY: PDF_LAYOUT.sectionContentStartY,
      ML,
      MR,
    });
  }

  return doc;
}

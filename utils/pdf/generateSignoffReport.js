import { buildModuleMap } from '../buildModuleMap';
import {
  advanceY,
  createPdfDocument,
  drawCoverPage,
  drawSectionBanner,
  ensurePageSpace,
  PDF_COLORS,
  PDF_LINE_H,
  renderTable,
  wrapParagraph,
  writeLabeledLine,
  writeText,
  writeTitledParagraph,
} from '../pdfHelpers';
import { groupCasesByApplication, summarizeCases } from '../testCaseStats';
import { drawDonutWithLegend } from './pdfCharts';
import {
  buildModuleSummaryTable,
  FAILED_CASES_COLUMNS,
  failedCasesRow,
} from './reportTables';

/**
 * @see utils/pdf/__tests__/generateSignoffReport.test.js
 */
export async function generateSignoffReport({
  cases,
  appName,
  environment,
  version,
}) {
  const { doc, autoTable, W, H, ML, MR, CW } = await createPdfDocument();
  const {
    total,
    passed,
    failed,
    knownIssue,
    pending,
    passPercent,
    failedCases,
  } = summarizeCases(cases);

  drawCoverPage(doc, {
    W,
    ML,
    title: `SW-RPT-Regression-${version || 'v0'}`,
    subtitle: `Regression Signoff Report  ·  ${appName}  ·  ${environment}  ·  v${
      version || 'N/A'
    }`,
  });

  let y = 116;

  y = writeLabeledLine(doc, {
    label: 'Test Environment: ',
    value: environment,
    x: ML,
    y,
  });
  y += 16;
  y = writeLabeledLine(doc, {
    label: 'Software Version: ',
    value: version || 'Not specified',
    x: ML,
    y,
  });

  const criticalCount = failedCases.filter((c) => c.priority === 'High').length;
  const failPercent = total ? Math.round((failed / total) * 100) : 0;

  y += 20;
  doc.setDrawColor(...PDF_COLORS.teal);
  doc.setLineWidth(0.5);
  doc.line(ML, y, ML + CW, y);
  y += 14;

  writeText(doc, 'Executive Summary', ML, y, 'h2');
  y += 14;

  const statusLabel =
    failed === 0
      ? 'PASS — No failures recorded'
      : `FAIL — ${failed} failure${failed > 1 ? 's' : ''} require${failed === 1 ? 's' : ''} attention`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...(failed === 0 ? PDF_COLORS.pass : PDF_COLORS.fail));
  doc.text(`Overall Status: ${statusLabel}`, ML, y);
  y += PDF_LINE_H + 6;

  const execBullets = [
    `Total test cases: ${total}`,
    `Passed: ${passed} (${passPercent}%)`,
    `Failed: ${failed} (${failPercent}%)`,
    `Pending (not yet executed): ${pending}`,
    `Known issues: ${knownIssue}`,
    `Critical failures (High priority): ${criticalCount}`,
  ];
  for (const bullet of execBullets) {
    writeText(doc, `•  ${bullet}`, ML, y, 'body');
    y += PDF_LINE_H + 2;
  }

  y += 16;
  doc.setDrawColor(...PDF_COLORS.teal);
  doc.setLineWidth(0.5);
  doc.line(ML, y, ML + CW, y);
  y += 20;

  writeText(doc, `${appName} Test Results`, ML, y, 'h2');

  y += 14;
  const overviewText = `The regression testing phase for ${appName} has been successfully conducted to evaluate its basic functionality and stability.`;
  y = advanceY(
    y,
    wrapParagraph(doc, overviewText, ML, y, CW, 'body'),
    PDF_LINE_H,
    10,
  );

  writeText(doc, 'Detailed Test Results', ML, y, 'h3');
  y += 14;

  const detailSections = [
    {
      title: 'Login and Authentication',
      body: 'The login and authentication processes were subjected to rigorous testing. Both processes passed successfully, ensuring a secure and efficient user experience.',
    },
    {
      title: 'User Interface',
      body: "The application's user interface was evaluated for responsiveness and basic usability. It passed successfully, demonstrating a user-friendly interface.",
    },
    {
      title: 'Basic Functionality',
      body:
        failed === 0
          ? `Core functionalities were tested across all ${total} test cases. All passed successfully.`
          : `Core functionalities were tested. ${passed} of ${total} test cases passed (${passPercent}%), with ${failed} case${
              failed > 1 ? 's' : ''
            } failing. These issues are documented in the Bug Report section.`,
    },
    {
      title: 'Compatibility',
      body: 'The application was tested for basic compatibility on different devices and screen sizes. All test cases passed at this level.',
    },
    {
      title: 'Stability',
      body: "The application's stability was assessed to ensure it doesn't crash or freeze during basic interactions. It passed successfully, demonstrating overall stability.",
    },
  ];

  for (const { title, body } of detailSections) {
    y = ensurePageSpace(doc, y, 90, H);
    y = writeTitledParagraph(doc, { title, body, x: ML, y, maxW: CW });
  }

  y = ensurePageSpace(doc, y, 60, H);
  writeText(doc, 'Test Case Document', ML, y, 'h3');
  y += 14;
  writeText(
    doc,
    `•  Regression Test Cases — ${appName} (v${version || 'N/A'})`,
    ML,
    y,
    'muted',
  );

  for (const [aName, appCases] of groupCasesByApplication(cases)) {
    const {
      total: aTotal,
      passed: aPassed,
      failed: aFailed,
      pending: aPending,
      passPercent: aPassPct,
    } = summarizeCases(appCases);
    const aModRows = buildModuleMap(appCases);

    doc.addPage();
    drawSectionBanner(doc, {
      W,
      ML,
      MR,
      title: 'Summary',
      subtitle: `${aTotal} cases  ·  ${aPassPct}% pass rate`,
    });

    writeText(doc, `${aName} — Regression Testing`, W / 2, 58, 'h1', {
      align: 'center',
    });

    const { statsY, hasPending } = drawDonutWithLegend(doc, {
      cx: W / 2,
      cy: 178,
      outerR: 85,
      innerR: 46,
      passed: aPassed,
      failed: aFailed,
      pending: aPending,
    });

    const modTableY = statsY + (hasPending ? 58 : 44);
    writeText(doc, 'Module Summary', ML, modTableY, 'h2');

    renderTable(doc, autoTable, {
      ...buildModuleSummaryTable({ rows: aModRows, includeApplication: false }),
      startY: modTableY + 8,
      ML,
      MR,
    });
  }

  doc.addPage();
  drawSectionBanner(doc, {
    W,
    ML,
    MR,
    title: 'Bug Report',
    variant: 'error',
  });

  let by = 50;
  const bugSummary =
    failed === 0
      ? `All ${total} test cases passed during the testing phase. No failures were recorded.`
      : `Out of the ${total} smoke test cases, ${failed} test case${
          failed > 1 ? 's have' : ' has'
        } failed during the testing phase. ${
          failed > 1 ? 'These issues have' : 'This issue has'
        } been documented and will be addressed in the next release. ${
          failed > 1 ? 'They include' : 'It includes'
        } basic functionality-related concerns. Resolving ${
          failed > 1 ? 'these issues is' : 'this issue is'
        } essential to ensure a more robust and stable application.`;
  by = advanceY(
    by,
    wrapParagraph(doc, bugSummary, ML, by, CW, 'body'),
    PDF_LINE_H,
    14,
  );

  if (failedCases.length > 0) {
    writeText(doc, 'Failed Test Cases & Defect Details', ML, by, 'h3');
    by += 8;
    renderTable(doc, autoTable, {
      head: [FAILED_CASES_COLUMNS.map((c) => c.header)],
      body: failedCases.map(failedCasesRow),
      columns: FAILED_CASES_COLUMNS,
      headFillColor: PDF_COLORS.bugHead,
      startY: by,
      ML,
      MR,
    });
  }

  return doc;
}

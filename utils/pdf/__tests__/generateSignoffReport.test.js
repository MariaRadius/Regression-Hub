import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../pdfHelpers', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createPdfDocument: vi.fn(),
    drawCoverPage: vi.fn(),
    drawSectionBanner: vi.fn(),
    wrapParagraph: vi.fn(() => 2),
    renderTable: vi.fn(),
  };
});

vi.mock('../pdfCharts', () => ({
  drawDonutWithLegend: vi.fn(() => ({ statsY: 300, hasPending: false })),
}));

import {
  createPdfDocument,
  drawSectionBanner,
  renderTable,
} from '../../pdfHelpers';
import { generateSignoffReport } from '../generateSignoffReport';
import { drawDonutWithLegend } from '../pdfCharts';

/** @see utils/pdf/generateSignoffReport.js */

describe('generateSignoffReport', () => {
  const mockDoc = {
    setTextColor: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    line: vi.fn(),
    text: vi.fn(),
    getTextWidth: vi.fn(() => 50),
    splitTextToSize: vi.fn(() => ['line']),
    addPage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    createPdfDocument.mockResolvedValue({
      doc: mockDoc,
      autoTable: vi.fn(),
      W: 595,
      H: 842,
      ML: 36,
      MR: 36,
      CW: 523,
    });
  });

  it('returns a doc and renders per-application summary pages', async () => {
    const cases = [
      {
        status: 'Pass',
        applicationName: 'AppA',
        moduleId: '1',
        moduleName: 'M1',
      },
      {
        status: 'Pass',
        applicationName: 'AppB',
        moduleId: '2',
        moduleName: 'M2',
      },
    ];
    const doc = await generateSignoffReport({
      cases,
      appName: 'All Applications',
      environment: 'QA',
      version: '2.0',
    });
    expect(doc).toBe(mockDoc);
    expect(renderTable).toHaveBeenCalledTimes(2);
    const moduleHeadFirstCall = renderTable.mock.calls[0][2].head[0];
    expect(moduleHeadFirstCall).toContain('Module');
    expect(moduleHeadFirstCall).not.toContain('Application');
    expect(drawDonutWithLegend).toHaveBeenCalledTimes(2);
    expect(drawSectionBanner).toHaveBeenCalled();
  });
});

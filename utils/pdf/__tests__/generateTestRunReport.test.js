import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../pdfHelpers', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createPdfDocument: vi.fn(),
    drawCoverPage: vi.fn(),
    drawSectionBanner: vi.fn(),
    renderTable: vi.fn(),
  };
});

import {
  createPdfDocument,
  drawCoverPage,
  drawSectionBanner,
  renderTable,
} from '../../pdfHelpers';
import { generateTestRunReport } from '../generateTestRunReport';

/** @see utils/pdf/generateTestRunReport.js */

describe('generateTestRunReport', () => {
  const mockDoc = {
    setTextColor: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    text: vi.fn(),
    addPage: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    createPdfDocument.mockResolvedValue({
      doc: mockDoc,
      autoTable: vi.fn(),
      W: 595,
      ML: 36,
      MR: 36,
    });
  });

  it('builds report without failed page when no failures', async () => {
    const run = {
      uploadedFileName: 'a.xlsx',
      testEnvironment: 'QA',
      softwareVersion: '1',
      createdAt: new Date(),
    };
    const cases = [
      {
        status: 'Pass',
        moduleId: '1',
        moduleName: 'M',
        applicationName: 'App',
      },
    ];
    await generateTestRunReport({ run, cases });
    expect(drawCoverPage).toHaveBeenCalled();
    expect(renderTable).toHaveBeenCalledTimes(1);
    expect(renderTable).toHaveBeenCalledWith(
      mockDoc,
      expect.anything(),
      expect.objectContaining({
        head: expect.arrayContaining([expect.arrayContaining(['Application'])]),
      }),
    );
    expect(drawSectionBanner).not.toHaveBeenCalled();
    expect(mockDoc.addPage).not.toHaveBeenCalled();
  });

  it('adds failed-cases page when failures exist', async () => {
    const run = { uploadedFileName: 'a.xlsx', createdAt: new Date() };
    const cases = [
      {
        status: 'Fail',
        moduleId: '1',
        moduleName: 'M',
        applicationName: 'App',
        testCaseId: 'TC-1',
        testCase: 'Login',
      },
    ];
    await generateTestRunReport({ run, cases });
    expect(mockDoc.addPage).toHaveBeenCalled();
    expect(drawSectionBanner).toHaveBeenCalled();
    expect(renderTable).toHaveBeenCalledTimes(2);
    const failedCall = renderTable.mock.calls[1][2];
    expect(failedCall.head[0]).toContain('Test Case');
    expect(failedCall.head[0]).not.toContain('Test Case ID');
    expect(failedCall.head[0]).toContain('Tested By');
    expect(failedCall.body[0]).toContain('TC-1 — Login');
  });
});

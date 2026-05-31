import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/pdf/generateTestRunReport', () => ({
  generateTestRunReport: vi.fn(),
}));
vi.mock('@/components/Toast', () => ({
  default: () => null,
  showToast: vi.fn(),
}));
vi.mock('@/lib/api/exportData', () => ({
  exportData: vi.fn(),
}));

import DownloadPdfButton from '@/components/DownloadPdfButton';
import { showToast } from '@/components/Toast';
import { exportData } from '@/lib/api/exportData';
import { generateTestRunReport } from '@/utils/pdf/generateTestRunReport';

const mockRun = {
  _id: 'run1',
  uploadedFileName: 'test.xlsx',
  testEnvironment: 'QA',
  softwareVersion: '1.0',
  createdAt: new Date().toISOString(),
};

describe('DownloadPdfButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exportData.mockResolvedValue([]);
    generateTestRunReport.mockResolvedValue({ save: vi.fn() });
  });

  function renderButton() {
    return render(<DownloadPdfButton run={mockRun} />);
  }

  it('renders the Download PDF button', () => {
    renderButton();
    expect(
      screen.getByRole('button', { name: /Download PDF/i }),
    ).toBeInTheDocument();
  });

  it('disables the button while downloading (MUI loading prop)', async () => {
    exportData.mockImplementation(() => new Promise(() => {}));
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    // MUI <Button loading> sets aria-disabled and disabled on the root element
    await waitFor(() => expect(screen.getByRole('button')).toBeDisabled());
  });

  it('calls showToast with info when no cases returned', async () => {
    exportData.mockResolvedValue([]);
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'No test cases for this run',
        'info',
      ),
    );
  });

  it('calls showToast with error when fetch throws', async () => {
    exportData.mockRejectedValue(new Error('Network error'));
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'Download failed — try again',
        'error',
      ),
    );
  });

  it('calls showToast with success and resets button after successful download', async () => {
    const save = vi.fn();
    generateTestRunReport.mockResolvedValue({ save });
    exportData.mockResolvedValue([
      {
        _id: '1',
        status: 'Pass',
        applicationName: 'App',
        moduleName: 'Mod',
        testCaseId: 'TC1',
        testCase: 'Test',
        notes: '',
      },
    ]);

    renderButton();
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Report downloaded', 'success'),
    );
    expect(generateTestRunReport).toHaveBeenCalledWith({
      run: {
        _id: mockRun._id,
        softwareVersion: mockRun.softwareVersion,
        uploadedFileName: mockRun.uploadedFileName,
        testEnvironment: mockRun.testEnvironment,
        createdAt: mockRun.createdAt,
      },
      cases: expect.any(Array),
    });
    expect(save).toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: /Download PDF/i }),
    ).toBeInTheDocument();
  });
});

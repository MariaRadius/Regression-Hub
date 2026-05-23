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

  it('renders the PDF button', () => {
    render(<DownloadPdfButton run={mockRun} />);
    expect(screen.getByRole('button', { name: /PDF/i })).toBeInTheDocument();
  });

  it('shows "Generating…" while downloading', async () => {
    exportData.mockImplementation(() => new Promise(() => {}));
    render(<DownloadPdfButton run={mockRun} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveTextContent('Generating…'),
    );
  });

  it('calls showToast with info when no cases returned', async () => {
    exportData.mockResolvedValue([]);
    render(<DownloadPdfButton run={mockRun} />);
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
    render(<DownloadPdfButton run={mockRun} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Download failed', 'error'),
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
        defectsImprovements: '',
      },
    ]);

    render(<DownloadPdfButton run={mockRun} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Report downloaded', 'success'),
    );
    expect(generateTestRunReport).toHaveBeenCalledWith({
      run: mockRun,
      cases: expect.any(Array),
    });
    expect(save).toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveTextContent('⬇ PDF');
  });
});

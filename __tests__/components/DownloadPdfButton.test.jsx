import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/pdfHelpers', () => ({
  loadPdf: vi.fn(),
  drawPdfPageHeader: vi.fn(),
}));
vi.mock('@/utils/buildModuleMap', () => ({ buildModuleMap: vi.fn(() => []) }));
vi.mock('@/components/Toast', () => ({
  default: () => null,
  showToast: vi.fn(),
}));

import DownloadPdfButton from '@/components/DownloadPdfButton';
import { loadPdf } from '@/utils/pdfHelpers';
import { showToast } from '@/components/Toast';

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
    global.fetch = vi.fn();
  });

  it('renders the PDF button', () => {
    render(<DownloadPdfButton run={mockRun} />);
    expect(screen.getByRole('button', { name: /PDF/i })).toBeInTheDocument();
  });

  it('shows "Generating…" while downloading', async () => {
    global.fetch = vi.fn(() => new Promise(() => {})); // never resolves
    render(<DownloadPdfButton run={mockRun} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveTextContent('Generating…')
    );
  });

  it('calls showToast with info when no cases returned', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
    render(<DownloadPdfButton run={mockRun} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('No test cases for this run', 'info')
    );
  });

  it('calls showToast with error when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    render(<DownloadPdfButton run={mockRun} />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Download failed', 'error')
    );
  });

  it('calls showToast with success and resets button after successful download', async () => {
    const mockDoc = {
      internal: { pageSize: { width: 595 } },
      setTextColor: vi.fn(), setFontSize: vi.fn(), setFont: vi.fn(),
      text: vi.fn(), rect: vi.fn(), setFillColor: vi.fn(),
      addPage: vi.fn(), save: vi.fn(),
    };
    const MockJsPDF = vi.fn(function () { return mockDoc; });
    loadPdf.mockResolvedValue({ jsPDF: MockJsPDF, autoTable: vi.fn() });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ status: 'Pass', applicationName: 'App', moduleName: 'Mod', testCaseId: 'TC1', testCase: 'Test', defectsImprovements: '' }]),
    });

    render(<DownloadPdfButton run={mockRun} />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Report downloaded', 'success')
    );
    expect(screen.getByRole('button')).toHaveTextContent('⬇ PDF');
  });
});

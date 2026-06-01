/**
 * @file ReportsClient.test.jsx
 * Tests for the Reports page client component.
 *
 * Covers spec section 7 client cases:
 *  1. PDF flow downloads locally even when the snapshot upload fails (warning toast).
 *  2. Excel flow writes no snapshot (saveSnapshot never called).
 *  3. No-context state: guidance Alert visible; action buttons disabled.
 *
 * @see {@link app/(app)/reports/ReportsClient.jsx}
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const mockShowToast = vi.hoisted(() => vi.fn());

vi.mock('@/components/Toast', () => ({
  default: () => null,
  showToast: mockShowToast,
}));

const mockUseReleaseEnv = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/ReleaseEnvContext', () => ({
  useReleaseEnv: mockUseReleaseEnv,
}));

const mockListResults = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/results', () => ({ listResults: mockListResults }));

const mockExportData = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/exportData', () => ({ exportData: mockExportData }));

const mockListSnapshots = vi.hoisted(() => vi.fn());
const mockSaveSnapshot = vi.hoisted(() => vi.fn());
const mockSnapshotDownloadUrl = vi.hoisted(() =>
  vi.fn((id) => `/api/snapshots/${id}/download`),
);
vi.mock('@/lib/api/snapshots', () => ({
  listSnapshots: mockListSnapshots,
  saveSnapshot: mockSaveSnapshot,
  snapshotDownloadUrl: mockSnapshotDownloadUrl,
}));

const mockGenerateSignoffReport = vi.hoisted(() => vi.fn());
vi.mock('@/utils/pdf/generateSignoffReport', () => ({
  generateSignoffReport: mockGenerateSignoffReport,
}));

// Mock xlsx so the Excel export does not write a real .xlsx to disk during tests.
const mockXlsxWriteFile = vi.hoisted(() => vi.fn());
vi.mock('xlsx', () => ({
  utils: {
    book_new: vi.fn(() => ({})),
    aoa_to_sheet: vi.fn(() => ({})),
    json_to_sheet: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  writeFile: mockXlsxWriteFile,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

import ReportsClient from '../ReportsClient';

/** Baseline context with a release + environment selected. */
function withContext(overrides = {}) {
  mockUseReleaseEnv.mockReturnValue({
    releaseId: 'rel-1',
    releaseName: 'v2.5',
    environment: 'QA',
    activeRelease: { _id: 'rel-1', name: 'v2.5', environments: ['QA'] },
    ...overrides,
  });
}

/** No-context baseline (nothing selected in the top bar). */
function withNoContext() {
  mockUseReleaseEnv.mockReturnValue({
    releaseId: null,
    releaseName: null,
    environment: null,
    activeRelease: null,
  });
}

const FIXTURE_CASES = [
  { _id: 'c1', testKey: 'TC-1', name: 'Login test', status: 'Pass' },
  { _id: 'c2', testKey: 'TC-2', name: 'Signup test', status: 'Fail' },
];

const FIXTURE_SNAPSHOTS = [
  {
    _id: 's1',
    releaseId: 'rel-1',
    releaseName: 'v2.5',
    environment: 'QA',
    filename: 'regression-signoff-v2.5-QA-2026-06-01.pdf',
    byteSize: 12345,
    generatedBy: 'Alice',
    generatedAt: '2026-06-01T10:00:00.000Z',
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ReportsClient — no context selected', () => {
  beforeEach(() => {
    withNoContext();
    mockListSnapshots.mockResolvedValue([]);
    vi.clearAllMocks();
    // Reinstate no-context state after clearAllMocks
    withNoContext();
    mockListSnapshots.mockResolvedValue([]);
  });

  it('shows guidance Alert when no release/environment selected', async () => {
    await act(async () => {
      render(<ReportsClient initialSnapshots={[]} />);
    });

    expect(screen.getByText(/select a release and environment/i)).toBeDefined();
  });

  it('disables Download PDF button when no context', async () => {
    await act(async () => {
      render(<ReportsClient initialSnapshots={[]} />);
    });

    const pdfBtn = screen.getByRole('button', { name: /download pdf/i });
    expect(pdfBtn.disabled).toBe(true);
  });

  it('disables Export Excel button when no context', async () => {
    await act(async () => {
      render(<ReportsClient initialSnapshots={[]} />);
    });

    const excelBtn = screen.getByRole('button', { name: /export excel/i });
    expect(excelBtn.disabled).toBe(true);
  });
});

describe('ReportsClient — PDF flow', () => {
  let mockDocSave;
  let mockDocOutput;

  beforeEach(() => {
    vi.clearAllMocks();
    withContext();

    mockListResults.mockResolvedValue([
      { _id: 'r1', caseId: 'c1', status: 'Pass' },
    ]);
    mockListSnapshots.mockResolvedValue(FIXTURE_SNAPSHOTS);
    mockExportData.mockResolvedValue(FIXTURE_CASES);

    mockDocSave = vi.fn();
    mockDocOutput = vi.fn(
      () => new Blob(['%PDF'], { type: 'application/pdf' }),
    );
    mockGenerateSignoffReport.mockResolvedValue({
      save: mockDocSave,
      output: mockDocOutput,
    });
  });

  it('downloads locally AND shows warning toast when upload fails', async () => {
    mockSaveSnapshot.mockRejectedValue(new Error('network error'));

    await act(async () => {
      render(<ReportsClient initialSnapshots={FIXTURE_SNAPSHOTS} />);
    });

    const pdfBtn = screen.getByRole('button', { name: /download pdf/i });
    await act(async () => {
      await userEvent.click(pdfBtn);
    });

    // Local download must have happened (doc.save called)
    expect(mockDocSave).toHaveBeenCalledTimes(1);

    // Warning toast for failed upload
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringMatching(/saving to version history failed/i),
      'warning',
    );
  });

  it('shows success toast and refreshes snapshots when upload succeeds', async () => {
    const savedDoc = {
      _id: 's2',
      releaseId: 'rel-1',
      releaseName: 'v2.5',
      environment: 'QA',
      filename: 'new.pdf',
      byteSize: 999,
      generatedBy: 'Alice',
      generatedAt: '2026-06-01T11:00:00.000Z',
    };
    mockSaveSnapshot.mockResolvedValue(savedDoc);
    mockListSnapshots.mockResolvedValue([savedDoc]);

    await act(async () => {
      render(<ReportsClient initialSnapshots={FIXTURE_SNAPSHOTS} />);
    });

    const pdfBtn = screen.getByRole('button', { name: /download pdf/i });
    await act(async () => {
      await userEvent.click(pdfBtn);
    });

    expect(mockDocSave).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringMatching(/saved to version history/i),
      'success',
    );
  });

  it('shows info toast and does not call saveSnapshot when no cases', async () => {
    mockExportData.mockResolvedValue([]);

    await act(async () => {
      render(<ReportsClient initialSnapshots={[]} />);
    });

    const pdfBtn = screen.getByRole('button', { name: /download pdf/i });
    await act(async () => {
      await userEvent.click(pdfBtn);
    });

    expect(mockSaveSnapshot).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringMatching(/no test cases/i),
      'info',
    );
  });
});

describe('ReportsClient — Excel flow writes no snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withContext();
    mockListResults.mockResolvedValue([]);
    mockListSnapshots.mockResolvedValue([]);
    mockExportData.mockResolvedValue(FIXTURE_CASES);
  });

  it('does not call saveSnapshot when exporting Excel', async () => {
    await act(async () => {
      render(<ReportsClient initialSnapshots={[]} />);
    });

    const excelBtn = screen.getByRole('button', { name: /export excel/i });
    await act(async () => {
      await userEvent.click(excelBtn);
    });

    expect(mockSaveSnapshot).not.toHaveBeenCalled();
  });
});

/**
 * @file ReportsClient.test.jsx
 * Tests for the Reports page client component (unified, release-grouped cards).
 *
 * Covers spec §7 client cases:
 *  1. No releases → EmptyState guidance.
 *  2. Create flow downloads locally AND warns when the saved-copy upload fails.
 *  3. Create flow with no cases → info toast, no upload.
 *  4. Excel flow writes no saved copy (saveSnapshot never called).
 *
 * @see {@link app/(app)/reports/ReportsClient.jsx}
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES } from '@/lib/constants';

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

import ReportsClient from '../ReportsClient';

// ── Helpers ──────────────────────────────────────────────────────────────────

const ACTIVE_RELEASE = { _id: 'rel-1', name: 'v2.5', environments: ['QA'] };

/** Context exposing one active release with a single QA environment. */
function withReleases(releases = [ACTIVE_RELEASE]) {
  mockUseReleaseEnv.mockReturnValue({ releases });
}

const FIXTURE_CASES = [
  { _id: 'c1', testKey: 'TC-1', name: 'Login test', status: 'Pass' },
  { _id: 'c2', testKey: 'TC-2', name: 'Signup test', status: 'Fail' },
];

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ReportsClient — no releases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withReleases([]);
  });

  it('shows the EmptyState guidance and admin CTA when no releases exist', async () => {
    await act(async () => {
      render(<ReportsClient initialSnapshots={[]} userRole={ROLES.ADMIN} />);
    });

    expect(screen.getByText(/no releases yet/i)).toBeDefined();
    expect(screen.getByRole('link', { name: /go to releases/i })).toBeDefined();
  });

  it('hides the releases CTA for qa users when no releases exist', async () => {
    await act(async () => {
      render(<ReportsClient initialSnapshots={[]} userRole={ROLES.QA} />);
    });

    expect(screen.getByText(/no releases yet/i)).toBeDefined();
    expect(screen.queryByRole('link', { name: /go to releases/i })).toBeNull();
  });
});

describe('ReportsClient — Create report flow', () => {
  let mockDocSave;
  let mockDocOutput;

  beforeEach(() => {
    vi.clearAllMocks();
    withReleases();
    mockExportData.mockResolvedValue(FIXTURE_CASES);
    mockListSnapshots.mockResolvedValue([]);

    mockDocSave = vi.fn();
    mockDocOutput = vi.fn(
      () => new Blob(['%PDF'], { type: 'application/pdf' }),
    );
    mockGenerateSignoffReport.mockResolvedValue({
      save: mockDocSave,
      output: mockDocOutput,
    });
  });

  it('downloads locally AND warns when the saved-copy upload fails', async () => {
    mockSaveSnapshot.mockRejectedValue(new Error('network error'));

    await act(async () => {
      render(<ReportsClient initialSnapshots={[]} userRole={ROLES.ADMIN} />);
    });

    const createBtn = screen.getByRole('button', { name: /create report/i });
    await act(async () => {
      await userEvent.click(createBtn);
    });

    expect(mockDocSave).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringMatching(/saving the copy failed/i),
      'warning',
    );
  });

  it('shows a success toast and refreshes when the upload succeeds', async () => {
    mockSaveSnapshot.mockResolvedValue({ _id: 's2' });
    mockListSnapshots.mockResolvedValue([
      {
        _id: 's2',
        releaseId: 'rel-1',
        releaseName: 'v2.5',
        environment: 'QA',
        generatedBy: 'Alice',
        generatedAt: '2026-06-01T11:00:00.000Z',
      },
    ]);

    await act(async () => {
      render(<ReportsClient initialSnapshots={[]} userRole={ROLES.ADMIN} />);
    });

    const createBtn = screen.getByRole('button', { name: /create report/i });
    await act(async () => {
      await userEvent.click(createBtn);
    });

    expect(mockDocSave).toHaveBeenCalledTimes(1);
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringMatching(/created and downloaded/i),
      'success',
    );
    expect(mockListSnapshots).toHaveBeenCalled();
  });

  it('shows an info toast and does not upload when there are no cases', async () => {
    mockExportData.mockResolvedValue([]);

    await act(async () => {
      render(<ReportsClient initialSnapshots={[]} userRole={ROLES.ADMIN} />);
    });

    const createBtn = screen.getByRole('button', { name: /create report/i });
    await act(async () => {
      await userEvent.click(createBtn);
    });

    expect(mockSaveSnapshot).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringMatching(/no test cases to report on/i),
      'info',
    );
  });
});

describe('ReportsClient — Excel flow writes no saved copy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withReleases();
    mockListSnapshots.mockResolvedValue([]);
    mockExportData.mockResolvedValue(FIXTURE_CASES);
  });

  it('does not call saveSnapshot when exporting Excel', async () => {
    await act(async () => {
      render(<ReportsClient initialSnapshots={[]} userRole={ROLES.ADMIN} />);
    });

    const excelBtn = screen.getByRole('button', { name: /export excel/i });
    await act(async () => {
      await userEvent.click(excelBtn);
    });

    expect(mockSaveSnapshot).not.toHaveBeenCalled();
    expect(mockXlsxWriteFile).toHaveBeenCalledTimes(1);
  });
});

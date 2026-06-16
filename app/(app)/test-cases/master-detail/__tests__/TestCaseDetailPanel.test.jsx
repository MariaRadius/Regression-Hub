import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listCaseResults } = vi.hoisted(() => ({
  listCaseResults: vi.fn(),
}));
const { listTestCaseEventsForRelease } = vi.hoisted(() => ({
  listTestCaseEventsForRelease: vi.fn(),
}));
const { getSettings } = vi.hoisted(() => ({
  getSettings: vi.fn(() => Promise.resolve({ qaUsers: [] })),
}));

vi.mock('@/lib/api/results', () => ({
  listCaseResults,
}));

vi.mock('@/lib/api/releases', () => ({
  listTestCaseEventsForRelease,
}));

vi.mock('@/lib/api/settings', () => ({
  getSettings,
}));

import TestCaseDetailPanel from '../TestCaseDetailPanel';

// TestCaseDetail reads team settings via react-query (Jira issue link), so
// the panel needs a QueryClientProvider in tests.
function render(ui) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const baseCase = {
  _id: 'tc-1',
  testKey: 'PPO-0399',
  testCase: 'Validate the patient list table renders the latest exam dates.',
  applicationName: 'Practice Admin',
  moduleName: 'Patients Management',
  expectedResult: 'Patient list is visible.',
  status: 'Pass',
};

describe('TestCaseDetailPanel history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listCaseResults.mockResolvedValue([]);
    listTestCaseEventsForRelease.mockResolvedValue([
      {
        _id: 'evt-1',
        category: 'result',
        action: 'pass',
        environment: 'QA',
        status: 'Pass',
        by: 'Farah',
        at: '2026-06-05T07:00:00.000Z',
      },
    ]);
  });

  it('lazy-loads history only after the history button is clicked and can close it without losing context', async () => {
    render(
      <TestCaseDetailPanel
        open
        displayCase={baseCase}
        releaseId='rel-1'
        environments={['QA']}
        onEdit={vi.fn()}
        onAction={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(listCaseResults).toHaveBeenCalledWith('rel-1', 'tc-1');
    });

    expect(listTestCaseEventsForRelease).not.toHaveBeenCalled();
    expect(
      screen.getAllByText(
        'Validate the patient list table renders the latest exam dates.',
      )[0],
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getAllByRole('button', { name: /history/i })[0],
    );

    await waitFor(() => {
      expect(listTestCaseEventsForRelease).toHaveBeenCalledWith(
        'rel-1',
        'tc-1',
      );
    });

    expect(await screen.findAllByText(/Updated by Farah/i)).not.toHaveLength(0);
    expect(
      await screen.findAllByText(/updated QA execution/i),
    ).not.toHaveLength(0);

    await userEvent.click(
      screen.getAllByRole('button', { name: /hide history/i })[0],
    );

    expect(screen.queryByText(/Updated by Farah/i)).not.toBeInTheDocument();
    expect(
      screen.getAllByText(
        'Validate the patient list table renders the latest exam dates.',
      )[0],
    ).toBeInTheDocument();
  });
});

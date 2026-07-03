import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/jira', () => ({ analyzeStoryImpact: vi.fn() }));
vi.mock('@/lib/api/testCases', () => ({
  updateTestCaseContent: vi.fn().mockResolvedValue({}),
  deleteTestCaseById: vi.fn().mockResolvedValue({}),
  createTestCaseInRelease: vi.fn().mockResolvedValue({ _id: 'new-tc' }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/contexts/ReleaseEnvContext', () => ({
  useReleaseEnv: vi.fn(() => ({ releaseId: 'rel-1' })),
}));

import * as ReleaseEnvContext from '@/contexts/ReleaseEnvContext';
import { analyzeStoryImpact } from '@/lib/api/jira';
import { updateTestCaseContent } from '@/lib/api/testCases';
import JiraImpactAnalysisDialog from '../JiraImpactAnalysisDialog';

const APPS = [{ _id: 'app1', name: 'App A' }];
const MODS = [{ _id: 'mod1', name: 'Module X', applicationId: 'app1' }];
const MOCK_IMPACT = {
  affectedCases: [
    { id: 'tc1', reason: 'Story changed', update: { testCase: 'New title' } },
  ],
  newCases: [
    {
      testCase: 'SSO login',
      preconditions: '',
      steps: '<ol><li>Click SSO</li></ol>',
      expectedResult: 'Logged in via SSO',
      priority: 'High',
      type: 'Functional Test',
    },
  ],
  obsoleteCases: [{ id: 'tc2', reason: 'No longer relevant' }],
};

function renderDialog(overrides = {}) {
  return render(
    <JiraImpactAnalysisDialog
      open={true}
      storyKey='RXR-1'
      jiraSummary='Login flow'
      onClose={vi.fn()}
      onApplied={vi.fn()}
      applications={APPS}
      modules={MODS}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  analyzeStoryImpact.mockResolvedValue({
    story: { key: 'RXR-1', summary: 'Login flow', acceptanceCriteria: '' },
    impact: MOCK_IMPACT,
  });
});

describe('JiraImpactAnalysisDialog', () => {
  it('shows skeleton while fetching', () => {
    analyzeStoryImpact.mockReturnValue(new Promise(() => {}));
    renderDialog();
    expect(document.querySelector('.MuiSkeleton-root')).toBeTruthy();
  });

  it('renders three accordion sections after load', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText(/update affected/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/add new/i)).toBeInTheDocument();
    expect(screen.getByText(/remove obsolete/i)).toBeInTheDocument();
  });

  it('shows error alert when analyzeStoryImpact rejects', async () => {
    analyzeStoryImpact.mockRejectedValue(new Error('AI unavailable'));
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText(/ai unavailable/i)).toBeInTheDocument(),
    );
  });

  it('calls updateTestCaseContent when Apply is clicked with checked affected case', async () => {
    const onApplied = vi.fn();
    renderDialog({ onApplied });
    await waitFor(() =>
      expect(screen.getByText(/update affected/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() =>
      expect(updateTestCaseContent).toHaveBeenCalledWith(
        'rel-1',
        'tc1',
        { testCase: 'New title' },
        expect.objectContaining({ suppressToastForStatus: expect.any(Array) }),
      ),
    );
    expect(onApplied).toHaveBeenCalledWith(
      expect.objectContaining({ updated: 1 }),
    );
  });

  it('shows a success summary listing what changed after Apply succeeds', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText(/update affected/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() =>
      expect(screen.getByText(/changes applied/i)).toBeInTheDocument(),
    );
    // Summary line reflects the applied counts
    expect(screen.getByText(/1 updated/)).toBeInTheDocument();
    // Per-item listing shows the new case title and the updated field
    expect(screen.getByText(/SSO login/)).toBeInTheDocument();
    expect(screen.getByText(/testCase/)).toBeInTheDocument();
    // Footer collapses to a single Done button
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^apply/i }),
    ).not.toBeInTheDocument();
  });

  it('returns to the changes view when the back button is clicked from the summary', async () => {
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText(/update affected/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    await waitFor(() =>
      expect(screen.getByText(/changes applied/i)).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /back to changes/i }));
    // The accordion changes view is shown again, summary is gone
    expect(screen.getByText(/update affected/i)).toBeInTheDocument();
    expect(screen.queryByText(/changes applied/i)).not.toBeInTheDocument();
  });

  it('shows "Select a release" warning and disables Apply when releaseId is null', async () => {
    vi.mocked(ReleaseEnvContext.useReleaseEnv).mockReturnValue({
      releaseId: null,
    });
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText(/update affected/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/select a release/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled();
  });
});
